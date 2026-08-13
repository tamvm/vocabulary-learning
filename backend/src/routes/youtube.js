import express from 'express';
import Joi from 'joi';
import { aiService } from '../services/aiService.js';
import { youtubeTranscriptService } from '../services/youtubeTranscriptService.js';

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

const VALID_STEPS = new Set(['vocab', 'study', 'quiz', 'completed']);

const HISTORY_SELECT =
  'id, video_url, video_id, title, thumbnail_url, status, current_step, words_saved, quiz_score, quiz_total, completed_at, created_at, updated_at';

const LESSON_RESUME_SELECT = `${HISTORY_SELECT}, duration_seconds, transcript_cues, summary, chapters, vocabulary, study_words, quiz_questions, user_cefr_level, transcript_provider`;

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

function deriveCurrentStep(lesson) {
  if (lesson?.current_step && VALID_STEPS.has(lesson.current_step)) {
    return lesson.current_step;
  }
  if (lesson?.status === 'completed') return 'completed';
  if (lesson?.status === 'quiz_generated') return 'quiz';
  return 'vocab';
}

function toHistoryItem(lesson) {
  return {
    id: lesson.id,
    videoUrl: lesson.video_url,
    videoId: lesson.video_id,
    title: lesson.title,
    thumbnailUrl: lesson.thumbnail_url,
    status: lesson.status,
    currentStep: deriveCurrentStep(lesson),
    wordsSaved: lesson.words_saved ?? 0,
    quizScore: lesson.quiz_score,
    quizTotal: lesson.quiz_total,
    completedAt: lesson.completed_at,
    createdAt: lesson.created_at,
    updatedAt: lesson.updated_at,
  };
}

