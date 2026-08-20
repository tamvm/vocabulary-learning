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
  summarizeHistoryLesson,
} from '../services/videoLessonProgress.js';
import {
  enqueueLessonPrepare,
  patchLessonPrepare,
  resolvePrepareStatus,
  resolveSummaryStatus,
  buildPrepareJobView,
  resumeLessonPrepareIfNeeded,
  isPrepareJobInFlight,
  PREPARE_STATUS,
  PREPARE_STEPS,
  SUMMARY_STATUS,
} from '../services/lessonPrepareJob.js';

const router = express.Router();

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
  title: Joi.string().trim().min(1).max(200),
}).min(1);

function resumePendingLessonJobs(supabase, userId, pendingIds) {
  for (const id of (pendingIds || []).slice(0, 8)) {
    if (!id || isPrepareJobInFlight(id)) continue;
    supabase
      .from('video_lessons')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) resumeLessonPrepareIfNeeded({ supabase, userId, lesson: data });
      })
      .catch((err) => {
        console.warn('Resume prepare failed:', err?.message || err);
      });
  }
}

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
      .select('id, video_id, transcript_text, transcript_cues, chapters, summary, duration_seconds, quiz_questions')
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
      .select('id, video_id, transcript_text, transcript_cues, chapters, summary, duration_seconds, quiz_questions')
      .eq('user_id', userId)
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.transcript_text) return data;
  }

  return null;
}

