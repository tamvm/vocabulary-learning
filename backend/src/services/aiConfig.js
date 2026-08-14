/**
 * User-facing AI configuration / failure messages.
 * Do not include provider response bodies (may leak secrets).
 */

export const AI_NOT_CONFIGURED_MESSAGE =
  'AI is not configured on the server. Set AI_PROVIDER and AI_API_KEY on the backend, then retry. Captions still work without AI; vocabulary, definitions, and highlights need it.';

export const AI_KEY_REJECTED_MESSAGE =
  'The AI API key was rejected. Check AI_API_KEY and AI_PROVIDER on the backend.';

export const AI_UNAVAILABLE_MESSAGE =
  'AI service is temporarily unavailable. Try again in a moment.';

export const AI_FAILED_MESSAGE =
  'AI could not complete this request. Check backend AI configuration and try again.';

const KEYED_PROVIDERS = new Set([
  'openai',
  'ollama-cloud',
  'opencode',
  'opencode-go',
]);

export function providerNeedsApiKey(provider) {
  return KEYED_PROVIDERS.has(provider);
}

export function configurationError({ provider, apiKey, knownProviders }) {
  if (!knownProviders.has(provider)) {
    return `Unknown AI provider "${provider}". Set AI_PROVIDER to openai, ollama-cloud, opencode, opencode-go, or ollama-local.`;
  }
  if (providerNeedsApiKey(provider) && !String(apiKey || '').trim()) {
    return AI_NOT_CONFIGURED_MESSAGE;
  }
  return null;
}

export function publicAiFailure(err) {
  const msg = String(err?.message || '');
  if (
    /API key is required/i.test(msg) ||
    /not configured/i.test(msg) ||
    /Unknown AI provider/i.test(msg)
  ) {
    return {
      code: 'ai_not_configured',
      statusCode: 503,
      message: /Unknown AI provider/i.test(msg) ? msg : AI_NOT_CONFIGURED_MESSAGE,
    };
  }
  if (/AI service error: 401\b/.test(msg) || /AI service error: 403\b/.test(msg)) {
    return {
      code: 'ai_not_configured',
      statusCode: 503,
      message: AI_KEY_REJECTED_MESSAGE,
    };
  }
  if (
    /timeout/i.test(msg) ||
    /AI service error: 429\b/.test(msg) ||
    /AI service error: 5\d\d\b/.test(msg)
  ) {
    return {
      code: 'ai_unavailable',
      statusCode: 503,
      message: AI_UNAVAILABLE_MESSAGE,
    };
  }
  return {
    code: 'ai_failed',
    statusCode: 502,
    message: AI_FAILED_MESSAGE,
  };
}

export function createPublicAiError(err) {
  const mapped = publicAiFailure(err);
  const error = new Error(mapped.message);
  error.code = mapped.code;
  error.statusCode = mapped.statusCode;
  error.expose = true;
  return error;
}
