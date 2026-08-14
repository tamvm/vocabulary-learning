/**
 * Classify AI probe responses. Used by scripts/check-ai-service.js.
 * Dictionary fallback on analyze-word must not count as a working LLM.
 */

const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function describeAccessToken(token) {
  const value = String(token || '').trim();
  if (!value) {
    return { kind: 'empty', ok: false, reason: 'VOCA_ACCESS_TOKEN is empty' };
  }
  if (JWT_RE.test(value)) {
    return { kind: 'jwt', ok: true };
  }
  if (/^sk-/i.test(value) || /^oc-/i.test(value)) {
    return {
      kind: 'api_key',
      ok: false,
      reason:
        'VOCA_ACCESS_TOKEN looks like an AI API key (sk-/oc-), not a logged-in user session. Remote mode needs the Supabase JWT from DevTools after login (Authorization: Bearer eyJ…). To test the key itself, run --direct with AI_API_KEY.',
    };
  }
  return {
    kind: 'unknown',
    ok: false,
    reason:
      'VOCA_ACCESS_TOKEN is not a JWT. Copy the browser session token (three eyJ… segments), not AI_API_KEY. Or use VOCA_EMAIL / VOCA_PASSWORD.',
  };
}

export function hintForProbeFailure(kind) {
  if (kind === 'auth') {
    return 'This was an auth failure, not an AI config failure. Remote /api/ai/* requires a Magic English login JWT. Coolify AI_PROVIDER / AI_API_KEY are unrelated until /api/ai/config returns 200.';
  }
  if (kind === 'health') {
    return 'The API host did not pass /health. Check VOCA_API_URL and that the backend container is up.';
  }
  if (kind === 'usage') {
    return '';
  }
  return 'On Coolify backend check AI_PROVIDER, AI_API_KEY (or OPENCODE_API_KEY), AI_MODEL=mimo-v2.5, then redeploy.';
}

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

const OPENCODE_PROVIDERS = new Set(['opencode', 'opencode-go']);

export function assertExpectedProvider(actual, expected) {
  if (!expected) return { ok: true };
  const got = String(actual || '').trim();
  const want = String(expected).trim();
  const gotNorm = got === 'opencode/go' || got === 'opencode_go' ? 'opencode-go' : got;
  const wantNorm = want === 'opencode/go' || want === 'opencode_go' ? 'opencode-go' : want;
  if (gotNorm === wantNorm) return { ok: true };
  if (OPENCODE_PROVIDERS.has(gotNorm) && OPENCODE_PROVIDERS.has(wantNorm)) return { ok: true };
  return { ok: false, reason: `provider is "${got}", expected "${want}"` };
}
