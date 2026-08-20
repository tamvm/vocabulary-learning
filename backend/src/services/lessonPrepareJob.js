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

export const STEP_ETA_MS = {
  transcript: 20000,
  vocab: 40000,
  highlights: 75000,
  quiz: 35000,
};

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

export function hasTranscriptText(lesson) {
  return String(lesson?.transcript_text || '').trim().length >= 80;
}

export function hasVocabWords(lesson) {
  return (
    Array.isArray(lesson?.vocabulary_snapshot) && lesson.vocabulary_snapshot.length > 0
  );
}

export function vocabSnapshotNeedsPolish(snapshot) {
  if (!Array.isArray(snapshot) || !snapshot.length) return false;
  return snapshot.some(
    (item) =>
      (Array.isArray(item?.tags) && item.tags.includes('candidate')) ||
      String(item?.notes || '').includes('definition pending polish')
  );
}

export function formatStepEta(etaSeconds) {
  const seconds = Number(etaSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  return `~${Math.ceil(seconds / 60)} min`;
}

function parseChunkProgress(raw) {
  const match = String(raw || '').match(/^(\d+)\s*\/\s*(\d+)(?:@(\d+))?/);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!total) return null;
  return {
    current,
    total,
    startedAtMs: match[3] ? Number(match[3]) * 1000 : null,
  };
}

export function formatChunkProgress(current, total, startedAtMs = null) {
  const base = `${Math.min(Number(current) || 0, Number(total) || 0)}/${Number(total) || 0}`;
  if (!startedAtMs) return base;
  return `${base}@${Math.floor(startedAtMs / 1000)}`;
}

export function displayChunkProgress(raw) {
  return String(raw || '').replace(/@\d+$/, '');
}

function stepStartedAtMs(lesson, nowMs) {
  const chunks = parseChunkProgress(lesson?.prepare_progress);
  if (chunks?.startedAtMs) return chunks.startedAtMs;
  return Date.parse(lesson?.updated_at || lesson?.created_at || 0) || nowMs;
}

function percentForRunningStep(id, lesson, nowMs) {
  const budget = STEP_ETA_MS[id] || 30000;
  const started = stepStartedAtMs(lesson, nowMs);
  const elapsed = Math.max(0, nowMs - started);
  const timePct = Math.min(90, Math.round((elapsed / budget) * 90));

  if (id === PREPARE_STEPS.vocab) {
    const chunks = parseChunkProgress(lesson?.prepare_progress);
    if (chunks) {
      if (chunks.current >= chunks.total) return 99;
      const floor = Math.round((chunks.current / chunks.total) * 100);
      // Long single AI define stays on 0/1 — keep the bar moving with wall time.
      return Math.min(99, Math.max(floor, timePct));
    }
  }
  return timePct;
}

function etaSecondsForRunningStep(id, lesson, nowMs) {
  const budget = STEP_ETA_MS[id] || 30000;
  const started = stepStartedAtMs(lesson, nowMs);
  const elapsed = Math.max(0, nowMs - started);
  const chunks = parseChunkProgress(lesson?.prepare_progress);

  if (
    id === PREPARE_STEPS.vocab &&
    chunks &&
    chunks.current > 0 &&
    chunks.current < chunks.total
  ) {
    const perChunk = elapsed / chunks.current;
    return Math.max(5, Math.ceil((perChunk * (chunks.total - chunks.current)) / 1000));
  }

  // Same baseline as percent — always count down as time passes.
  return Math.max(5, Math.ceil((budget - elapsed) / 1000));
}

