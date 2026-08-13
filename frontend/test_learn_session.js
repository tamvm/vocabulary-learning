/**
 * Unit tests for Learn session list helpers (TOM-104).
 * Run: node test_learn_session.js
 */

import {
  LEARN_STEPS,
  isUnfinishedLesson,
  latestUnfinished,
  lessonScoreLabel,
  lessonThumbnail,
  statusTone,
  stepLabel,
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

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log('\nAll learn session helper tests passed');
