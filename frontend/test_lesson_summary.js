/**
 * Unit tests for Study summary fallback (TOM-105 follow-up).
 * Run: node test_lesson_summary.js
 */

import { displaySummary } from './src/lib/lessonSummary.js';

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

const ai = displaySummary('  Main ideas here.  ', [{ text: 'ignored' }]);
assertEqual(ai.source, 'ai', 'prefers AI summary');
assertEqual(ai.text, 'Main ideas here.', 'trims AI summary');

const empty = displaySummary('', []);
assertEqual(empty.source, 'empty', 'empty when no summary or cues');
assertEqual(empty.text, '', 'empty text');

const excerpt = displaySummary('', [
  { text: 'Hello' },
  { text: ' world ' },
  { text: '' },
]);
assertEqual(excerpt.source, 'excerpt', 'falls back to cues');
assertEqual(excerpt.text, 'Hello world', 'joins cue text');

const long = 'word '.repeat(200).trim();
const clipped = displaySummary('', [{ text: long }]);
assertEqual(clipped.source, 'excerpt', 'long excerpt still excerpt');
assertEqual(clipped.text.endsWith('…'), true, 'clips long excerpt');
assertEqual(clipped.text.length <= 501, true, 'clip stays near 500 chars');

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log('\nAll lesson summary tests passed');