export function buildPrepareJobView(lesson, nowMs = Date.now()) {
  const status = resolvePrepareStatus(lesson, nowMs);
  const current = lesson?.prepare_step || null;
  const hasTranscript = hasTranscriptText(lesson);
  const hasVocab = hasVocabWords(lesson);
  const hasHighlights = Boolean(
    usableSummary(lesson?.summary, lesson?.transcript_text || '')
  );
  const hasQuiz =
    Array.isArray(lesson?.quiz_questions) && lesson.quiz_questions.length > 0;
  const doneFlags = {
    transcript: hasTranscript,
    vocab: hasVocab,
    highlights: hasHighlights,
    quiz: hasQuiz && hasVocab,
  };
  const currentIndex = PREPARE_STEP_ORDER.indexOf(current);
  const parallelTail =
    status === PREPARE_STATUS.pending &&
    (current === PREPARE_STEPS.highlights || current === PREPARE_STEPS.quiz);

  const steps = PREPARE_STEP_ORDER.map((id, index) => {
    let state = 'queued';
    if (doneFlags[id]) state = 'done';
    else if (status === PREPARE_STATUS.failed && id === current) state = 'failed';
    else if (status === PREPARE_STATUS.pending && id === current) state = 'running';
    else if (parallelTail && (id === PREPARE_STEPS.highlights || id === PREPARE_STEPS.quiz)) {
      state = 'running';
    } else if (status === PREPARE_STATUS.pending && currentIndex >= 0 && index < currentIndex) {
      state = doneFlags[id] ? 'done' : 'queued';
    }
    const progress =
      id === PREPARE_STEPS.vocab && lesson?.prepare_progress
        ? displayChunkProgress(lesson.prepare_progress)
        : '';
    const percent =
      state === 'done' ? 100 : state === 'running' ? percentForRunningStep(id, lesson, nowMs) : 0;
    const etaSeconds =
      state === 'running' ? etaSecondsForRunningStep(id, lesson, nowMs) : null;
    return {
      id,
      label: PREPARE_STEP_LABELS[id],
      state,
      progress,
      percent,
      etaSeconds,
      etaLabel: formatStepEta(etaSeconds),
    };
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

export function isPrepareStale(lesson, nowMs = Date.now()) {
  if (lesson?.prepare_status !== PREPARE_STATUS.pending) return false;
  const started = Date.parse(lesson.updated_at || lesson.created_at || 0) || 0;
  return Boolean(started && nowMs - started > PREPARE_STALE_MS);
}

export function resolvePrepareStatus(lesson, nowMs = Date.now()) {
  const status = lesson?.prepare_status || PREPARE_STATUS.idle;
  if (status !== PREPARE_STATUS.pending) return status;
  // Stale pending still means "should be running". A dead worker is resumed on
  // GET lesson/history; do not surface it as failed or the UI restarts highlights.
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
  'prepare_progress',
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
  const { extractVocabCandidates, candidatesToStubVocabulary } = await import(
    './vocabCandidates.js'
  );
  const source = options.transcript || text;
  const existing = Array.isArray(options.existingVocabulary)
    ? options.existingVocabulary.filter((item) => item?.word)
    : [];
  const candidates = existing.length
    ? existing.map((item) => ({
        word: item.word,
        context: item.exampleSentence || item.context || '',
      }))
    : extractVocabCandidates(source, {
        cues: options.cues,
        cefr,
        excludeWords: options.excludeWords,
        limit: 36,
      });
  const stubs = existing.length ? existing : candidatesToStubVocabulary(candidates);
  if (typeof options.onProgress === 'function') {
    options.onProgress({
      totalChunks: 1,
      currentChunk: 0,
      stubs,
    });
  }
  if (candidates.length) {
    const defined = await aiService.defineVocabularyItems(candidates, cefr, {
      timeout: VOCAB_TIMEOUT_MS,
    });
    if (typeof options.onProgress === 'function') {
      options.onProgress({
        totalChunks: 1,
        currentChunk: 1,
        stubs: defined?.vocabulary || stubs,
      });
    }
    return defined;
  }
  return aiService.analyzeWebsiteContent(text, cefr, {
    limit: 24,
    chunksToProcess: 1,
    chunkTimeout: VOCAB_TIMEOUT_MS,
    preferRecall: Boolean(options.preferRecall),
    onProgress: typeof options.onProgress === 'function' ? options.onProgress : null,
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

function annotateVocab(items, knownWords, learnedWords) {
  return (items || []).map((item) => ({
    ...item,
    isKnown: knownWords.has(String(item.word || '').toLowerCase()),
    isLearned: learnedWords.has(String(item.word || '').toLowerCase()),
  }));
}

function looksPolishedVocab(item) {
  const definition = String(item?.definition || '');
  if (!definition) return false;
  if (definition.startsWith('From the video:')) return false;
  if (definition.startsWith('Used in this video:')) return false;
  return true;
}

function markVocabPolished(items) {
  return (items || []).map((item) => {
    if (!looksPolishedVocab(item)) return item;
    const tags = (item.tags || []).filter((tag) => tag !== 'candidate');
    const notes = String(item.notes || '')
      .replace('Auto-picked from the transcript; definition pending polish', '')
      .trim();
    return { ...item, tags, notes };
  });
}

function firstIncompleteStep(row) {
  if (!hasTranscriptText(row)) return PREPARE_STEPS.transcript;
  if (!hasVocabWords(row) || vocabSnapshotNeedsPolish(row.vocabulary_snapshot)) {
    return PREPARE_STEPS.vocab;
  }
  if (!usableSummary(row.summary, row.transcript_text)) return PREPARE_STEPS.highlights;
  if (!Array.isArray(row.quiz_questions) || !row.quiz_questions.length) return PREPARE_STEPS.quiz;
  return PREPARE_STEPS.done;
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

  const startStep = firstIncompleteStep(row);
  if (startStep === PREPARE_STEPS.done) {
    await patchLessonPrepare(supabase, userId, lessonId, {
      prepare_status: PREPARE_STATUS.ready,
      prepare_step: PREPARE_STEPS.done,
      prepare_error: null,
    });
    return { ok: true, step: PREPARE_STEPS.done };
  }

  await patchLessonPrepare(supabase, userId, lessonId, {
    prepare_status: PREPARE_STATUS.pending,
    prepare_step: startStep,
    prepare_error: null,
  });

  if (!hasTranscriptText(row)) {
    console.log(`[learn-job] ${lessonId} ${PREPARE_STEPS.transcript}`);
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

  const needsVocab =
    !hasVocabWords(row) || vocabSnapshotNeedsPolish(row.vocabulary_snapshot);
  if (needsVocab) {
    const vocabStartedAtMs = Date.now();
    await patchLessonPrepare(supabase, userId, lessonId, {
      prepare_step: PREPARE_STEPS.vocab,
      prepare_progress: formatChunkProgress(0, 1, vocabStartedAtMs),
    });
    row.prepare_progress = formatChunkProgress(0, 1, vocabStartedAtMs);
    console.log(`[learn-job] ${lessonId} ${PREPARE_STEPS.vocab}`);

    const cefr = row.user_cefr_level || 'B2';
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
    const { extractVocabCandidates, candidatesToStubVocabulary } = await import(
      './vocabCandidates.js'
    );
    const vocabText = sampleTranscriptForAnalysis(
      row.transcript_text || '',
      VOCAB_SAMPLE_CHARS
    );
    const localCandidates = extractVocabCandidates(row.transcript_text || '', {
      cues: row.transcript_cues || [],
      cefr,
      excludeWords: [...knownWords, ...learnedWords],
      limit: 36,
    });
    const localStubs = candidatesToStubVocabulary(localCandidates);
    const vocabOpts = {
      transcript: row.transcript_text || '',
      cues: row.transcript_cues || [],
      excludeWords: [...knownWords, ...learnedWords],
      existingVocabulary: vocabSnapshotNeedsPolish(row.vocabulary_snapshot)
        ? row.vocabulary_snapshot
        : localStubs.length
          ? localStubs
          : undefined,
    };
    const persistStubs = async (stubs) => {
      if (!Array.isArray(stubs) || !stubs.length) return;
      if (hasVocabWords(row) && !vocabSnapshotNeedsPolish(row.vocabulary_snapshot)) {
        return;
      }
      const tagged = annotateVocab(stubs, knownWords, learnedWords);
      row.vocabulary_snapshot = tagged;
      await patchLessonPrepare(supabase, userId, lessonId, {
        vocabulary_snapshot: tagged,
        user_cefr_level: row.user_cefr_level || 'B2',
        current_step: 2,
        status: 'analyzed',
        prepare_step: PREPARE_STEPS.vocab,
      });
    };
    // Save local candidates immediately so Study can open before AI polish.
    if (localStubs.length) {
      await persistStubs(localStubs);
    }
    const reportVocabProgress = (p) => {
      if (Array.isArray(p?.stubs)) {
        persistStubs(p.stubs).catch(() => {});
      }
      const total = Number(p?.totalChunks) || 0;
      const current = Number(p?.currentChunk) || 0;
      if (!total) return;
      const started =
        parseChunkProgress(row.prepare_progress)?.startedAtMs || vocabStartedAtMs;
      const nextProgress = formatChunkProgress(current, total, started);
      row.prepare_progress = nextProgress;
      patchLessonPrepare(supabase, userId, lessonId, {
        prepare_step: PREPARE_STEPS.vocab,
        prepare_progress: nextProgress,
      }).catch(() => {});
    };
    let vocabulary = Array.isArray(row.vocabulary_snapshot) ? row.vocabulary_snapshot : [];
    try {
      const vocabResult = await analyzeVocab(vocabText, cefr, {
        ...vocabOpts,
        onProgress: reportVocabProgress,
      });
      if ((vocabResult?.vocabulary || []).length) {
        vocabulary = markVocabPolished(
          annotateVocab(vocabResult.vocabulary, knownWords, learnedWords)
        );
      } else if (!vocabulary.length) {
        const recall = await analyzeVocab(vocabText, cefr, {
          ...vocabOpts,
          preferRecall: true,
          onProgress: reportVocabProgress,
        });
        vocabulary = markVocabPolished(
          annotateVocab(recall?.vocabulary || [], knownWords, learnedWords)
        );
      } else {
        vocabulary = markVocabPolished(vocabulary);
      }
    } catch (vocabErr) {
      console.warn('Vocabulary step failed:', vocabErr?.message);
      if (!vocabulary.length) {
        try {
          const retryResult = await analyzeVocab(vocabText, cefr, {
            ...vocabOpts,
            preferRecall: true,
            onProgress: reportVocabProgress,
          });
          vocabulary = markVocabPolished(
            annotateVocab(retryResult?.vocabulary || [], knownWords, learnedWords)
          );
        } catch (retryErr) {
          console.warn('Vocabulary retry failed:', retryErr?.message);
          if (localStubs.length) {
            vocabulary = annotateVocab(localStubs, knownWords, learnedWords);
          }
        }
      }
    }
    if (!vocabulary.length && localStubs.length) {
      vocabulary = annotateVocab(localStubs, knownWords, learnedWords);
    }
    await patchLessonPrepare(supabase, userId, lessonId, {
      vocabulary_snapshot: vocabulary,
      user_cefr_level: row.user_cefr_level || 'B2',
      current_step: 2,
      status: 'analyzed',
      prepare_progress: formatChunkProgress(1, 1, vocabStartedAtMs),
    });
    row.vocabulary_snapshot = vocabulary;
  }

  const needHighlights = !usableSummary(row.summary, row.transcript_text);
  const needQuiz = !Array.isArray(row.quiz_questions) || !row.quiz_questions.length;

  if (needHighlights || needQuiz) {
    const tailStartedAtMs = Date.now();
    await patchLessonPrepare(supabase, userId, lessonId, {
      prepare_step: needHighlights ? PREPARE_STEPS.highlights : PREPARE_STEPS.quiz,
      prepare_progress: formatChunkProgress(0, 1, tailStartedAtMs),
      summary_status: needHighlights ? SUMMARY_STATUS.pending : row.summary_status,
      summary_error: needHighlights ? null : row.summary_error,
    });
    row.prepare_progress = formatChunkProgress(0, 1, tailStartedAtMs);
    row.updated_at = new Date().toISOString();
  }

  const runHighlights = async () => {
    if (!needHighlights) return;
    console.log(`[learn-job] ${lessonId} ${PREPARE_STEPS.highlights}`);
    try {
      const existingChapters = normalizeChapters(row.chapters);
      const sampled = sampleTranscriptForAnalysis(
        row.transcript_text || '',
        SUMMARY_SAMPLE_CHARS
      );
      let result = await summarize({
        transcript: sampled,
        title: row.title || '',
        durationSeconds: row.duration_seconds,
        existingChapters: existingChapters.length ? existingChapters : null,
        needChapters: false,
        firstTimeout: HIGHLIGHTS_JOB_FIRST_MS,
        retryTimeout: HIGHLIGHTS_JOB_RETRY_MS,
      });
      let summary = usableSummary(result?.summary, row.transcript_text);
      // Second shape: middle slice only (avoids greeting-heavy start dumps).
      if (!summary && (row.transcript_text || '').length > 4000) {
        const mid = String(row.transcript_text);
        const start = Math.max(0, Math.floor(mid.length / 2) - 4000);
        result = await summarize({
          transcript: mid.slice(start, start + 8000),
          title: row.title || '',
          durationSeconds: row.duration_seconds,
          existingChapters: existingChapters.length ? existingChapters : null,
          needChapters: false,
          firstTimeout: HIGHLIGHTS_JOB_RETRY_MS,
          retryTimeout: HIGHLIGHTS_JOB_RETRY_MS,
          allowRetry: false,
        });
        summary = usableSummary(result?.summary, row.transcript_text);
      }
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
        row.summary_status = SUMMARY_STATUS.ready;
      } else {
        await patchLessonPrepare(supabase, userId, lessonId, {
          summary_status: SUMMARY_STATUS.failed,
          summary_error:
            'Could not generate highlights for this video. Try again in a moment.',
        });
        row.summary_status = SUMMARY_STATUS.failed;
      }
    } catch (error) {
      const mapped = publicAiFailure(error);
      await patchLessonPrepare(supabase, userId, lessonId, {
        summary_status: SUMMARY_STATUS.failed,
        summary_error: mapped.message,
      });
      row.summary_status = SUMMARY_STATUS.failed;
    }
  };

  const runQuiz = async () => {
    if (!needQuiz) return;
    console.log(`[learn-job] ${lessonId} ${PREPARE_STEPS.quiz}`);
    try {
      const vocab = Array.isArray(row.vocabulary_snapshot) ? row.vocabulary_snapshot : [];
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
  };

  await Promise.all([runHighlights(), runQuiz()]);

  const vocabOk = hasVocabWords(row);
  await patchLessonPrepare(supabase, userId, lessonId, {
    prepare_status: vocabOk ? PREPARE_STATUS.ready : PREPARE_STATUS.failed,
    prepare_step: vocabOk ? PREPARE_STEPS.done : PREPARE_STEPS.vocab,
    prepare_error: vocabOk
      ? null
      : 'Could not find vocabulary for this video. Try Re-extract.',
    prepare_progress: null,
  });
  console.log(`[learn-job] ${lessonId} ${vocabOk ? PREPARE_STEPS.done : 'vocab-failed'}`);
  return { ok: vocabOk, step: vocabOk ? PREPARE_STEPS.done : PREPARE_STEPS.vocab };
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

const RESUME_COOLDOWN_MS = 90 * 1000;
const recentResumeAt = new Map();

function lessonNeedsContentRepair(lesson) {
  if (!hasTranscriptText(lesson)) return false;
  if (!hasVocabWords(lesson)) return true;
  if (
    !usableSummary(lesson?.summary, lesson?.transcript_text || '') &&
    lesson?.summary_status === SUMMARY_STATUS.failed
  ) {
    return true;
  }
  return false;
}

/** Restart a DB-pending job, or repair ready lessons missing vocab/highlights. */
export function resumeLessonPrepareIfNeeded({ supabase, userId, lesson, run } = {}) {
  if (!lesson?.id) return false;
  if (isPrepareJobInFlight(lesson.id)) return false;

  const pending = lesson.prepare_status === PREPARE_STATUS.pending;
  const repair =
    (lesson.prepare_status === PREPARE_STATUS.ready ||
      lesson.prepare_status === PREPARE_STATUS.failed) &&
    lessonNeedsContentRepair(lesson);

  if (!pending && !repair) return false;

  if (repair) {
    const last = recentResumeAt.get(lesson.id) || 0;
    if (Date.now() - last < RESUME_COOLDOWN_MS) return false;
    const updated = Date.parse(lesson.updated_at || lesson.created_at || 0) || 0;
    if (updated && Date.now() - updated < RESUME_COOLDOWN_MS) return false;
  }

  recentResumeAt.set(lesson.id, Date.now());
  return enqueueLessonPrepare({ supabase, userId, lesson, run });
}

/** @deprecated use enqueueLessonPrepare */
export const enqueueLessonHighlights = enqueueLessonPrepare;
export const patchLessonHighlights = patchLessonPrepare;
export async function runLessonHighlightsJob(args) {
  return runLessonPreparePipeline(args);
}
