/**
 * In-process Learn prepare pipeline (single API replica).
 * Steps: transcript → vocabulary → highlights → quiz.
 * Restart drops in-flight work; user retries extract.
 */
import { capCues, sampleTranscriptForAnalysis } from './youtubeAnalyzeHelpers.js';
import { publicAiFailure } from './aiConfig.js';
import { looksLikeTranscriptDump } from './lessonSummaryNormalize.js';

export const PREPARE_STATUS = {
  idle: 'idle',
  pending: 'pending',
  ready: 'ready',
  failed: 'failed',
};

export const PREPARE_STEPS = {
  transcript: 'transcript',
  vocab: 'vocab',
  highlights: 'highlights',
  quiz: 'quiz',
  done: 'done',
};

export const SUMMARY_STATUS = {
  idle: 'idle',
  pending: 'pending',
  ready: 'ready',
  failed: 'failed',
};

export const PREPARE_STALE_MS = 8 * 60 * 1000;

export const PREPARE_STEP_ORDER = [
  PREPARE_STEPS.transcript,
  PREPARE_STEPS.vocab,
  PREPARE_STEPS.highlights,
  PREPARE_STEPS.quiz,
];

const PREPARE_STEP_LABELS = {
  transcript: 'Transcript',
  vocab: 'Vocabulary',
  highlights: 'Highlights',
  quiz: 'Quiz',
};

export function buildPrepareJobView(lesson, nowMs = Date.now()) {
  const status = resolvePrepareStatus(lesson, nowMs);
  const current = lesson?.prepare_step || null;
  const hasTranscript = String(lesson?.transcript_text || '').trim().length >= 80;
  const hasVocab = lesson?.vocabulary_snapshot != null;
  const hasHighlights = Boolean(
    usableSummary(lesson?.summary, lesson?.transcript_text || '')
  );
  const hasQuiz =
    Array.isArray(lesson?.quiz_questions) && lesson.quiz_questions.length > 0;
  const doneFlags = {
    transcript: hasTranscript,
    vocab: hasVocab,
    highlights: hasHighlights,
    quiz: hasQuiz,
  };
  const currentIndex = PREPARE_STEP_ORDER.indexOf(current);

  const steps = PREPARE_STEP_ORDER.map((id, index) => {
    let state = 'queued';
    if (doneFlags[id]) state = 'done';
    else if (status === PREPARE_STATUS.failed && id === current) state = 'failed';
    else if (status === PREPARE_STATUS.pending && id === current) state = 'running';
    else if (status === PREPARE_STATUS.pending && currentIndex >= 0 && index < currentIndex) {
      state = 'done';
    } else if (status === PREPARE_STATUS.ready && id !== PREPARE_STEPS.quiz) {
      state = 'done';
    }
    return { id, label: PREPARE_STEP_LABELS[id], state };
  });

  return {
    status,
    step: current === PREPARE_STEPS.done ? PREPARE_STEPS.done : current,
    error: lesson?.prepare_error || '',
    steps,
  };
}
export const VOCAB_SAMPLE_CHARS = 15000;
export const SUMMARY_SAMPLE_CHARS = 12000;
export const HIGHLIGHTS_JOB_FIRST_MS = 90000;
export const HIGHLIGHTS_JOB_RETRY_MS = 60000;
export const VOCAB_TIMEOUT_MS = 90000;
const MAX_CUES = 2500;

const inFlight = new Set();

export function isPrepareJobInFlight(lessonId) {
  return inFlight.has(lessonId);
}

export function resetPrepareJobsForTests() {
  inFlight.clear();
}

export function resolvePrepareStatus(lesson, nowMs = Date.now()) {
  const status = lesson?.prepare_status || PREPARE_STATUS.idle;
  if (status !== PREPARE_STATUS.pending) return status;
  const started = Date.parse(lesson.updated_at || lesson.created_at || 0) || 0;
  if (started && nowMs - started > PREPARE_STALE_MS) return PREPARE_STATUS.failed;
  return PREPARE_STATUS.pending;
}

