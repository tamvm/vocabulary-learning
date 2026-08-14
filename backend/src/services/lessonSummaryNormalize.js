/**
 * Keep Learn summaries as paraphrased highlights, never caption dumps.
 */

const SPEAKER_TURN = />>/;
const FILLER_WORD = /\b(um+|uh+|erm+)\b/i;

export function looksLikeTranscriptDump(text, transcript = '') {
  if (!text || typeof text !== 'string') return false;
  const summary = text.trim();
  if (!summary) return false;

  if (SPEAKER_TURN.test(summary)) return true;

  const words = summary.split(/\s+/).filter(Boolean);
  if (words.length >= 40) {
    const fillers = summary.match(/\b(um+|uh+|erm+)\b/gi) || [];
    if (fillers.length >= 2) return true;
  }

  const sample =
    typeof transcript === 'string' ? transcript.replace(/\s+/g, ' ').trim() : '';
  if (sample.length >= 60) {
    const needle = summary
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
      .toLowerCase();
    const hay = sample.slice(0, 500).toLowerCase();
    if (needle.length >= 40 && hay.includes(needle)) return true;
  }

  return false;
}

/**
 * Pull a summary string/list from common AI JSON shapes.
 */
export function extractLessonSummaryRaw(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return '';
  }
  const candidates = [
    parsed.summary,
    parsed.highlights,
    parsed.bullets,
    parsed.takeaways,
  ];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (Array.isArray(raw) && raw.length) return raw;
  }
  return '';
}

export function parseAiJsonObject(content) {
  if (!content || typeof content !== 'string') {
    throw new Error('Empty AI content');
  }
  const cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Invalid AI response format for summary');
  }
}

function bulletize(text) {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return lines.map((line) => `- ${line}`).join('\n');
  }

  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  if (sentences.length >= 3) {
    return sentences.slice(0, 8).map((s) => `- ${s}`).join('\n');
  }

  return `- ${trimmed}`;
}

/**
 * @param {string|string[]} raw
 * @param {string} [transcript]
 * @returns {string}
 */
export function normalizeLessonSummary(raw, transcript = '') {
  let text = '';
  if (Array.isArray(raw)) {
    text = raw
      .filter((item) => typeof item === 'string' && item.trim())
      .map((item) => item.trim())
      .join('\n');
  } else if (typeof raw === 'string') {
    text = raw.trim();
  }

  if (!text) return '';
  if (looksLikeTranscriptDump(text, transcript)) return '';
  return bulletize(text);
}
