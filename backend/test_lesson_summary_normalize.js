/**
 * Unit checks for lesson summary normalization (no network).
 * Run: node backend/test_lesson_summary_normalize.js
 */
import {
  looksLikeTranscriptDump,
  normalizeLessonSummary,
  parseAiJsonObject,
} from './src/services/lessonSummaryNormalize.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const captionDump =
  'Elon Musk, thank you so much for joining me on this side of it. Thank you for having us here at Tesla Giga. Um it is really hard to introduce you without using superlatives. >> I\'m doing a lot of building in general. I\'m >> You\'re doing a lot of building. >> You run a…';

assert(looksLikeTranscriptDump(captionDump) === true, 'detects >> speaker turns');
assert(normalizeLessonSummary(captionDump) === '', 'rejects caption dump');

const filler =
  'Um it is really hard to introduce you without using superlatives. Uh you are doing a lot of building in general and um you run around building things all day long at the factory while we sit down and talk about the tour.';
assert(looksLikeTranscriptDump(filler) === true, 'detects filler-heavy dump');

const transcript =
  'Elon Musk, thank you so much for joining me on this side of it. Thank you for having us here at Tesla Giga.';
const copied = 'Elon Musk, thank you so much for joining me on this side of it. Extra words here.';
assert(
  looksLikeTranscriptDump(copied, transcript) === true,
  'detects copy of transcript start'
);

const bullets = normalizeLessonSummary(
  'Tesla is scaling production. Optimus is a humanoid robot. SpaceX is aiming at Mars.'
);
assert(bullets.includes('- Tesla is scaling production.'), 'bulletizes sentences');
assert(bullets.split('\n').length === 3, 'three bullets');

const already = normalizeLessonSummary('- One idea\n- Another idea\n- Third idea');
assert(already.startsWith('- One idea'), 'keeps existing bullets');

const fromArray = normalizeLessonSummary(['First takeaway.', 'Second takeaway.']);
assert(fromArray.includes('- First takeaway.'), 'joins array summaries');

const parsed = parseAiJsonObject('```json\n{"summary":"- Hello","chapters":[]}\n```');
assert(parsed.summary === '- Hello', 'strips fences');

const messy = parseAiJsonObject('Here you go:\n{"summary":"- A","chapters":[]}\nThanks');
assert(messy.summary === '- A', 'extracts JSON object');

assert(normalizeLessonSummary('  ') === '', 'empty stays empty');
assert(looksLikeTranscriptDump('') === false, 'empty is not a dump');

console.log('test_lesson_summary_normalize: OK');
