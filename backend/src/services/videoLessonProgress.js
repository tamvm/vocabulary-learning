export const LEARN_STEPS = {
  URL: 1,
  VOCAB: 2,
  STUDY: 3,
  QUIZ: 4,
};

export const HISTORY_LIST_COLUMNS = [
  'id',
  'video_url',
  'video_id',
  'title',
  'thumbnail_url',
  'words_saved',
  'quiz_score',
  'quiz_total',
  'status',
  'completed_at',
  'created_at',
  'updated_at',
  'current_step',
  'duration_seconds',
].join(', ');

export const HISTORY_LIST_COLUMNS_FALLBACK = [
  'id',
  'video_url',
  'video_id',
  'title',
  'thumbnail_url',
  'words_saved',
  'quiz_score',
  'quiz_total',
  'status',
  'completed_at',
  'created_at',
  'updated_at',
  'duration_seconds',
].join(', ');

export function isUnfinishedLesson(lesson) {
  return Boolean(lesson && lesson.status !== 'completed');
}

export function inferCurrentStep(lesson) {
  const step = Number(lesson?.current_step);
  if (step >= LEARN_STEPS.VOCAB && step <= LEARN_STEPS.QUIZ) {
    return step;
  }
  if (lesson?.status === 'quiz_generated') return LEARN_STEPS.QUIZ;
  if (lesson?.status === 'completed') return LEARN_STEPS.STUDY;
  return LEARN_STEPS.VOCAB;
}

export function buildVideoInfo(lesson) {
  return {
    videoId: lesson?.video_id || null,
    title: lesson?.title || null,
    thumbnail: lesson?.thumbnail_url || null,
    duration: lesson?.duration_seconds ?? null,
    channel: null,
  };
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asAnswerMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const mapped = {};
  for (const [key, raw] of Object.entries(value)) {
    const index = Number(raw);
    if (Number.isInteger(index) && index >= 0) {
      mapped[key] = index;
    }
  }
  return mapped;
}

export function hydrateLessonResponse(lesson) {
  const vocabulary = asArray(lesson.vocabulary_snapshot);
  const studyWords = asArray(lesson.study_words_snapshot);
  const currentStep = inferCurrentStep(lesson);

  return {
    lesson: {
      id: lesson.id,
      videoUrl: lesson.video_url,
      videoId: lesson.video_id,
      title: lesson.title,
      thumbnailUrl: lesson.thumbnail_url,
      status: lesson.status,
      currentStep,
      quizScore: lesson.quiz_score,
      quizTotal: lesson.quiz_total,
      completedAt: lesson.completed_at,
      createdAt: lesson.created_at,
      updatedAt: lesson.updated_at,
    },
    videoInfo: buildVideoInfo(lesson),
    vocabulary,
    studyWords: studyWords.length
      ? studyWords
      : vocabulary.filter((item) => !item?.isKnown),
    questions: asArray(lesson.quiz_questions),
    quizAnswers: asAnswerMap(lesson.quiz_answers),
    cues: asArray(lesson.transcript_cues),
    summary: lesson.summary || '',
    chapters: asArray(lesson.chapters),
    userCefrLevel: lesson.user_cefr_level || 'B2',
    currentStep,
  };
}

/**
 * Delete video_lessons rows owned by userId.
 * Never touches words / known_words — those are independent of sessions.
 */
export function deleteOwnedLessons(supabase, userId, lessonId = null) {
  if (!userId) {
    throw new Error('userId is required');
  }

  let query = supabase.from('video_lessons').delete().eq('user_id', userId);
  if (lessonId) {
    query = query.eq('id', lessonId);
  }
  return query.select('id');
}

export function pickProgressFields(body, now = new Date()) {
  const patch = {};
  if (body.currentStep != null) patch.current_step = body.currentStep;
  if (body.vocabularySnapshot !== undefined) {
    patch.vocabulary_snapshot = body.vocabularySnapshot;
  }
  if (body.studyWordsSnapshot !== undefined) {
    patch.study_words_snapshot = body.studyWordsSnapshot;
  }
  if (body.quizQuestions !== undefined) patch.quiz_questions = body.quizQuestions;
  if (body.quizAnswers !== undefined) patch.quiz_answers = body.quizAnswers;
  if (body.status !== undefined) patch.status = body.status;
  if (body.userCefrLevel !== undefined) patch.user_cefr_level = body.userCefrLevel;
  patch.updated_at = now.toISOString();
  return patch;
}
