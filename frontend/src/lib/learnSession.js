import { displaySummary } from './lessonSummary.js';

export const PREPARE_STEP_ORDER = ['transcript', 'vocab', 'highlights', 'quiz'];

const PREPARE_STEP_LABELS = {
  transcript: 'Transcript',
  vocab: 'Vocabulary',
  highlights: 'Highlights',
  quiz: 'Quiz',
};

export function formatStepEta(etaSeconds) {
  const seconds = Number(etaSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  return `~${Math.ceil(seconds / 60)} min`;
}

export function chunkPercent(progress) {
  const match = String(progress || '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!match || !Number(match[2])) return 0;
  return Math.min(99, Math.round((Number(match[1]) / Number(match[2])) * 100));
}

export function prepareStepLabel(step, progress = '') {
  if (step === 'transcript') return 'Fetching transcript…';
  if (step === 'vocab') {
    return progress
      ? `Finding vocabulary (${progress})…`
      : 'Finding vocabulary…';
  }
  if (step === 'highlights') return 'Generating highlights…';
  if (step === 'quiz') return 'Preparing quiz…';
  if (step === 'done') return 'Lesson ready';
  return 'Preparing lesson…';
}

export const LEARN_STEPS = {
  URL: 1,
  VOCAB: 2,
  STUDY: 3,
  QUIZ: 4,
};

export function isUnfinishedLesson(lesson) {
  return Boolean(lesson && lesson.status !== 'completed');
}

export function prepareStatusOf(lesson) {
  return lesson?.prepare_status || lesson?.prepareStatus || null;
}

export function prepareStepOf(lesson) {
  return lesson?.prepare_step || lesson?.prepareStep || null;
}

export function prepareProgressOf(lesson) {
  return String(lesson?.prepare_progress || lesson?.prepareProgress || '').replace(
    /@\d+$/,
    ''
  );
}

export function isPreparingLesson(lesson) {
  return prepareStatusOf(lesson) === 'pending';
}

/** True while highlights are in-flight so the panel does not look empty. */
export function isHighlightsGenerating({
  summary = '',
  summaryStatus = '',
  highlightsLoading = false,
  prepareJob = null,
} = {}) {
  if (highlightsLoading) return true;
  if (displaySummary(summary).source !== 'empty') return false;
  if (summaryStatus === 'failed') return false;
  if (summaryStatus === 'pending') return true;
  if (prepareJob?.status !== 'pending') return false;
  const step = (prepareJob.steps || []).find((item) => item.id === 'highlights');
  if (!step) return false;
  return step.state === 'queued' || step.state === 'running';
}

/** Vocabulary snapshot exists; highlights/quiz may still be running. */
export function isVocabReady(lesson) {
  if (lesson?.vocabReady === false) return false;
  if (lesson?.vocabReady === true) return true;
  if (Array.isArray(lesson?.vocabulary) && lesson.vocabulary.length > 0) return true;
  if (Array.isArray(lesson?.vocabulary_snapshot) && lesson.vocabulary_snapshot.length > 0) {
    return true;
  }
  if (prepareStatusOf(lesson) === 'ready') return true;
  const step = prepareStepOf(lesson);
  return step === 'highlights' || step === 'quiz' || step === 'done';
}

export function prepareJobFromLesson(lesson) {
  if (Array.isArray(lesson?.prepareJob?.steps) && lesson.prepareJob.steps.length) {
    return lesson.prepareJob;
  }
  const status = prepareStatusOf(lesson);
  if (status !== 'pending' && status !== 'failed' && status !== 'ready') {
    return null;
  }
  const current = prepareStepOf(lesson);
  const currentIndex = PREPARE_STEP_ORDER.indexOf(current);
  const vocabReady = isVocabReady(lesson);
  const progress = prepareProgressOf(lesson);
  const steps = PREPARE_STEP_ORDER.map((id, index) => {
    let state = 'queued';
    if (id === 'transcript' && (currentIndex > 0 || vocabReady || status === 'ready')) {
      state = 'done';
    } else if (id === 'vocab' && vocabReady) state = 'done';
    else if (status === 'failed' && id === current) state = 'failed';
    else if (status === 'pending' && id === current) state = 'running';
    else if (
      status === 'pending' &&
      (current === 'highlights' || current === 'quiz') &&
      (id === 'highlights' || id === 'quiz')
    ) {
      state = 'running';
    } else if (status === 'pending' && currentIndex >= 0 && index < currentIndex) {
      state = id === 'vocab' && !vocabReady ? 'queued' : 'done';
    } else if (status === 'ready') state = 'done';
    const stepProgress = id === 'vocab' && state === 'running' ? progress : '';
    const percent =
      state === 'done' ? 100 : state === 'running' ? chunkPercent(stepProgress) || 15 : 0;
    return {
      id,
      label: PREPARE_STEP_LABELS[id],
      state,
      progress: stepProgress,
      percent,
      etaSeconds: null,
      etaLabel: '',
    };
  });
  return { status, step: current, error: lesson?.prepare_error || '', steps };
}

export function upsertHistoryLesson(history, lesson) {
  const rows = Array.isArray(history) ? [...history] : [];
  if (!lesson?.id) return rows;
  const idx = rows.findIndex((row) => row.id === lesson.id);
  if (idx >= 0) {
    rows[idx] = { ...rows[idx], ...lesson };
    return rows;
  }
  return [lesson, ...rows];
}

export function extractYoutubeId(url) {
  const match = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export function reuseUnfinishedLessonId(lessons, videoId) {
  if (!videoId) return null;
  const match = (lessons || []).find(
    (lesson) => lesson.video_id === videoId && isUnfinishedLesson(lesson)
  );
  return match?.id || null;
}

/** Newest saved lesson for this YouTube id, including completed (revisit). */
export function reuseSavedLessonId(lessons, videoId) {
  if (!videoId) return null;
  const unfinishedId = reuseUnfinishedLessonId(lessons, videoId);
  if (unfinishedId) return unfinishedId;
  const match = (lessons || []).find((lesson) => lesson.video_id === videoId);
  return match?.id || null;
}

export function lessonNeedsReanalyze(data) {
  if (data?.prepareStatus === 'pending') return false;
  const hasVocab = Array.isArray(data?.vocabulary) && data.vocabulary.length > 0;
  const hasStudy = Array.isArray(data?.studyWords) && data.studyWords.length > 0;
  if (hasVocab || hasStudy) return false;
  return Boolean(data?.lesson?.videoUrl);
}

export function latestUnfinished(lessons) {
  return (lessons || []).find(isUnfinishedLesson) || null;
}

export function lessonThumbnail(lesson) {
  if (lesson?.thumbnail_url) return lesson.thumbnail_url;
  if (lesson?.video_id) {
    return `https://img.youtube.com/vi/${lesson.video_id}/mqdefault.jpg`;
  }
  return null;
}

/** Canonical YouTube watch URL for a saved lesson (copy/share). */
export function lessonVideoUrl(lesson) {
  const raw = lesson?.video_url || lesson?.videoUrl || '';
  if (raw && extractYoutubeId(raw)) return raw;
  const id = lesson?.video_id || extractYoutubeId(raw);
  if (id) return `https://www.youtube.com/watch?v=${id}`;
  return raw || null;
}

export function stepLabel(lesson) {
  if (isPreparingLesson(lesson)) {
    return prepareStepLabel(prepareStepOf(lesson), prepareProgressOf(lesson));
  }
  if (lesson?.status === 'completed') return 'Completed';
  const step = Number(lesson?.current_step);
  if (step === LEARN_STEPS.QUIZ || lesson?.status === 'quiz_generated') return 'Quiz';
  if (step === LEARN_STEPS.STUDY) return 'Study';
  return 'Vocabulary';
}

export function statusTone(lesson) {
  if (isPreparingLesson(lesson) && isVocabReady(lesson)) {
    return {
      label: 'Vocab ready',
      className:
        'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300',
    };
  }
  if (isPreparingLesson(lesson)) {
    return {
      label: 'Preparing',
      className:
        'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
    };
  }
  if (lesson?.status === 'completed') {
    return {
      label: 'Completed',
      className:
        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    };
  }
  return {
    label: 'In progress',
    className:
      'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  };
}

export function lessonScoreLabel(lesson) {
  const total = Number(lesson?.quiz_total);
  const score = Number(lesson?.quiz_score);
  if (!total || Number.isNaN(score)) return null;
  return `${score}/${total}`;
}