function toResumePayload(lesson) {
  const currentStep = deriveCurrentStep(lesson);
  return {
    ...toHistoryItem(lesson),
    videoInfo: {
      videoId: lesson.video_id,
      title: lesson.title,
      thumbnail: lesson.thumbnail_url || null,
      duration: lesson.duration_seconds ?? null,
      channel: null,
    },
    cues: Array.isArray(lesson.transcript_cues) ? lesson.transcript_cues : [],
    summary: lesson.summary || '',
    chapters: normalizeChapters(lesson.chapters),
    vocabulary: Array.isArray(lesson.vocabulary) ? lesson.vocabulary : [],
    studyWords: Array.isArray(lesson.study_words) ? lesson.study_words : [],
    questions: Array.isArray(lesson.quiz_questions) ? lesson.quiz_questions : [],
    userCefrLevel: lesson.user_cefr_level || 'B2',
    transcriptProvider: lesson.transcript_provider || null,
    currentStep,
  };
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
    try {
      const { data: lesson, error: lessonErr } = await req.supabase
        .from('video_lessons')
        .insert({
          user_id: req.user.id,
          video_url: videoUrl,
          video_id: videoId,
          title: title || videoInfo?.title,
          thumbnail_url: videoInfo?.thumbnail || null,
          status: 'analyzed',
          current_step: 'vocab',
          vocabulary,
          user_cefr_level: userCefrLevel,
          transcript_cues: cues,
          transcript_text: content,
          summary: summary || null,
          chapters: chapters.length ? chapters : null,
          duration_seconds: durationSeconds,
          transcript_provider: provider,
        })
        .select('id')
        .single();

      if (lessonErr) {
        // Columns may not exist yet — insert minimal row
        console.warn('Full lesson insert failed, trying minimal:', lessonErr.message);
        const { data: fallbackLesson, error: fallbackErr } = await req.supabase
          .from('video_lessons')
          .insert({
            user_id: req.user.id,
            video_url: videoUrl,
            video_id: videoId,
            title: title || videoInfo?.title,
            thumbnail_url: videoInfo?.thumbnail || null,
            status: 'analyzed',
          })
          .select('id')
          .single();
        if (!fallbackErr && fallbackLesson) {
          lessonId = fallbackLesson.id;
        }
      } else if (lesson) {
        lessonId = lesson.id;
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
      let query = req.supabase
        .from('video_lessons')
        .update({
          quiz_total: validatedQuestions.length,
          quiz_questions: validatedQuestions,
          status: 'quiz_generated',
          current_step: 'quiz',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', req.user.id);

      if (cachedLessonId) {
        query = query.eq('id', cachedLessonId);
      } else {
        query = query.eq('video_id', videoId);
      }
      const { error: quizUpdateErr } = await query;
      if (quizUpdateErr) {
        // Fallback without new columns
        let fallback = req.supabase
          .from('video_lessons')
          .update({
            quiz_total: validatedQuestions.length,
            status: 'quiz_generated',
          })
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
      const { error: completeErr } = await req.supabase
        .from('video_lessons')
        .update({
          quiz_score: quizScore,
          quiz_total: quizTotal,
          words_saved: wordsSaved,
          status: 'completed',
          current_step: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', lesson.id);
      if (completeErr) {
        await req.supabase
          .from('video_lessons')
          .update({
            quiz_score: quizScore,
            quiz_total: quizTotal,
            words_saved: wordsSaved,
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
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
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    let { data: lessons, error } = await req.supabase
      .from('video_lessons')
      .select(HISTORY_SELECT)
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false })
      .limit(limit);

    // Fallback if current_step column missing
    if (error) {
      const fallback = await req.supabase
        .from('video_lessons')
        .select(
          'id, video_url, video_id, title, thumbnail_url, status, words_saved, quiz_score, quiz_total, completed_at, created_at, updated_at'
        )
        .eq('user_id', req.user.id)
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (fallback.error) throw fallback.error;
      lessons = fallback.data;
      error = null;
    }

    const items = (lessons || []).map(toHistoryItem);
    const continueLesson =
      items.find((l) => l.status !== 'completed' && l.currentStep !== 'completed') || null;

    res.json({
      lessons: items,
      continueLesson,
      total: items.length,
    });
  } catch (error) {
    console.error('History error:', error);
    next(error);
  }
});

// GET /api/youtube/lessons/:id — full lesson for cross-device resume
router.get('/lessons/:id', async (req, res, next) => {
  try {
    const { error: idError, value: lessonId } = Joi.string().uuid().required().validate(req.params.id);
    if (idError) {
      idError.isJoi = true;
      return next(idError);
    }

    let { data: lesson, error } = await req.supabase
      .from('video_lessons')
      .select(LESSON_RESUME_SELECT)
      .eq('id', lessonId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) {
      const fallback = await req.supabase
        .from('video_lessons')
        .select('*')
        .eq('id', lessonId)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      lesson = fallback.data;
      error = null;
    }

    if (!lesson) {
      return res.status(404).json({
        error: 'lesson_not_found',
        message: 'Lesson not found',
      });
    }

    res.json({
      success: true,
      lesson: toResumePayload(lesson),
    });
  } catch (error) {
    console.error('Get lesson error:', error);
    next(error);
  }
});

// PATCH /api/youtube/lessons/:id/progress — checkpoint wizard progress
router.patch('/lessons/:id/progress', async (req, res, next) => {
  try {
    const { error: idError, value: lessonId } = Joi.string().uuid().required().validate(req.params.id);
    if (idError) {
      idError.isJoi = true;
      return next(idError);
    }

    const schema = Joi.object({
      currentStep: Joi.string().valid('vocab', 'study', 'quiz', 'completed').optional(),
      studyWords: Joi.array().items(Joi.object().unknown(true)).optional(),
      vocabulary: Joi.array().items(Joi.object().unknown(true)).optional(),
      quizQuestions: Joi.array().items(Joi.object().unknown(true)).optional(),
      wordsSaved: Joi.number().integer().min(0).optional(),
    }).min(1);

    const { error, value } = schema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const updates = {
      updated_at: new Date().toISOString(),
    };
    if (value.currentStep) {
      updates.current_step = value.currentStep;
      if (value.currentStep === 'study' || value.currentStep === 'vocab') {
        updates.status = 'analyzed';
      } else if (value.currentStep === 'quiz') {
        updates.status = 'quiz_generated';
      } else if (value.currentStep === 'completed') {
        updates.status = 'completed';
        updates.completed_at = new Date().toISOString();
      }
    }
    if (value.studyWords !== undefined) updates.study_words = value.studyWords;
    if (value.vocabulary !== undefined) updates.vocabulary = value.vocabulary;
    if (value.quizQuestions !== undefined) updates.quiz_questions = value.quizQuestions;
    if (value.wordsSaved !== undefined) updates.words_saved = value.wordsSaved;

    const { data: lesson, error: updateErr } = await req.supabase
      .from('video_lessons')
      .update(updates)
      .eq('id', lessonId)
      .eq('user_id', req.user.id)
      .select(HISTORY_SELECT)
      .maybeSingle();

    if (updateErr) {
      // Migration not applied yet — acknowledge without failing the client flow
      console.warn('Progress update failed (migration may be pending):', updateErr.message);
      return res.json({
        success: true,
        skipped: true,
        message: 'Progress columns unavailable; continue locally',
      });
    }

    if (!lesson) {
      return res.status(404).json({
        error: 'lesson_not_found',
        message: 'Lesson not found',
      });
    }

    res.json({
      success: true,
      lesson: toHistoryItem(lesson),
    });
  } catch (error) {
    console.error('Progress update error:', error);
    next(error);
  }
});

export default router;
