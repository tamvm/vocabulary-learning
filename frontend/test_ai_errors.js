/**
 * Unit tests for Learn AI error helpers.
 * Run: node test_ai_errors.js
 */
import { apiErrorMessage, isAiFailureStub } from './src/lib/aiErrors.js';

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

assertEqual(isAiFailureStub(null), false, 'null is not a stub');
assertEqual(
  isAiFailureStub({ definition: 'Unable to provide definition - AI service unavailable' }),
  true,
  'detects unavailable definition'
);
assertEqual(
  isAiFailureStub({ definition: 'A real definition', tags: ['fallback'] }),
  true,
  'detects fallback tag'
);
assertEqual(
  isAiFailureStub({ definition: 'A factory that builds cars.', tags: ['noun'] }),
  false,
  'real analysis is not a stub'
);

assertEqual(
  apiErrorMessage({ response: { data: { message: 'AI is not configured' } } }),
  'AI is not configured',
  'prefers message'
);
assertEqual(
  apiErrorMessage({ response: { data: { error: 'Internal server error' } } }),
  'Internal server error',
  'falls back to error string'
);
assertEqual(
  apiErrorMessage({ message: 'Network Error', code: 'ERR_NETWORK' }),
  'The connection was interrupted before the server finished. Please try again.',
  'maps axios network error'
);
assertEqual(
  apiErrorMessage(
    { message: 'Network Error', response: { data: { message: 'AI is not configured' } } }
  ),
  'AI is not configured',
  'prefers body over network-error mapping'
);

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log('\nAll AI error helper tests passed');
