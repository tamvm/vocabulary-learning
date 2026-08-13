/**
 * Helpers to keep /youtube/analyze under reverse-proxy time/size limits
 * (Cloudflare/cloudflared ~100s). Long interviews otherwise 502.
 */

/**
 * Sample start / middle / end of a long transcript for AI vocabulary + summary.
 */
export function sampleTranscriptForAnalysis(text, maxChars = 12000) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxChars) return text;

  const part = Math.floor(maxChars / 3);
  const start = text.slice(0, part).trim();
  const midStart = Math.max(0, Math.floor((text.length - part) / 2));
  const mid = text.slice(midStart, midStart + part).trim();
  const end = text.slice(-part).trim();
  return `${start}\n\n[...]\n\n${mid}\n\n[...]\n\n${end}`;
}

/**
 * Uniformly subsample cues so response/DB payloads stay bounded.
 * Always keeps first and last cue when possible.
 */
export function capCues(cues, maxCues = 2500) {
  if (!Array.isArray(cues) || cues.length <= maxCues) {
    return Array.isArray(cues) ? cues : [];
  }
  if (maxCues < 2) return cues.slice(0, maxCues);

  const lastIndex = cues.length - 1;
  const innerSlots = maxCues - 2;
  const result = [cues[0]];
  for (let i = 0; i < innerSlots; i++) {
    const idx = Math.round(((i + 1) * lastIndex) / (innerSlots + 1));
    if (idx > 0 && idx < lastIndex) {
      result.push(cues[idx]);
    }
  }
  result.push(cues[lastIndex]);

  // Deduplicate by index order / identical start+text
  const seen = new Set();
  return result.filter((c) => {
    const key = `${c.start}|${c.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Race a promise against a timeout; on timeout reject with code.
 */
export function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = 'timeout';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}
