/**
 * Unit tests for Study summary display (TOM-107).
 * Run: node test_lesson_summary.js
 */

import { displaySummary, looksLikeTranscriptDump } from './src/lib/lessonSummary.js';

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

const ai = displaySummary('  - Main idea one.\n- Main idea two.  ');
assertEqual(ai.source, 'ai', 'prefers AI summary');
assertEqual(ai.items.length, 2, 'parses two bullets');
assertEqual(ai.items[0], 'Main idea one.', 'strips dash');

const empty = displaySummary('', []);
assertEqual(empty.source, 'empty', 'empty when no summary');
assertEqual(empty.text, '', 'empty text');

const dump = displaySummary(
  'Elon Musk, thank you so much for joining me. >> I just like building things. >> You run a…'
);
assertEqual(dump.source, 'empty', 'rejects caption dump');
assertEqual(dump.text, '', 'dump has no text');

assertEqual(
  looksLikeTranscriptDump('A clear takeaway about Optimus robots.'),
  false,
  'real highlight is not a dump'
);

const bullets = displaySummary(
  '- Tesla is scaling factory output.\n- Optimus is a humanoid robot.'
);
assertEqual(bullets.items.length, 2, 'two highlight bullets');

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log('\nAll lesson summary tests passed');
