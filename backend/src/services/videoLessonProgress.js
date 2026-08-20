import { looksLikeTranscriptDump } from './lessonSummaryNormalize.js';
import { resolvePrepareStatus, resolveSummaryStatus, buildPrepareJobView } from './lessonPrepareJob.js';

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
  'prepare_status',
  'prepare_step',
  'prepare_progress',
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
  'prepare_status',
  'prepare_step',
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

export function summarizeHistoryLesson(row) {
  if (!row) return row;
  const step = row.prepare_step;
  const vocabReady =
    row.prepare_status === 'ready' ||
    step === 'highlights' ||
    step === 'quiz' ||
    step === 'done';
  return { ...row, vocabReady };
}

export function hydrateLessonResponse(lesson) {
  const vocabulary = asArray(lesson.vocabulary_snapshot);
  const studyWords = asArray(lesson.study_words_snapshot);
  const currentStep = inferCurrentStep(lesson);
  const prepareJob = buildPrepareJobView(lesson);

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
    summary: looksLikeTranscriptDump(
      lesson.summary,
      lesson.transcript_text || ''
    )
      ? ''
      : lesson.summary || '',
    chapters: asArray(lesson.chapters),
    summaryStatus: resolveSummaryStatus(lesson),
    summaryError: lesson.summary_error || '',
    prepareStatus: resolvePrepareStatus(lesson),
    prepareStep: prepareJob.step || lesson.prepare_step || null,
    prepareProgress: lesson.prepare_progress || '',
    prepareError: lesson.prepare_error || '',
    vocabReady:
      Array.isArray(lesson.vocabulary_snapshot) &&
      lesson.vocabulary_snapshot.length > 0,
    prepareJob,
    userCefrLevel: lesson.user_cefr_level || 'B2',
    currentStep,
  };
}

function newestByUpdatedAt(rows) {
  const list = [...(rows || [])];
  list.sort((a, b) => {
    const aTime = Date.parse(a.updated_at || a.created_at || 0) || 0;
    const bTime = Date.parse(b.updated_at || b.created_at || 0) || 0;
    return bTime - aTime;
  });
  return list[0] || null;
}

/**
 * Prefer an explicit lesson id, then the newest unfinished row for this video,
 * then the newest completed row (revisit without creating a duplicate).
 */
export function pickLessonToReuse(lessons, { lessonId, videoId } = {}) {
  const rows = lessons || [];
  if (lessonId) {
    const match = rows.find((row) => row.id === lessonId);
    if (match) return match.id;
  }
  if (!videoId) return null;
  const sameVideo = rows.filter((row) => row.video_id === videoId);
  if (!sameVideo.length) return null;
  const unfinished = sameVideo.filter((row) => row.status !== 'completed');
  return (newestByUpdatedAt(unfinished) || newestByUpdatedAt(sameVideo))?.id || null;
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
  if (body.title !== undefined) patch.title = String(body.title).trim();
  patch.updated_at = now.toISOString();
  return patch;
}
