import express from 'express';
import Joi from 'joi';
import { aiService } from '../services/aiService.js';
import { youtubeTranscriptService } from '../services/youtubeTranscriptService.js';
import {
  HISTORY_LIST_COLUMNS,
  HISTORY_LIST_COLUMNS_FALLBACK,
  hydrateLessonResponse,
  pickLessonToReuse,
  pickProgressFields,
} from '../services/videoLessonProgress.js';
import {
  sampleTranscriptForAnalysis,
  capCues,
} from '../services/youtubeAnalyzeHelpers.js';
import { publicAiFailure, createPublicAiError } from '../services/aiConfig.js';
const router = express.Router();

const CHAPTER_MIN_DURATION_SEC = 8 * 60; // AI chapters if no YT chapters and long enough
/** Keep analyze under Cloudflare/cloudflared ~100s proxy budget */
const ANALYZE_VOCAB_SAMPLE_CHARS = 5000; // <= aiService chunk size → single AI call
const ANALYZE_SUMMARY_SAMPLE_CHARS = 12000;
const ANALYZE_VOCAB_CHUNKS = 1;
const ANALYZE_MAX_CUES = 2500;

const analyzeSchema = Joi.object({
  videoUrl: Joi.string().uri().required(),
  lessonId: Joi.string().uuid().optional().allow(null),
});

const quizSchema = Joi.object({
  videoUrl: Joi.string().uri().required(),
  lessonId: Joi.string().uuid().optional(),
  vocabularyWordIds: Joi.array().items(Joi.string().uuid()).optional(),
  vocabularyWords: Joi.array().items(Joi.string().min(1).max(200)).optional(),
  questionCount: Joi.number().integer().min(3).max(15).default(8),
});

const progressSchema = Joi.object({
  currentStep: Joi.number().integer().min(2).max(4),
  vocabularySnapshot: Joi.array().max(80),
  studyWordsSnapshot: Joi.array().max(80),
  quizQuestions: Joi.array().max(20),
  quizAnswers: Joi.object().max(20),
  status: Joi.string().valid('analyzed', 'quiz_generated', 'completed'),
  userCefrLevel: Joi.string().max(10),
}).min(1);

function normalizeChapters(chapters) {
  if (!Array.isArray(chapters) || !chapters.length) return [];
  return chapters
    .map((ch) => ({
      start: Number(ch.start) || 0,
      end: ch.end != null ? Number(ch.end) : null,
      title: String(ch.title || 'Chapter').trim(),
      source: ch.source || 'youtube',
    }))
    .sort((a, b) => a.start - b.start);
}

async function loadCachedTranscript(supabase, userId, lessonId, videoUrl) {
  if (lessonId) {
    const { data } = await supabase
      .from('video_lessons')
      .select('id, video_id, transcript_text, transcript_cues, chapters, summary, duration_seconds')
      .eq('id', lessonId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.transcript_text) return data;
  }

  if (videoUrl) {
    const videoId = youtubeTranscriptService.extractVideoId(videoUrl);
    if (!videoId) return null;
    const { data } = await supabase
      .from('video_lessons')
      .select('id, video_id, transcript_text, transcript_cues, chapters, summary, duration_seconds')
      .eq('user_id', userId)
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.transcript_text) return data;
  }

  return null;
}

