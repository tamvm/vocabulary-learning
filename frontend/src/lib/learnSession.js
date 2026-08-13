export const LEARN_STEPS = {
  URL: 1,
  VOCAB: 2,
  STUDY: 3,
  QUIZ: 4,
};

export function isUnfinishedLesson(lesson) {
  return Boolean(lesson && lesson.status !== 'completed');
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