// POST /api/youtube/analyze — persist lesson, run transcript→vocab→highlights→quiz off-request
router.post('/analyze', async (req, res, next) => {
  try {
    const { error, value } = analyzeSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { videoUrl, lessonId: requestedLessonId } = value;
    const videoId = youtubeTranscriptService.extractVideoId(videoUrl);
    if (!videoId) {
      return res.status(400).json({
        error: 'invalid_youtube_url',
        message: 'Please paste a valid YouTube URL.',
      });
    }

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

    const candidates = [];
    if (requestedLessonId) {
      const { data: owned } = await req.supabase
        .from('video_lessons')
        .select('*')
        .eq('id', requestedLessonId)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (owned) candidates.push(owned);
    }
    const { data: sameVideo } = await req.supabase
      .from('video_lessons')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('video_id', videoId)
      .order('updated_at', { ascending: false })
      .limit(10);
    candidates.push(...(sameVideo || []));

    const reuseId = pickLessonToReuse(candidates, {
      lessonId: requestedLessonId,
      videoId,
    });

    const stub = {
      user_id: req.user.id,
      video_url: videoUrl,
      video_id: videoId,
      status: 'analyzed',
      current_step: 2,
      user_cefr_level: userCefrLevel,
      prepare_status: PREPARE_STATUS.pending,
      prepare_step: PREPARE_STEPS.transcript,
      prepare_error: null,
      summary_status: SUMMARY_STATUS.pending,
      vocabulary_snapshot: null,
      quiz_questions: null,
    };

    let lessonId = reuseId || null;
    if (reuseId) {
      const patch = { ...stub };
      delete patch.user_id;
      const err = await patchLessonPrepare(req.supabase, req.user.id, reuseId, patch);
      if (err) {
        console.warn('Lesson reuse patch failed:', err.message);
      }
    } else {
      const attempts = [
        stub,
        {
          user_id: stub.user_id,
          video_url: stub.video_url,
          video_id: stub.video_id,
          status: stub.status,
        },
      ];
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

    if (!lessonId) {
      return res.status(500).json({
        error: 'lesson_create_failed',
        message: 'Could not start this Learn session. Try again.',
      });
    }

    const reused = candidates.find((row) => row.id === lessonId) || {};
    enqueueLessonPrepare({
      supabase: req.supabase,
      userId: req.user.id,
      lesson: {
        ...reused,
        ...stub,
        id: lessonId,
        vocabulary_snapshot: null,
        quiz_questions: null,
        summary: null,
        transcript_text: reused.transcript_text || null,
        transcript_cues: reused.transcript_cues || null,
      },
    });

    return res.status(202).json({
      success: true,
      status: PREPARE_STATUS.pending,
      lessonId,
      videoInfo: {
        videoId,
        title: reused.title || null,
        thumbnail: reused.thumbnail_url || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        duration: reused.duration_seconds ?? null,
        channel: null,
      },
      vocabulary: [],
      cues: [],
      summary: '',
      chapters: [],
      userCefrLevel,
      vocabReady: false,
      prepareStatus: PREPARE_STATUS.pending,
      prepareStep: PREPARE_STEPS.transcript,
      prepareJob: buildPrepareJobView({
        prepare_status: PREPARE_STATUS.pending,
        prepare_step: PREPARE_STEPS.transcript,
      }),
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

    const { videoUrl, lessonId } = value;

    const aiConfigError = aiService.configurationError();
    if (aiConfigError) {
      return res.status(503).json({
        error: 'ai_not_configured',
        message: aiConfigError,
      });
    }

    const cached = await loadCachedTranscript(
      req.supabase,
      req.user.id,
      lessonId,
      videoUrl
    );
    const cachedLessonId = cached?.id || lessonId || null;

    if (Array.isArray(cached?.quiz_questions) && cached.quiz_questions.length) {
      return res.json({
        success: true,
        status: 'ready',
        videoId: cached.video_id || youtubeTranscriptService.extractVideoId(videoUrl),
        lessonId: cachedLessonId,
        questions: cached.quiz_questions,
        totalQuestions: cached.quiz_questions.length,
      });
    }

    if (cachedLessonId) {
      const { data: lesson } = await req.supabase
        .from('video_lessons')
        .select('*')
        .eq('id', cachedLessonId)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (lesson) {
        const prep = resolvePrepareStatus(lesson);
        if (prep !== PREPARE_STATUS.pending) {
          await patchLessonPrepare(req.supabase, req.user.id, lesson.id, {
            prepare_status: PREPARE_STATUS.pending,
            prepare_step: PREPARE_STEPS.quiz,
            quiz_questions: null,
          });
        }
        enqueueLessonPrepare({
          supabase: req.supabase,
          userId: req.user.id,
          lesson: { ...lesson, quiz_questions: null },
        });
        return res.status(202).json({
          success: true,
          status: PREPARE_STATUS.pending,
          lessonId: lesson.id,
          questions: [],
        });
      }
    }

    return res.status(400).json({
      error: 'lesson_not_found',
      message: 'Start the video from Learn first, then take the quiz.',
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
      .limit(100);

    if (error) {
      const fallback = await req.supabase
        .from('video_lessons')
        .select(HISTORY_LIST_COLUMNS_FALLBACK)
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (fallback.error) throw fallback.error;
      lessons = fallback.data || [];
    } else {
      lessons = data || [];
    }

    const pendingIds = lessons
      .filter((row) => row.prepare_status === PREPARE_STATUS.pending)
      .map((row) => row.id);
    resumePendingLessonJobs(req.supabase, req.user.id, pendingIds);

    res.json({
      lessons: lessons.map(summarizeHistoryLesson),
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

    resumeLessonPrepareIfNeeded({
      supabase: req.supabase,
      userId: req.user.id,
      lesson,
    });

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
      .select('*')
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
      if (resolvePrepareStatus(lesson) === PREPARE_STATUS.pending) {
        return res.status(202).json({
          success: true,
          lessonId,
          status: SUMMARY_STATUS.pending,
          summary: '',
          chapters: [],
        });
      }
      return res.status(400).json({
        error: 'transcript_missing',
        message: 'This session has no transcript to summarize. Re-analyze the video.',
      });
    }

    const existingChapters = normalizeChapters(lesson.chapters);
    const status = resolveSummaryStatus(lesson);
    const existingSummary =
      status === SUMMARY_STATUS.ready ? lesson.summary || '' : '';

    if (
      existingSummary &&
      status !== SUMMARY_STATUS.pending &&
      status !== SUMMARY_STATUS.failed
    ) {
      return res.json({
        success: true,
        lessonId,
        status: SUMMARY_STATUS.ready,
        summary: existingSummary,
        chapters: existingChapters,
      });
    }

    if (status === SUMMARY_STATUS.pending) {
      return res.status(202).json({
        success: true,
        lessonId,
        status: SUMMARY_STATUS.pending,
        summary: existingSummary || '',
        chapters: existingChapters,
      });
    }

    await patchLessonPrepare(req.supabase, req.user.id, lessonId, {
      summary_status: SUMMARY_STATUS.pending,
      summary_error: null,
      prepare_status: PREPARE_STATUS.pending,
    });
    enqueueLessonPrepare({
      supabase: req.supabase,
      userId: req.user.id,
      lesson,
    });

    return res.status(202).json({
      success: true,
      lessonId,
      status: SUMMARY_STATUS.pending,
      summary: '',
      chapters: existingChapters,
    });
  } catch (error) {
    console.error('Generate highlights error:', error);
    next(error);
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
