/**
 * Unit tests for Study transcript sync / seek helpers (TOM-105).
 * Run: node test_transcript_sync.js
 */

import {
  findActiveCueIndex,
  findActiveChapterIndex,
  shouldUpdatePlaybackTime,
  seekPlayer,
} from './src/lib/transcriptSync.js';

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

const cues = [
  { start: 0, end: 2, text: 'hello' },
  { start: 2, end: 5, text: 'world' },
  { start: 8, end: 10, text: 'later' },
];

assertEqual(findActiveCueIndex(cues, 0), 0, 't=0 is first cue');
assertEqual(findActiveCueIndex(cues, 1.5), 0, 'mid-cue stays on first');
assertEqual(findActiveCueIndex(cues, 2), 1, 'start of second cue');
assertEqual(findActiveCueIndex(cues, 4.9), 1, 'near end of second cue');
assertEqual(findActiveCueIndex(cues, 6), 1, 'gap after second uses last started');
assertEqual(findActiveCueIndex(cues, 8.2), 2, 'third cue by range');
assertEqual(findActiveCueIndex(cues, -1), -1, 'before start is none');
assertEqual(findActiveCueIndex([], 1), -1, 'empty cues');
assertEqual(findActiveCueIndex(cues, null), -1, 'null time');
assertEqual(
  findActiveCueIndex([{ start: 1, end: 1, text: 'point' }], 3),
  0,
  'zero-length cue still matches after start'
);

const chapters = [
  { start: 0, title: 'Intro' },
  { start: 30, title: 'Body' },
  { start: 90, title: 'End' },
];
assertEqual(findActiveChapterIndex(chapters, 0), 0, 'chapter at 0');
assertEqual(findActiveChapterIndex(chapters, 29.9), 0, 'before next chapter');
assertEqual(findActiveChapterIndex(chapters, 30), 1, 'chapter boundary');
assertEqual(findActiveChapterIndex(chapters, 120), 2, 'after last chapter');
assertEqual(findActiveChapterIndex(chapters, null), -1, 'null chapter time');

assertEqual(
  shouldUpdatePlaybackTime(1.0, 1.4, cues, chapters),
  false,
  'same cue does not update'
);
assertEqual(
  shouldUpdatePlaybackTime(1.9, 2.1, cues, chapters),
  true,
  'cue change updates'
);
assertEqual(
  shouldUpdatePlaybackTime(null, 0.2, cues, chapters),
  true,
  'first time always updates'
);

const calls = [];
const player = {
  seekTo(seconds, allow) {
    calls.push(['seekTo', seconds, allow]);
  },
  playVideo() {
    calls.push(['playVideo']);
  },
};
assertEqual(seekPlayer(player, 12.5), true, 'seek returns true');
assertEqual(calls[0][0], 'seekTo', 'calls seekTo');
assertEqual(calls[0][1], 12.5, 'seek time');
assertEqual(calls[0][2], true, 'allowSeekAhead');
assertEqual(calls[1][0], 'playVideo', 'plays after seek');
assertEqual(seekPlayer(null, 5), false, 'no player');
assertEqual(seekPlayer(player, 'nope'), false, 'invalid time');
assertEqual(seekPlayer({ playVideo() {} }, 3), false, 'missing seekTo');

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log('\nAll transcript sync tests passed');