// POST /api/youtube/analyze
router.post('/analyze', async (req, res, next) => {
  try {
    const { error, value } = analyzeSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { videoUrl, lessonId: requestedLessonId } = value;

    const aiConfigError = aiService.configurationError();
    if (aiConfigError) {
      return res.status(503).json({
        error: 'ai_not_configured',
        message: aiConfigError,
      });
    }

    let userCefrLevel = 'B2';
    try {
      const { data: profile } = await req.supabase
        .from('profiles')
        .select('cefr_level')
        .eq('id', req.user.id)
        .single();
      if (profile?.cefr_level) {
        userCefrLevel = profile.cefr_level;
      }
    } catch (err) {
      console.log('Could not fetch user CEFR level, using default B2');
    }

    console.log(`🎥 Extracting transcript for: ${videoUrl}`);
    const transcriptResult = await youtubeTranscriptService.processYouTubeUrl(videoUrl, {
      transcript24TimeoutMs: 60000,
      metaTimeoutMs: 8000,
    });

    if (!transcriptResult.success) {
      return res.status(400).json({
        error: 'youtube_transcript_failed',
        message: transcriptResult.error,
      });
    }

    const {
      content,
      title,
      videoInfo,
      cues: rawCues = [],
      chapters: rawChapters = [],
      provider = null,
      mode = null,
    } = transcriptResult;
    const videoId = youtubeTranscriptService.extractVideoId(videoUrl);
    const durationSeconds =
      typeof videoInfo?.duration === 'number' ? videoInfo.duration : null;

    // Bound cue payload size for long interviews (DB insert + JSON response)
    const cues = capCues(rawCues, ANALYZE_MAX_CUES);
    const vocabText = sampleTranscriptForAnalysis(content, ANALYZE_VOCAB_SAMPLE_CHARS);
    const summaryText = sampleTranscriptForAnalysis(content, ANALYZE_SUMMARY_SAMPLE_CHARS);

    let knownWords = new Set();
    let learnedWords = new Set();
    try {
      const [knownResult, wordsResult] = await Promise.all([
        req.supabase.from('known_words').select('word').eq('user_id', req.user.id),
        req.supabase.from('words').select('word').eq('user_id', req.user.id),
      ]);
      knownWords = new Set((knownResult.data || []).map((k) => k.word.toLowerCase()));
      learnedWords = new Set((wordsResult.data || []).map((w) => w.word.toLowerCase()));
    } catch (err) {
      console.log('Could not fetch known/learned words:', err.message);
    }

    let chapters = normalizeChapters(rawChapters);
    const needAiChapters =
      chapters.length === 0 &&
      (durationSeconds == null || durationSeconds >= CHAPTER_MIN_DURATION_SEC);

    // Vocab + summary in parallel — sequential 6-chunk AI was the main 502 cause on long videos
    console.log(
      `🤖 Analyzing vocabulary at ${userCefrLevel} (vocab sample ${vocabText.length}/${content.length} chars) + summary...`
    );

    const [vocabSettled, summarySettled] = await Promise.allSettled([
      aiService.analyzeWebsiteContent(vocabText, userCefrLevel, {
        limit: 30,
        chunksToProcess: ANALYZE_VOCAB_CHUNKS,
        chunkTimeout: 45000,
      }),
      aiService.summarizeAndChapter({
        transcript: summaryText,
        title: title || videoInfo?.title || '',
        durationSeconds,
        existingChapters: chapters.length ? chapters : null,
        needChapters: needAiChapters,
      }),
    ]);

    let vocabulary = [];
    const warnings = [];
    if (vocabSettled.status === 'fulfilled') {
      vocabulary = (vocabSettled.value.vocabulary || []).map((item) => ({
        ...item,
        isKnown: knownWords.has(item.word.toLowerCase()),
        isLearned: learnedWords.has(item.word.toLowerCase()),
      }));
    } else {
      const mapped = publicAiFailure(vocabSettled.reason);
      console.warn('Vocabulary analysis failed:', vocabSettled.reason?.message);
      warnings.push(`Vocabulary: ${mapped.message}`);
    }

    let summary = '';
    if (summarySettled.status === 'fulfilled') {
      summary = summarySettled.value.summary || '';
      if (summarySettled.value.chapters?.length) {
        chapters = normalizeChapters(summarySettled.value.chapters);
      }
    } else {
      const mapped = publicAiFailure(summarySettled.reason);
      console.warn('Summary/chapter generation failed:', summarySettled.reason?.message);
      warnings.push(`Highlights: ${mapped.message}`);
    }

    let lessonId = null;
    const baseLesson = {
      user_id: req.user.id,
      video_url: videoUrl,
      video_id: videoId,
      title: title || videoInfo?.title,
      thumbnail_url: videoInfo?.thumbnail || null,
      status: 'analyzed',
    };
    const cacheLesson = {
      ...baseLesson,
      transcript_cues: cues,
      transcript_text: content,
      summary: summary || null,
      chapters: chapters.length ? chapters : null,
      duration_seconds: durationSeconds,
      transcript_provider: provider,
    };
    const checkpointLesson = {
      ...cacheLesson,
      current_step: 2,
      user_cefr_level: userCefrLevel,
      vocabulary_snapshot: vocabulary,
    };

    try {
      const candidates = [];
      if (requestedLessonId) {
        const { data: owned } = await req.supabase
          .from('video_lessons')
          .select('id, video_id, status, updated_at, created_at')
          .eq('id', requestedLessonId)
          .eq('user_id', req.user.id)
          .maybeSingle();
        if (owned) candidates.push(owned);
      }
      if (videoId) {
        const { data: sameVideo } = await req.supabase
          .from('video_lessons')
          .select('id, video_id, status, updated_at, created_at')
          .eq('user_id', req.user.id)
          .eq('video_id', videoId)
          .order('updated_at', { ascending: false })
          .limit(10);
        candidates.push(...(sameVideo || []));
      }
      const reuseId = pickLessonToReuse(candidates, {
        lessonId: requestedLessonId,
        videoId,
      });

      const attempts = [checkpointLesson, cacheLesson, baseLesson];
      if (reuseId) {
        for (const row of attempts) {
          const patch = { ...row };
          delete patch.user_id;
          patch.updated_at = new Date().toISOString();
          const { data: lesson, error: lessonErr } = await req.supabase
            .from('video_lessons')
            .update(patch)
            .eq('id', reuseId)
            .eq('user_id', req.user.id)
            .select('id')
            .maybeSingle();
          if (!lessonErr && lesson) {
            lessonId = lesson.id;
            break;
          }
          console.warn('Lesson update attempt failed:', lessonErr?.message);
        }
      }
      if (!lessonId) {
        for (const row of attempts) {
          const { data: lesson, error: lessonErr } = await req.supabase
            .from('video_lessons')
            .insert(row)
            .select('id')
            .single();
          if (!lessonErr && lesson) {
            lessonId = lesson.id;
            break;
          }
          console.warn('Lesson insert attempt failed:', lessonErr?.message);
        }
      }
    } catch (err) {
      console.log('Could not save video lesson:', err.message);
    }

    res.json({
      success: true,
      lessonId,
      videoInfo: {
        videoId,
        title: title || videoInfo?.title,
        thumbnail: videoInfo?.thumbnail || null,
        duration: durationSeconds,
        channel: videoInfo?.channel || videoInfo?.uploader || null,
      },
      vocabulary,
      cues,
      summary,
      chapters,
      transcriptProvider: provider,
      transcriptMode: mode,
      transcriptPreview: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
      transcriptLength: content.length,
      cuesTotal: Array.isArray(rawCues) ? rawCues.length : 0,
      cuesReturned: cues.length,
      userCefrLevel,
      totalFound: vocabulary.length,
      knownCount: vocabulary.filter((v) => v.isKnown).length,
      learnedCount: vocabulary.filter((v) => v.isLearned && !v.isKnown).length,
      newCount: vocabulary.filter((v) => !v.isKnown && !v.isLearned).length,
      warnings,
    });
  } catch (error) {
    console.error('YouTube analyze error:', error);
    next(error);
  }
});

