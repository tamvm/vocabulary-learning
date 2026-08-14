/**
 * Unit checks for AI config / public error mapping.
 * Run: node test_ai_config.js
 */
import {
  AI_KEY_REJECTED_MESSAGE,
  AI_NOT_CONFIGURED_MESSAGE,
  configurationError,
  createPublicAiError,
  publicAiFailure,
} from './src/services/aiConfig.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const known = new Set([
  'openai',
  'ollama-cloud',
  'opencode',
  'opencode-go',
  'ollama-local',
]);

assert(
  configurationError({ provider: 'openai', apiKey: '', knownProviders: known }) ===
    AI_NOT_CONFIGURED_MESSAGE,
  'missing key is not configured'
);
assert(
  configurationError({
    provider: 'openai',
    apiKey: 'sk-test',
    knownProviders: known,
  }) === null,
  'openai with key is configured'
);
assert(
  configurationError({
    provider: 'ollama-local',
    apiKey: '',
    knownProviders: known,
  }) === null,
  'local ollama does not need a key'
);
assert(
  /Unknown AI provider/.test(
    configurationError({ provider: 'nope', apiKey: '', knownProviders: known })
  ),
  'unknown provider'
);

assert(
  publicAiFailure(new Error('API key is required for this provider')).code ===
    'ai_not_configured',
  'maps missing key'
);
assert(
  publicAiFailure(new Error('AI service error: 401 {"error":"invalid"}')).message ===
    AI_KEY_REJECTED_MESSAGE,
  'maps 401 without leaking body'
);
assert(
  publicAiFailure(new Error('Request timeout')).code === 'ai_unavailable',
  'maps timeout'
);

const err = createPublicAiError(new Error('API key is required'));
assert(err.expose === true, 'expose');
assert(err.statusCode === 503, '503');
assert(err.message === AI_NOT_CONFIGURED_MESSAGE, 'public message');

console.log('test_ai_config: OK');
