/**
 * Unit checks for analyze helpers (no network).
 * Run: node backend/test_youtube_analyze_helpers.js
 */
import {
  sampleTranscriptForAnalysis,
  capCues,
  withTimeout,
  PROXY_REQUEST_BUDGET_MS,
  HIGHLIGHTS_ROUTE_TIMEOUT_MS,
  HIGHLIGHTS_FIRST_PASS_MS,
  HIGHLIGHTS_RETRY_PASS_MS,
} from './src/services/youtubeAnalyzeHelpers.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(sampleTranscriptForAnalysis('short') === 'short', 'passthrough short');
assert(sampleTranscriptForAnalysis('') === '', 'empty');

const long = 'A'.repeat(4000) + 'B'.repeat(4000) + 'C'.repeat(4000);
const sampled = sampleTranscriptForAnalysis(long, 3000);
assert(sampled.includes('[...]'), 'has elision markers');
assert(sampled.includes('A') && sampled.includes('B') && sampled.includes('C'), 'has all regions');
assert(sampled.length < long.length, 'shorter than original');

const cues = Array.from({ length: 100 }, (_, i) => ({
  start: i,
  end: i + 1,
  text: `cue-${i}`,
}));
const capped = capCues(cues, 10);
assert(capped.length <= 10, 'capped length');
assert(capped[0].text === 'cue-0', 'keeps first');
assert(capped[capped.length - 1].text === 'cue-99', 'keeps last');
assert(capCues(cues, 500).length === 100, 'no-op under max');

const ok = await withTimeout(Promise.resolve(42), 1000, 'fast');
assert(ok === 42, 'withTimeout resolves');

let timedOut = false;
try {
  await withTimeout(new Promise(() => {}), 20, 'slow');
} catch (err) {
  timedOut = err.code === 'timeout';
}
assert(timedOut, 'withTimeout rejects on timeout');

assert(
  HIGHLIGHTS_FIRST_PASS_MS + HIGHLIGHTS_RETRY_PASS_MS < HIGHLIGHTS_ROUTE_TIMEOUT_MS,
  'highlights AI passes fit inside route timeout'
);
assert(
  HIGHLIGHTS_ROUTE_TIMEOUT_MS < PROXY_REQUEST_BUDGET_MS,
  'highlights route responds before Cloudflare ~100s drop'
);

console.log('test_youtube_analyze_helpers: OK');