// POST /api/youtube/quiz
router.post('/quiz', async (req, res, next) => {
  try {
    const { error, value } = quizSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const {
      videoUrl,
      lessonId,
      questionCount,
      vocabularyWords = [],
      vocabularyWordIds = [],
    } = value;

    const aiConfigError = aiService.configurationError();
    if (aiConfigError) {
      return res.status(503).json({
        error: 'ai_not_configured',
        message: aiConfigError,
      });
    }

    let content = null;
    let videoId = youtubeTranscriptService.extractVideoId(videoUrl);
    let cachedLessonId = lessonId || null;

    // Prefer cached transcript
    try {
      const cached = await loadCachedTranscript(
        req.supabase,
        req.user.id,
        lessonId,
        videoUrl
      );
      if (cached?.transcript_text) {
        content = cached.transcript_text;
        videoId = cached.video_id || videoId;
        cachedLessonId = cached.id;
        console.log(`📦 Using cached transcript for lesson ${cached.id}`);
      }
    } catch (cacheErr) {
      console.warn('Cache lookup failed:', cacheErr.message);
    }

    if (!content) {
      console.log(`🎥 Fetching transcript for quiz: ${videoUrl}`);
      const transcriptResult = await youtubeTranscriptService.processYouTubeUrl(videoUrl);

      if (!transcriptResult.success) {
        return res.status(400).json({
          error: 'youtube_transcript_failed',
          message: transcriptResult.error,
        });
      }
      content = transcriptResult.content;
    }

    let userCefrLevel = 'B2';
    try {
      const { data: profile } = await req.supabase
        .from('profiles')
        .select('cefr_level')
        .eq('id', req.user.id)
        .single();
      if (profile?.cefr_level) {
        userCefrLevel = profile.cefr_level;
      }
    } catch (err) {
      console.log('Could not fetch user CEFR level');
    }

    // Resolve vocabulary words from IDs if needed
    let vocabWords = [...vocabularyWords];
    if ((!vocabWords.length) && vocabularyWordIds.length) {
      try {
        const { data: words } = await req.supabase
          .from('words')
          .select('word')
          .eq('user_id', req.user.id)
          .in('id', vocabularyWordIds);
        vocabWords = (words || []).map((w) => w.word);
      } catch (err) {
        console.warn('Could not resolve vocabularyWordIds:', err.message);
      }
    }

    console.log(`🧠 Generating ${questionCount} mixed quiz questions...`);
    const validatedQuestions = await aiService.generateVideoMixedQuiz({
      transcript: content,
      userCefrLevel,
      questionCount,
      vocabularyWords: vocabWords,
    });

    try {
      const quizPatch = {
        quiz_total: validatedQuestions.length,
        status: 'quiz_generated',
        current_step: 4,
        quiz_questions: validatedQuestions,
        updated_at: new Date().toISOString(),
      };
      let query = req.supabase
        .from('video_lessons')
        .update(quizPatch)
        .eq('user_id', req.user.id);

      if (cachedLessonId) {
        query = query.eq('id', cachedLessonId);
      } else {
        query = query.eq('video_id', videoId);
      }
      const { error: quizUpdateErr } = await query;
      if (quizUpdateErr) {
        const { current_step, quiz_questions, updated_at, ...legacyPatch } = quizPatch;
        let fallback = req.supabase
          .from('video_lessons')
          .update(legacyPatch)
          .eq('user_id', req.user.id);
        if (cachedLessonId) fallback = fallback.eq('id', cachedLessonId);
        else fallback = fallback.eq('video_id', videoId);
        await fallback;
      }
    } catch (err) {
      console.log('Could not update video lesson:', err.message);
    }

    res.json({
      success: true,
      videoId,
      lessonId: cachedLessonId,
      questions: validatedQuestions,
      totalQuestions: validatedQuestions.length,
    });
  } catch (error) {
    console.error('YouTube quiz error:', error);
    next(error.expose ? error : createPublicAiError(error));
  }
});

