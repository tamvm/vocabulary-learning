/**
 * Classify AI probe responses. Used by scripts/test-ai-service.js.
 * Dictionary fallback on analyze-word must not count as a working LLM.
 */

export function classifyConfigBody(body) {
  const config = body?.config;
  if (!config || typeof config !== 'object') {
    return { ok: false, reason: 'missing config object' };
  }
  if (!config.available) {
    return {
      ok: false,
      reason: `AI not available (provider=${config.provider || '?'}, model=${config.model || '?'})`,
      config,
    };
  }
  return { ok: true, config };
}

export function classifyTestConnectionBody(body) {
  if (!body || body.success !== true) {
    return {
      ok: false,
      reason: body?.message || 'test-connection failed',
    };
  }
  return {
    ok: true,
    provider: body.provider,
    model: body.model,
    message: body.message,
  };
}

export function classifyAnalyzeWordBody(body) {
  const analysis = body?.analysis;
  if (!analysis || typeof analysis !== 'object') {
    return { ok: false, reason: 'missing analysis object' };
  }
  if (analysis.source === 'dictionary') {
    return {
      ok: false,
      reason: 'dictionary fallback — LLM did not answer (check AI_PROVIDER / AI_API_KEY / AI_MODEL)',
    };
  }
  const definition = typeof analysis.definition === 'string' ? analysis.definition.trim() : '';
  if (!definition) {
    return { ok: false, reason: 'empty definition' };
  }
  return { ok: true, word: analysis.word, wordType: analysis.wordType };
}

export function classifyChatCompletionBody(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, reason: 'empty chat completion' };
  }
  return { ok: true, preview: content.trim().slice(0, 80) };
}

export function assertExpectedModel(actual, expected) {
  if (!expected) return { ok: true };
  const got = String(actual || '').trim();
  const want = String(expected).trim();
  if (got !== want) {
    return { ok: false, reason: `model is "${got}", expected "${want}"` };
  }
  return { ok: true };
}

export function assertExpectedProvider(actual, expected) {
  if (!expected) return { ok: true };
  const got = String(actual || '').trim();
  const want = String(expected).trim();
  if (got !== want && !(want === 'opencode' && got === 'opencode-go') && !(want === 'opencode-go' && got === 'opencode')) {
    return { ok: false, reason: `provider is "${got}", expected "${want}"` };
  }
  return { ok: true };
}
