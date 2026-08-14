/**
 * Prefer a paraphrased AI lesson summary. Never show a caption dump.
 */
export function looksLikeTranscriptDump(text) {
  if (!text || typeof text !== 'string') return false;
  const summary = text.trim();
  if (!summary) return false;
  if (/>>/.test(summary)) return true;
  const words = summary.split(/\s+/).filter(Boolean);
  if (words.length >= 40) {
    const fillers = summary.match(/\b(um+|uh+|erm+)\b/gi) || [];
    if (fillers.length >= 2) return true;
  }
  return false;
}

export function parseSummaryBullets(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}

export function displaySummary(summary) {
  const text = typeof summary === 'string' ? summary.trim() : '';
  if (!text || looksLikeTranscriptDump(text)) {
    return { text: '', items: [], source: 'empty' };
  }
  const items = parseSummaryBullets(text);
  return { text, items, source: 'ai' };
}
