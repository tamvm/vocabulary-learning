/**
 * Unit tests for Learn session list helpers (TOM-104).
 * Run: node test_learn_session.js
 */

import {
  LEARN_STEPS,
  extractYoutubeId,
  isUnfinishedLesson,
  latestUnfinished,
  lessonNeedsReanalyze,
  lessonScoreLabel,
  lessonThumbnail,
  reuseSavedLessonId,
  reuseUnfinishedLessonId,
  statusTone,
  stepLabel,
  isPreparingLesson,
  isVocabReady,
  upsertHistoryLesson,
  prepareJobFromLesson,
  prepareStepLabel,
} from './src/lib/learnSession.js';

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

const unfinished = {
  id: 'a',
  status: 'analyzed',
  current_step: LEARN_STEPS.STUDY,
  title: 'Open',
  video_id: 'abcdefghijk',
  updated_at: '2026-08-13T00:00:00.000Z',
};
const completed = {
  id: 'b',
  status: 'completed',
  current_step: LEARN_STEPS.QUIZ,
  quiz_score: 6,
  quiz_total: 8,
  video_id: 'abcdefghijk',
  thumbnail_url: 'https://example.com/thumb.jpg',
};

assertEqual(isUnfinishedLesson(unfinished), true, 'analyzed is unfinished');
assertEqual(isUnfinishedLesson(completed), false, 'completed is finished');
assertEqual(latestUnfinished([completed, unfinished]).id, 'a', 'latestUnfinished skips completed');
assertEqual(latestUnfinished([completed]), null, 'no unfinished returns null');
assertEqual(stepLabel(unfinished), 'Study', 'step label uses current_step');
assertEqual(stepLabel(completed), 'Completed', 'completed label');
assertEqual(stepLabel({ status: 'quiz_generated' }), 'Quiz', 'quiz_generated label');
assertEqual(statusTone(completed).label, 'Completed', 'completed tone');
assertEqual(statusTone(unfinished).label, 'In progress', 'in-progress tone');
assertEqual(lessonScoreLabel(completed), '6/8', 'score label');
assertEqual(lessonScoreLabel(unfinished), null, 'no score for unfinished');
assertEqual(
  lessonThumbnail(completed),
  'https://example.com/thumb.jpg',
  'prefers stored thumbnail'
);
assertEqual(
  lessonThumbnail(unfinished),
  'https://img.youtube.com/vi/abcdefghijk/mqdefault.jpg',
  'falls back to YouTube thumbnail'
);

assertEqual(
  extractYoutubeId('https://www.youtube.com/watch?v=abcdefghijk'),
  'abcdefghijk',
  'extracts watch URL id'
);
assertEqual(
  extractYoutubeId('https://youtu.be/abcdefghijk'),
  'abcdefghijk',
  'extracts short URL id'
);
assertEqual(extractYoutubeId('not-a-url'), null, 'invalid URL has no id');

assertEqual(
  reuseUnfinishedLessonId([completed, unfinished], 'abcdefghijk'),
  'a',
  'reuses unfinished session for same video'
);
assertEqual(
  reuseUnfinishedLessonId([completed], 'abcdefghijk'),
  null,
  'does not reuse completed session as unfinished'
);
assertEqual(
  reuseSavedLessonId([completed], 'abcdefghijk'),
  'b',
  'revisit uses completed session for the same video'
);
assertEqual(
  reuseSavedLessonId([completed, unfinished], 'abcdefghijk'),
  'a',
  'revisit prefers unfinished over completed'
);
assertEqual(
  lessonNeedsReanalyze({
    vocabulary: [{ word: 'cat' }],
    studyWords: [],
    questions: [],
    cues: [],
    summary: '',
    lesson: { videoUrl: 'https://youtu.be/abcdefghijk' },
  }),
  false,
  'does not reanalyze when vocabulary exists'
);
assertEqual(
  lessonNeedsReanalyze({
    vocabulary: [],
    studyWords: [],
    questions: [],
    cues: [{ start: 0, text: 'hi' }],
    summary: '',
    lesson: { videoUrl: 'https://youtu.be/abcdefghijk' },
  }),
  false,
  'does not reanalyze when cues exist'
);
assertEqual(
  lessonNeedsReanalyze({
    vocabulary: [],
    studyWords: [],
    questions: [],
    cues: [],
    summary: '',
    lesson: { videoUrl: 'https://youtu.be/abcdefghijk' },
  }),
  true,
  'reanalyzes empty shell with a video URL'
);
assertEqual(
  lessonNeedsReanalyze({
    prepareStatus: 'pending',
    vocabulary: [],
    studyWords: [],
    questions: [],
    cues: [],
    summary: '',
    lesson: { videoUrl: 'https://youtu.be/abcdefghijk' },
  }),
  false,
  'does not reanalyze while prepare pipeline is pending'
);

const preparing = {
  id: 'p',
  status: 'analyzed',
  prepare_status: 'pending',
  prepare_step: 'vocab',
  prepare_progress: '2/3',
  title: 'Long interview',
  video_id: 'xyzxyzxyzxy',
};
assertEqual(isPreparingLesson(preparing), true, 'pending prepare_status is preparing');
assertEqual(isVocabReady(preparing), false, 'vocab step is not vocab-ready yet');
assertEqual(statusTone(preparing).label, 'Preparing', 'pending lesson tone is Preparing');
assertEqual(
  stepLabel(preparing),
  'Finding vocabulary (2/3)…',
  'pending lesson shows vocab chunk progress'
);
assertEqual(
  prepareJobFromLesson(preparing).steps[1].progress,
  '2/3',
  'list job view carries vocab progress'
);

const vocabReadyPending = {
  ...preparing,
  id: 'q',
  prepare_step: 'highlights',
  prepare_progress: '',
};
assertEqual(isVocabReady(vocabReadyPending), true, 'highlights step means vocab is ready');
assertEqual(statusTone(vocabReadyPending).label, 'Vocab ready', 'can open vocab while job continues');
assertEqual(
  isVocabReady({ ...vocabReadyPending, vocabReady: false }),
  false,
  'explicit vocabReady false wins over later prepare steps'
);

const leftoverQuizJob = prepareJobFromLesson({
  prepare_status: 'pending',
  prepare_step: 'highlights',
  vocabReady: false,
});
assertEqual(
  leftoverQuizJob.steps[1].state,
  'queued',
  'frontend job view does not mark vocab done just because later steps started'
);

const listed = upsertHistoryLesson([unfinished], preparing);
assertEqual(listed[0].id, 'p', 'pending lesson is prepended to Your videos');
assertEqual(
  upsertHistoryLesson(listed, { id: 'p', prepare_step: 'highlights' })[0].prepare_step,
  'highlights',
  'upsert updates the existing pending row'
);
assertEqual(
  prepareStepLabel('vocab', '1/3'),
  'Finding vocabulary (1/3)…',
  'prepareStepLabel includes chunk progress'
);

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log('\nAll learn session helper tests passed');
