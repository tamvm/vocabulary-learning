export const LEARN_STEPS = {
  URL: 1,
  VOCAB: 2,
  STUDY: 3,
  QUIZ: 4,
};

export function isUnfinishedLesson(lesson) {
  return Boolean(lesson && lesson.status !== 'completed');
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
  const hasVocab = Array.isArray(data?.vocabulary) && data.vocabulary.length > 0;
  const hasStudy = Array.isArray(data?.studyWords) && data.studyWords.length > 0;
  const hasQuiz = Array.isArray(data?.questions) && data.questions.length > 0;
  const hasCues = Array.isArray(data?.cues) && data.cues.length > 0;
  const hasSummary = Boolean(data?.summary);
  if (hasVocab || hasStudy || hasQuiz || hasCues || hasSummary) return false;
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

export function stepLabel(lesson) {
  if (lesson?.status === 'completed') return 'Completed';
  const step = Number(lesson?.current_step);
  if (step === LEARN_STEPS.QUIZ || lesson?.status === 'quiz_generated') return 'Quiz';
  if (step === LEARN_STEPS.STUDY) return 'Study';
  return 'Vocabulary';
}

export function statusTone(lesson) {
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