// POST /api/youtube/complete
router.post('/complete', async (req, res, next) => {
  try {
    const schema = Joi.object({
      lessonId: Joi.string().uuid().optional(),
      videoUrl: Joi.string().uri().optional(),
      quizScore: Joi.number().integer().min(0).required(),
      quizTotal: Joi.number().integer().min(1).required(),
      wordsSaved: Joi.number().integer().min(0).default(0),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { lessonId, videoUrl, quizScore, quizTotal, wordsSaved } = value;

    let lesson;
    if (lessonId) {
      const { data } = await req.supabase
        .from('video_lessons')
        .select('id')
        .eq('id', lessonId)
        .eq('user_id', req.user.id)
        .single();
      lesson = data;
    }

    if (!lesson && videoUrl) {
      const videoId = youtubeTranscriptService.extractVideoId(videoUrl);
      const { data } = await req.supabase
        .from('video_lessons')
        .insert({
          user_id: req.user.id,
          video_url: videoUrl,
          video_id: videoId,
          quiz_score: quizScore,
          quiz_total: quizTotal,
          words_saved: wordsSaved,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      lesson = data;
    } else if (lesson) {
      const completePatch = {
        quiz_score: quizScore,
        quiz_total: quizTotal,
        words_saved: wordsSaved,
        status: 'completed',
        current_step: 4,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error: completeErr } = await req.supabase
        .from('video_lessons')
        .update(completePatch)
        .eq('id', lesson.id);
      if (completeErr) {
        const { current_step, updated_at, ...legacyComplete } = completePatch;
        await req.supabase
          .from('video_lessons')
          .update(legacyComplete)
          .eq('id', lesson.id);
      }
    }

    res.json({
      success: true,
      lessonId: lesson?.id || null,
      score: quizScore,
      total: quizTotal,
      percentage: Math.round((quizScore / quizTotal) * 100),
    });
  } catch (error) {
    console.error('Complete lesson error:', error);
    next(error);
  }
});

// POST /api/youtube/mark-known
router.post('/mark-known', async (req, res, next) => {
  try {
    const schema = Joi.object({
      word: Joi.string().min(1).max(200).required(),
      known: Joi.boolean().default(true),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { word, known } = value;
    const normalizedWord = word.toLowerCase().trim();

    if (known) {
      const { error: upsertErr } = await req.supabase
        .from('known_words')
        .upsert(
          {
            user_id: req.user.id,
            word: normalizedWord,
          },
          {
            onConflict: 'user_id,word',
            ignoreDuplicates: true,
          }
        );

      if (upsertErr) {
        try {
          await req.supabase.from('known_words').insert({
            user_id: req.user.id,
            word: normalizedWord,
          });
        } catch (_) {
          // Already exists
        }
      }
    } else {
      await req.supabase
        .from('known_words')
        .delete()
        .eq('user_id', req.user.id)
        .eq('word', normalizedWord);
    }

    res.json({ success: true, word: normalizedWord, known });
  } catch (error) {
    console.error('Mark known error:', error);
    next(error);
  }
});

// GET /api/youtube/history
router.get('/history', async (req, res, next) => {
  try {
    let lessons = [];
    const { data, error } = await req.supabase
      .from('video_lessons')
      .select(HISTORY_LIST_COLUMNS)
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      const fallback = await req.supabase
        .from('video_lessons')
        .select(HISTORY_LIST_COLUMNS_FALLBACK)
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (fallback.error) throw fallback.error;
      lessons = fallback.data || [];
    } else {
      lessons = data || [];
    }

    res.json({
      lessons,
      total: lessons.length,
    });
  } catch (error) {
    console.error('History error:', error);
    next(error);
  }
});

// GET /api/youtube/lessons/:id
router.get('/lessons/:id', async (req, res, next) => {
  try {
    const { error: idError, value } = Joi.string().uuid().required().validate(req.params.id);
    if (idError) {
      idError.isJoi = true;
      return next(idError);
    }

    const { data: lesson, error } = await req.supabase
      .from('video_lessons')
      .select('*')
      .eq('id', value)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!lesson) {
      return res.status(404).json({
        error: 'lesson_not_found',
        message: 'Lesson not found',
      });
    }

    res.json(hydrateLessonResponse(lesson));
  } catch (error) {
    console.error('Get lesson error:', error);
    next(error);
  }
});

// POST /api/youtube/lessons/:id/highlights — generate from cached transcript
router.post('/lessons/:id/highlights', async (req, res, next) => {
  try {
    const { error: idError, value: lessonId } = Joi.string()
      .uuid()
      .required()
      .validate(req.params.id);
    if (idError) {
      idError.isJoi = true;
      return next(idError);
    }

    const aiConfigError = aiService.configurationError();
    if (aiConfigError) {
      return res.status(503).json({
        error: 'ai_not_configured',
        message: aiConfigError,
      });
    }

    const { data: lesson, error } = await req.supabase
      .from('video_lessons')
      .select(
        'id, title, transcript_text, summary, chapters, duration_seconds'
      )
      .eq('id', lessonId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!lesson) {
      return res.status(404).json({
        error: 'lesson_not_found',
        message: 'Lesson not found',
      });
    }

    const transcript = lesson.transcript_text || '';
    if (transcript.trim().length < 80) {
      return res.status(400).json({
        error: 'transcript_missing',
        message: 'This session has no transcript to summarize. Re-analyze the video.',
      });
    }

    const existingChapters = normalizeChapters(lesson.chapters);
    const summaryText = sampleTranscriptForAnalysis(
      transcript,
      ANALYZE_SUMMARY_SAMPLE_CHARS
    );

    console.log(`📝 Generating highlights for lesson ${lessonId}...`);
    const result = await aiService.summarizeAndChapter({
      transcript: summaryText,
      title: lesson.title || '',
      durationSeconds: lesson.duration_seconds,
      existingChapters: existingChapters.length ? existingChapters : null,
      needChapters: existingChapters.length === 0,
    });

    const summary = result.summary || '';
    const chapters = result.chapters?.length
      ? normalizeChapters(result.chapters)
      : existingChapters;

    if (!summary) {
      return res.status(502).json({
        error: 'highlights_failed',
        message:
          'Could not generate highlights for this video. Try again in a moment.',
        summary: '',
        chapters,
      });
    }

    const { error: updateErr } = await req.supabase
      .from('video_lessons')
      .update({
        summary,
        chapters: chapters.length ? chapters : lesson.chapters || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lessonId)
      .eq('user_id', req.user.id);

    if (updateErr) {
      console.warn('Could not persist highlights:', updateErr.message);
    }

    res.json({
      success: true,
      lessonId,
      summary,
      chapters,
    });
  } catch (error) {
    console.error('Generate highlights error:', error);
    next(error.expose ? error : createPublicAiError(error));
  }
});

// DELETE /api/youtube/lessons/:id — remove a learn session (keeps saved words)
router.delete('/lessons/:id', async (req, res, next) => {
  try {
    const { error: idError, value: lessonId } = Joi.string()
      .uuid()
      .required()
      .validate(req.params.id);
    if (idError) {
      idError.isJoi = true;
      return next(idError);
    }

    const { data, error } = await req.supabase
      .from('video_lessons')
      .delete()
      .eq('id', lessonId)
      .eq('user_id', req.user.id)
      .select('id');

    if (error) throw error;
    if (!data?.length) {
      return res.status(404).json({
        error: 'lesson_not_found',
        message: 'Lesson not found',
      });
    }

    res.json({ success: true, deleted: true, lessonId });
  } catch (error) {
    console.error('Delete lesson error:', error);
    next(error);
  }
});

// DELETE /api/youtube/history — remove all of the user's learn sessions
router.delete('/history', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('video_lessons')
      .delete()
      .eq('user_id', req.user.id)
      .select('id');

    if (error) throw error;

    res.json({
      success: true,
      deleted: true,
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('Clear lesson history error:', error);
    next(error);
  }
});

// PATCH /api/youtube/lessons/:id/progress
router.patch('/lessons/:id/progress', async (req, res, next) => {
  try {
    const { error: idError, value: lessonId } = Joi.string()
      .uuid()
      .required()
      .validate(req.params.id);
    if (idError) {
      idError.isJoi = true;
      return next(idError);
    }

    const { error, value } = progressSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { data: existing, error: existingErr } = await req.supabase
      .from('video_lessons')
      .select('id')
      .eq('id', lessonId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (existingErr) throw existingErr;
    if (!existing) {
      return res.status(404).json({
        error: 'lesson_not_found',
        message: 'Lesson not found',
      });
    }

    const patch = pickProgressFields(value);
    const { data: updated, error: updateErr } = await req.supabase
      .from('video_lessons')
      .update(patch)
      .eq('id', lessonId)
      .eq('user_id', req.user.id)
      .select('id, current_step, status, updated_at')
      .single();

    if (updateErr) throw updateErr;

    res.json({
      success: true,
      lessonId,
      currentStep: updated?.current_step ?? value.currentStep ?? null,
      status: updated?.status ?? value.status ?? null,
      updatedAt: updated?.updated_at ?? patch.updated_at,
    });
  } catch (error) {
    console.error('Save lesson progress error:', error);
    next(error);
  }
});

export default router;
