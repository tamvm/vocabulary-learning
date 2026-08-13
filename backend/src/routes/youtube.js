import express from 'express';
import Joi from 'joi';
import { aiService } from '../services/aiService.js';
import { youtubeTranscriptService } from '../services/youtubeTranscriptService.js';
import {
  HISTORY_LIST_COLUMNS,
  HISTORY_LIST_COLUMNS_FALLBACK,
  hydrateLessonResponse,
  pickProgressFields,
} from '../services/videoLessonProgress.js';

const router = express.Router();

const CHAPTER_MIN_DURATION_SEC = 8 * 60; // AI chapters if no YT chapters and long enough

const analyzeSchema = Joi.object({
  videoUrl: Joi.string().uri().required(),
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
  quizAnswers: Joi.object(),
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

    const { videoUrl } = value;

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
    const transcriptResult = await youtubeTranscriptService.processYouTubeUrl(videoUrl);

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
      cues = [],
      chapters: rawChapters = [],
      provider = null,
      mode = null,
    } = transcriptResult;
    const videoId = youtubeTranscriptService.extractVideoId(videoUrl);
    const durationSeconds =
      typeof videoInfo?.duration === 'number' ? videoInfo.duration : null;

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

    console.log(`🤖 Analyzing vocabulary at ${userCefrLevel} level...`);
    const result = await aiService.analyzeWebsiteContent(content, userCefrLevel, {
      limit: 30,
      chunksToProcess: 6,
    });

    const vocabulary = (result.vocabulary || []).map((item) => ({
      ...item,
      isKnown: knownWords.has(item.word.toLowerCase()),
      isLearned: learnedWords.has(item.word.toLowerCase()),
    }));

    // Summary + chapters
    let summary = '';
    let chapters = normalizeChapters(rawChapters);
    const needAiChapters =
      chapters.length === 0 &&
      (durationSeconds == null || durationSeconds >= CHAPTER_MIN_DURATION_SEC);

    try {
      console.log('🧠 Generating summary' + (needAiChapters ? ' + AI chapters' : '') + '...');
      const studyMeta = await aiService.summarizeAndChapter({
        transcript: content,
        durationSeconds,
        existingChapters: chapters.length ? chapters : null,
        needChapters: needAiChapters,
      });
      summary = studyMeta.summary || '';
      if (studyMeta.chapters?.length) {
        chapters = normalizeChapters(studyMeta.chapters);
      }
    } catch (sumErr) {
      console.warn('Summary/chapter generation failed:', sumErr.message);
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
      const attempts = [checkpointLesson, cacheLesson, baseLesson];
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
      userCefrLevel,
      totalFound: vocabulary.length,
      knownCount: vocabulary.filter((v) => v.isKnown).length,
      learnedCount: vocabulary.filter((v) => v.isLearned && !v.isKnown).length,
      newCount: vocabulary.filter((v) => !v.isKnown && !v.isLearned).length,
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
    next(error);
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
      await req.supabase
        .from('video_lessons')
        .update({
          quiz_score: quizScore,
          quiz_total: quizTotal,
          words_saved: wordsSaved,
          status: 'completed',
          current_step: 4,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', lesson.id);
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
