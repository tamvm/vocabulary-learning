/**
 * Unit-ish checks for Transcript24 cue parsing (no network).
 * Run: node backend/test_transcript24_cues.js
 */
import {
  parseTimestampToSeconds,
  captionsToCues,
  mergeNearDuplicateCues,
} from './src/services/transcript24Service.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(parseTimestampToSeconds('00:01:30.500') === 90.5, 'hms parse');
assert(parseTimestampToSeconds('01:05') === 65, 'ms parse');
assert(Math.abs(parseTimestampToSeconds(12.25) - 12.25) < 0.001, 'number passthrough');

const cues = captionsToCues([
  { start_time: '00:00:00.000', end_time: '00:00:02.000', text: 'Hello' },
  { start_time: '00:00:02.000', end_time: '00:00:04.000', text: ' world ' },
]);
assert(cues.length === 2, 'two cues');
assert(cues[0].start === 0 && cues[0].text === 'Hello', 'first cue');
assert(cues[1].text === 'world', 'trim text');

const merged = mergeNearDuplicateCues([
  { start: 0, end: 1, text: 'same' },
  { start: 0.1, end: 1.2, text: 'same' },
  { start: 2, end: 3, text: 'next' },
]);
assert(merged.length === 2, 'merged duplicates');
assert(merged[0].end >= 1.2, 'extended end');

console.log('test_transcript24_cues: OK');
