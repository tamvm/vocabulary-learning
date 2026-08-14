import assert from 'node:assert/strict';
import {
  classifyConfigBody,
  classifyTestConnectionBody,
  classifyAnalyzeWordBody,
  classifyChatCompletionBody,
  assertExpectedModel,
  assertExpectedProvider,
  describeAccessToken,
  hintForProbeFailure,
} from './aiServiceProbe.js';

assert.equal(classifyConfigBody({ config: { available: true, provider: 'opencode', model: 'mimo-v2.5' } }).ok, true);
assert.equal(classifyConfigBody({ config: { available: false, provider: 'opencode' } }).ok, false);

assert.equal(classifyTestConnectionBody({ success: true, provider: 'opencode', model: 'mimo-v2.5' }).ok, true);
assert.equal(classifyTestConnectionBody({ success: false, message: 'API key is required' }).ok, false);

assert.equal(classifyAnalyzeWordBody({ analysis: { definition: 'lucky find', word: 'serendipity' } }).ok, true);
assert.equal(
  classifyAnalyzeWordBody({
    analysis: { definition: 'lucky find', source: 'dictionary', notes: 'Definition from Free Dictionary (AI unavailable)' },
  }).ok,
  false
);

assert.equal(classifyChatCompletionBody({ choices: [{ message: { content: 'pong' } }] }).ok, true);
assert.equal(classifyChatCompletionBody({ choices: [] }).ok, false);

assert.equal(assertExpectedModel('mimo-v2.5', 'mimo-v2.5').ok, true);
assert.equal(assertExpectedModel('kimi-k2.7-code', 'mimo-v2.5').ok, false);
assert.equal(assertExpectedProvider('opencode-go', 'opencode').ok, true);
assert.equal(assertExpectedProvider('openai', 'opencode').ok, false);

assert.equal(describeAccessToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.abc').ok, true);
assert.equal(describeAccessToken('sk-not-a-user-session').kind, 'api_key');
assert.equal(describeAccessToken('sk-not-a-user-session').ok, false);
assert.match(describeAccessToken('sk-not-a-user-session').reason, /AI API key/);
assert.match(hintForProbeFailure('auth'), /auth failure, not an AI config failure/);
assert.match(hintForProbeFailure('ai'), /AI_PROVIDER/);

console.log('test_ai_probe_classify: ok');
