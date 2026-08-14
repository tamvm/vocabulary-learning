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
  return (
    err?.response?.data?.message ||
    (typeof err?.response?.data?.error === 'string' ? err.response.data.error : null) ||
    err?.message ||
    fallback
  );
}
