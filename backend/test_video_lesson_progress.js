/**
 * Unit tests for Learn session checkpoint helpers (TOM-104).
 * Run: node test_video_lesson_progress.js
 */

import {
  LEARN_STEPS,
  asAnswerMap,
  asArray,
  buildVideoInfo,
  hydrateLessonResponse,
  inferCurrentStep,
  isUnfinishedLesson,
  pickLessonToReuse,
  pickProgressFields,
} from './src/services/videoLessonProgress.js';

let failed = 0;

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
    return;
  }
  console.log(`PASS: ${message}`);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    console.error(`  expected: ${b}`);
    console.error(`  actual:   ${a}`);
    return;
  }
  console.log(`PASS: ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    return;
  }
  console.log(`PASS: ${message}`);
}

console.log('Testing video lesson progress helpers\n');

assertEqual(isUnfinishedLesson({ status: 'analyzed' }), true, 'analyzed is unfinished');
assertEqual(isUnfinishedLesson({ status: 'quiz_generated' }), true, 'quiz_generated is unfinished');
assertEqual(isUnfinishedLesson({ status: 'completed' }), false, 'completed is finished');
assertEqual(isUnfinishedLesson(null), false, 'null lesson is not unfinished');

assertEqual(inferCurrentStep({ current_step: 3 }), LEARN_STEPS.STUDY, 'uses saved current_step');
assertEqual(inferCurrentStep({ current_step: 99, status: 'analyzed' }), LEARN_STEPS.VOCAB, 'invalid step falls back');
assertEqual(
  inferCurrentStep({ status: 'quiz_generated' }),
  LEARN_STEPS.QUIZ,
  'quiz_generated infers quiz step'
);
assertEqual(
  inferCurrentStep({ status: 'completed' }),
  LEARN_STEPS.STUDY,
  'completed infers study (review)'
);
assertEqual(inferCurrentStep({}), LEARN_STEPS.VOCAB, 'empty lesson defaults to vocab');

assertDeepEqual(asArray(null), [], 'asArray(null) is []');
assertDeepEqual(asArray([{ word: 'cat' }]), [{ word: 'cat' }], 'asArray keeps arrays');

assertDeepEqual(asAnswerMap({ 0: 2, 1: '1', bad: 'x' }), { 0: 2, 1: 1 }, 'answer map keeps integer indexes');
assertDeepEqual(asAnswerMap(['nope']), {}, 'answer map rejects arrays');

const lesson = {
  id: '11111111-1111-4111-8111-111111111111',
  video_url: 'https://www.youtube.com/watch?v=abcdefghijk',
  video_id: 'abcdefghijk',
  title: 'Sample lesson',
  thumbnail_url: 'https://img.youtube.com/vi/abcdefghijk/mqdefault.jpg',
  status: 'analyzed',
  current_step: 3,
  quiz_score: null,
  quiz_total: null,
  completed_at: null,
  created_at: '2026-08-13T00:00:00.000Z',
  updated_at: '2026-08-13T01:00:00.000Z',
  user_cefr_level: 'B1',
  vocabulary_snapshot: [
    { word: 'apple', isKnown: false },
    { word: 'the', isKnown: true },
  ],
  study_words_snapshot: [],
  quiz_questions: [{ question: 'Q1', options: ['a', 'b'], correctIndex: 0 }],
  quiz_answers: { 0: 1 },
  transcript_cues: [{ start: 0, end: 2, text: 'hello' }],
  summary: 'A fruit video',
  chapters: [{ start: 0, title: 'Intro' }],
  duration_seconds: 120,
};

const hydrated = hydrateLessonResponse(lesson);
assertEqual(hydrated.currentStep, 3, 'hydrate uses current_step');
assertEqual(hydrated.userCefrLevel, 'B1', 'hydrate keeps CEFR');
assertEqual(hydrated.vocabulary.length, 2, 'hydrate vocabulary');
assertEqual(hydrated.studyWords.length, 1, 'study words fall back to unknown vocab');
assertEqual(hydrated.studyWords[0].word, 'apple', 'fallback study word is unknown item');
assertEqual(hydrated.questions.length, 1, 'hydrate quiz questions');
assertEqual(hydrated.quizAnswers[0], 1, 'hydrate quiz answers');
assertEqual(hydrated.cues.length, 1, 'hydrate cues');
assertEqual(hydrated.summary, 'A fruit video', 'hydrate summary');

const dumpHydrated = hydrateLessonResponse({
  ...lesson,
  summary:
    'Elon Musk, thank you so much for joining me. >> I just like building things.',
  transcript_text: 'Elon Musk, thank you so much for joining me.',
});
assertEqual(dumpHydrated.summary, '', 'hydrate hides caption-dump summary');
assertEqual(hydrated.lesson.videoUrl, lesson.video_url, 'hydrate lesson.videoUrl');
assertDeepEqual(
  buildVideoInfo(lesson),
  {
    videoId: 'abcdefghijk',
    title: 'Sample lesson',
    thumbnail: lesson.thumbnail_url,
    duration: 120,
    channel: null,
  },
  'buildVideoInfo maps stored columns'
);

const now = new Date('2026-08-13T12:00:00.000Z');
assertDeepEqual(
  pickProgressFields(
    {
      currentStep: 4,
      studyWordsSnapshot: [{ word: 'apple' }],
      status: 'quiz_generated',
    },
    now
  ),
  {
    current_step: 4,
    study_words_snapshot: [{ word: 'apple' }],
    status: 'quiz_generated',
    updated_at: '2026-08-13T12:00:00.000Z',
  },
  'pickProgressFields only copies provided keys'
);

assertEqual(
  pickProgressFields({ title: '  Renamed lesson  ' }, now).title,
  'Renamed lesson',
  'pickProgressFields trims title'
);

assert(
  !('vocabulary_snapshot' in pickProgressFields({ currentStep: 2 }, now)),
  'omitted snapshot fields are not wiped'
);

const older = {
  id: 'old',
  video_id: 'abcdefghijk',
  status: 'analyzed',
  updated_at: '2026-08-13T00:00:00.000Z',
};
const newer = {
  id: 'new',
  video_id: 'abcdefghijk',
  status: 'analyzed',
  updated_at: '2026-08-13T02:00:00.000Z',
};
const done = {
  id: 'done',
  video_id: 'abcdefghijk',
  status: 'completed',
  updated_at: '2026-08-13T03:00:00.000Z',
};
assertEqual(
  pickLessonToReuse([older, newer, done], { lessonId: 'old' }),
  'old',
  'explicit lessonId wins'
);
assertEqual(
  pickLessonToReuse([older, newer, done], { videoId: 'abcdefghijk' }),
  'new',
  'reuses newest unfinished for video'
);
assertEqual(
  pickLessonToReuse([done], { videoId: 'abcdefghijk' }),
  'done',
  'reuses completed lesson so the same video can be revisited'
);
assertEqual(
  pickLessonToReuse([done], { lessonId: 'done', videoId: 'abcdefghijk' }),
  'done',
  'explicit id can reuse a completed lesson (re-extract in place)'
);

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log('\nAll video lesson progress tests passed');