export function resolveSummaryStatus(lesson, nowMs = Date.now()) {
  const summary = lesson?.summary || '';
  if (
    summary &&
    !looksLikeTranscriptDump(summary, lesson?.transcript_text || '')
  ) {
    return SUMMARY_STATUS.ready;
  }
  const prepare = resolvePrepareStatus(lesson, nowMs);
  if (prepare === PREPARE_STATUS.pending) return SUMMARY_STATUS.pending;
  if (lesson?.summary_status === SUMMARY_STATUS.failed) return SUMMARY_STATUS.failed;
  if (prepare === PREPARE_STATUS.failed) return SUMMARY_STATUS.failed;
  return lesson?.summary_status || SUMMARY_STATUS.idle;
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

const OPTIONAL_COLUMNS = [
  'prepare_status',
  'prepare_step',
  'prepare_error',
  'summary_status',
  'summary_error',
];

export async function patchLessonPrepare(supabase, userId, lessonId, patch) {
  const withStatus = { ...patch, updated_at: new Date().toISOString() };
  let { error } = await supabase
    .from('video_lessons')
    .update(withStatus)
    .eq('id', lessonId)
    .eq('user_id', userId);

  if (error && OPTIONAL_COLUMNS.some((col) => String(error.message || '').includes(col))) {
    const fallback = { ...withStatus };
    for (const col of OPTIONAL_COLUMNS) delete fallback[col];
    ({ error } = await supabase
      .from('video_lessons')
      .update(fallback)
      .eq('id', lessonId)
      .eq('user_id', userId));
  }
  return error;
}

async function defaultFetchTranscript(videoUrl) {
  const { youtubeTranscriptService } = await import('./youtubeTranscriptService.js');
  return youtubeTranscriptService.processYouTubeUrl(videoUrl, {
    transcript24TimeoutMs: 120000,
    metaTimeoutMs: 15000,
  });
}

async function defaultAnalyzeVocab(text, cefr, options = {}) {
  const { aiService } = await import('./aiService.js');
  return aiService.analyzeWebsiteContent(text, cefr, {
    limit: 24,
    chunksToProcess: 3,
    chunkTimeout: VOCAB_TIMEOUT_MS,
    preferRecall: Boolean(options.preferRecall),
  });
}

async function defaultSummarize(args) {
  const { aiService } = await import('./aiService.js');
  return aiService.summarizeAndChapter(args);
}

async function defaultGenerateQuiz(args) {
  const { aiService } = await import('./aiService.js');
  return aiService.generateVideoMixedQuiz(args);
}

function usableSummary(summary, transcript) {
  const text = typeof summary === 'string' ? summary.trim() : '';
  if (!text) return '';
  return looksLikeTranscriptDump(text, transcript || '') ? '' : text;
}

export async function runLessonPreparePipeline({
  supabase,
  userId,
  lesson,
  fetchTranscript = defaultFetchTranscript,
  analyzeVocab = defaultAnalyzeVocab,
  summarize = defaultSummarize,
  generateQuiz = defaultGenerateQuiz,
} = {}) {
  const lessonId = lesson.id;
  let row = { ...lesson };
  console.log(`[learn-job] ${lessonId} start`);

  const fail = async (step, message) => {
    await patchLessonPrepare(supabase, userId, lessonId, {
      prepare_status: PREPARE_STATUS.failed,
      prepare_step: step,
      prepare_error: message,
    });
    return { ok: false, step, message };
  };

  await patchLessonPrepare(supabase, userId, lessonId, {
    prepare_status: PREPARE_STATUS.pending,
    prepare_step: PREPARE_STEPS.transcript,
    prepare_error: null,
  });
  console.log(`[learn-job] ${lessonId} ${PREPARE_STEPS.transcript}`);

  if (!row.transcript_text || String(row.transcript_text).trim().length < 80) {
    const transcriptResult = await fetchTranscript(row.video_url);
    if (!transcriptResult?.success) {
      return fail(
        PREPARE_STEPS.transcript,
        transcriptResult?.error || 'Could not fetch the YouTube transcript.'
      );
    }
    const cues = capCues(transcriptResult.cues || [], MAX_CUES);
    const chapters = normalizeChapters(transcriptResult.chapters || []);
    const durationSeconds =
      typeof transcriptResult.videoInfo?.duration === 'number'
        ? transcriptResult.videoInfo.duration
        : null;
    const transcriptPatch = {
      title: transcriptResult.title || transcriptResult.videoInfo?.title || row.title,
      thumbnail_url: transcriptResult.videoInfo?.thumbnail || row.thumbnail_url || null,
      transcript_cues: cues,
      transcript_text: transcriptResult.content,
      chapters: chapters.length ? chapters : row.chapters || null,
      duration_seconds: durationSeconds,
      transcript_provider: transcriptResult.provider || null,
      prepare_step: PREPARE_STEPS.transcript,
    };
    await patchLessonPrepare(supabase, userId, lessonId, transcriptPatch);
    row = { ...row, ...transcriptPatch };
  }

  await patchLessonPrepare(supabase, userId, lessonId, {
    prepare_step: PREPARE_STEPS.vocab,
  });
  console.log(`[learn-job] ${lessonId} ${PREPARE_STEPS.vocab}`);

  if (!Array.isArray(row.vocabulary_snapshot)) {
    const cefr = row.user_cefr_level || 'B2';
    const vocabText = sampleTranscriptForAnalysis(
      row.transcript_text || '',
      VOCAB_SAMPLE_CHARS
    );
    let vocabulary = [];
    try {
      let vocabResult = await analyzeVocab(vocabText, cefr);
      if (!(vocabResult?.vocabulary || []).length) {
        vocabResult = await analyzeVocab(vocabText, cefr, { preferRecall: true });
      }
      const knownWords = new Set();
      const learnedWords = new Set();
      try {
        const [knownResult, wordsResult] = await Promise.all([
          supabase.from('known_words').select('word').eq('user_id', userId),
          supabase.from('words').select('word').eq('user_id', userId),
        ]);
        (knownResult.data || []).forEach((k) => knownWords.add(String(k.word).toLowerCase()));
        (wordsResult.data || []).forEach((w) => learnedWords.add(String(w.word).toLowerCase()));
      } catch (err) {
        console.log('Could not fetch known/learned words:', err.message);
      }
      vocabulary = (vocabResult?.vocabulary || []).map((item) => ({
        ...item,
        isKnown: knownWords.has(String(item.word || '').toLowerCase()),
        isLearned: learnedWords.has(String(item.word || '').toLowerCase()),
      }));
    } catch (vocabErr) {
      console.warn('Vocabulary step failed:', vocabErr?.message);
      try {
        const retryResult = await analyzeVocab(vocabText, cefr, { preferRecall: true });
        vocabulary = (retryResult?.vocabulary || []).map((item) => ({
          ...item,
          isKnown: false,
          isLearned: false,
        }));
      } catch (retryErr) {
        console.warn('Vocabulary retry failed:', retryErr?.message);
      }
    }
    await patchLessonPrepare(supabase, userId, lessonId, {
      vocabulary_snapshot: vocabulary,
      user_cefr_level: row.user_cefr_level || 'B2',
      current_step: 2,
      status: 'analyzed',
    });
    row.vocabulary_snapshot = vocabulary;
  }

  await patchLessonPrepare(supabase, userId, lessonId, {
    prepare_step: PREPARE_STEPS.highlights,
    summary_status: SUMMARY_STATUS.pending,
    summary_error: null,
  });
  console.log(`[learn-job] ${lessonId} ${PREPARE_STEPS.highlights}`);

  const existingSummary = usableSummary(row.summary, row.transcript_text);
  if (!existingSummary) {
    try {
      const existingChapters = normalizeChapters(row.chapters);
      const result = await summarize({
        transcript: sampleTranscriptForAnalysis(
          row.transcript_text || '',
          SUMMARY_SAMPLE_CHARS
        ),
        title: row.title || '',
        durationSeconds: row.duration_seconds,
        existingChapters: existingChapters.length ? existingChapters : null,
        needChapters: false,
        firstTimeout: HIGHLIGHTS_JOB_FIRST_MS,
        retryTimeout: HIGHLIGHTS_JOB_RETRY_MS,
      });
      const summary = usableSummary(result?.summary, row.transcript_text);
      const chapters = result?.chapters?.length
        ? normalizeChapters(result.chapters)
        : existingChapters;
      if (summary) {
        await patchLessonPrepare(supabase, userId, lessonId, {
          summary,
          chapters: chapters.length ? chapters : row.chapters || null,
          summary_status: SUMMARY_STATUS.ready,
          summary_error: null,
        });
        row.summary = summary;
      } else {
        await patchLessonPrepare(supabase, userId, lessonId, {
          summary_status: SUMMARY_STATUS.failed,
          summary_error:
            'Could not generate highlights for this video. Try again in a moment.',
        });
      }
    } catch (error) {
      const mapped = publicAiFailure(error);
      await patchLessonPrepare(supabase, userId, lessonId, {
        summary_status: SUMMARY_STATUS.failed,
        summary_error: mapped.message,
      });
    }
  } else {
    await patchLessonPrepare(supabase, userId, lessonId, {
      summary_status: SUMMARY_STATUS.ready,
      summary_error: null,
    });
  }

  await patchLessonPrepare(supabase, userId, lessonId, {
    prepare_step: PREPARE_STEPS.quiz,
  });
  console.log(`[learn-job] ${lessonId} ${PREPARE_STEPS.quiz}`);

  if (!Array.isArray(row.quiz_questions) || !row.quiz_questions.length) {
    try {
      const vocab = Array.isArray(row.vocabulary_snapshot)
        ? row.vocabulary_snapshot
        : [];
      const vocabularyWords = vocab
        .filter((item) => item && !item.isKnown)
        .map((item) => item.word)
        .filter(Boolean)
        .slice(0, 20);
      const questions = await generateQuiz({
        transcript: row.transcript_text,
        userCefrLevel: row.user_cefr_level || 'B2',
        questionCount: 8,
        vocabularyWords,
      });
      if (Array.isArray(questions) && questions.length) {
        await patchLessonPrepare(supabase, userId, lessonId, {
          quiz_questions: questions,
          quiz_total: questions.length,
          status: 'quiz_generated',
        });
        row.quiz_questions = questions;
      }
    } catch (quizErr) {
      console.warn('Quiz step failed:', quizErr?.message);
    }
  }

  await patchLessonPrepare(supabase, userId, lessonId, {
    prepare_status: PREPARE_STATUS.ready,
    prepare_step: PREPARE_STEPS.done,
    prepare_error: null,
  });
  console.log(`[learn-job] ${lessonId} ${PREPARE_STEPS.done}`);
  return { ok: true, step: PREPARE_STEPS.done };
}

export function enqueueLessonPrepare({ supabase, userId, lesson, run } = {}) {
  const lessonId = lesson?.id;
  if (!lessonId || inFlight.has(lessonId)) return false;
  inFlight.add(lessonId);
  console.log(`[learn-job] ${lessonId} queued`);
  const job =
    run || (() => runLessonPreparePipeline({ supabase, userId, lesson }));
  setImmediate(() => {
    Promise.resolve()
      .then(job)
      .catch((error) => {
        console.error('Prepare pipeline failed:', error?.message || error);
      })
      .finally(() => {
        inFlight.delete(lessonId);
      });
  });
  return true;
}

/** @deprecated use enqueueLessonPrepare */
export const enqueueLessonHighlights = enqueueLessonPrepare;
export const patchLessonHighlights = patchLessonPrepare;
export async function runLessonHighlightsJob(args) {
  return runLessonPreparePipeline(args);
}
