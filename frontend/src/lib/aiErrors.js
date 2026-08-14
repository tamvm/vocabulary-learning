/**
 * Detect the fake analyzeWord payload used when AI was unavailable.
 */
export function isAiFailureStub(analysis) {
  if (!analysis || typeof analysis !== 'object') return false;
  const definition = String(analysis.definition || '');
  if (/AI service unavailable/i.test(definition)) return true;
  if (Array.isArray(analysis.tags) && analysis.tags.includes('fallback')) return true;
  return false;
}

export function apiErrorMessage(err, fallback = 'Request failed') {
  const fromBody =
    err?.response?.data?.message ||
    (typeof err?.response?.data?.error === 'string' ? err.response.data.error : null);
  if (fromBody) return fromBody;

  const raw = String(err?.message || '');
  const code = err?.code || err?.cause?.code;
  const noResponse = !err?.response;
  if (
    noResponse &&
    (code === 'ERR_NETWORK' ||
      code === 'ECONNRESET' ||
      /^Network Error$/i.test(raw))
  ) {
    return 'The connection was interrupted before the server finished. Please try again.';
  }

  return raw || fallback;
}
