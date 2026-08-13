/**
 * Prefer the AI lesson summary; if it is missing, fall back to a short
 * transcript excerpt so Study always has readable context.
 */
export function displaySummary(summary, cues = []) {
  const text = typeof summary === 'string' ? summary.trim() : '';
  if (text) {
    return { text, source: 'ai' };
  }

  const excerpt = (cues || [])
    .map((cue) => (typeof cue?.text === 'string' ? cue.text.trim() : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!excerpt) {
    return { text: '', source: 'empty' };
  }

  const maxChars = 500;
  if (excerpt.length <= maxChars) {
    return { text: excerpt, source: 'excerpt' };
  }
  return { text: `${excerpt.slice(0, maxChars).trim()}…`, source: 'excerpt' };
}
