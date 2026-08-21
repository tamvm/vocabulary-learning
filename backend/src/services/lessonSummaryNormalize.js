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

/**
 * Models often return markdown bullets or truncated JSON instead of a
 * parseable object. Recover a usable summary so highlights are not empty.
 */
export function recoverLessonSummaryFromAiText(content) {
  if (!content || typeof content !== 'string') return '';
  const cleaned = stripAiJsonFences(content).trim();
  if (!cleaned) return '';

  try {
    const parsed = parseAiJsonObject(cleaned);
    const normalized = normalizeLessonSummary(extractLessonSummaryRaw(parsed));
    if (normalized) return normalized;
  } catch {
    // fall through to regex / markdown recovery
  }

  const summaryKey = cleaned.match(/"summary"\s*:\s*"((?:\\.|[^"\\])*)"?/);
  if (summaryKey?.[1]) {
    const unescaped = summaryKey[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    const normalized = normalizeLessonSummary(unescaped);
    if (normalized) return normalized;
  }

  const bulletLines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*•]|\d+[.)])\s+\S/.test(line))
    .map((line) => line.replace(/^(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length >= 12 && !/^[{"]/.test(line));

  if (bulletLines.length >= 3) {
    return normalizeLessonSummary(bulletLines);
  }

  return '';
}

function stripAiJsonFences(content) {
  return String(content || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

export function parseAiJsonObject(content) {
  if (!content || typeof content !== 'string') {
    throw new Error('Empty AI content');
  }
  const cleaned = stripAiJsonFences(content);

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

/**
 * Parse a JSON array from an LLM reply (fences, leading prose, wrapped object,
 * or a truncated last object).
 */
export function parseAiJsonArray(content) {
  if (!content || typeof content !== 'string') {
    throw new Error('Empty AI content');
  }
  const cleaned = stripAiJsonFences(content);

  const asArray = (parsed) => {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.vocabulary)) return parsed.vocabulary;
      if (Array.isArray(parsed.items)) return parsed.items;
      if (Array.isArray(parsed.words)) return parsed.words;
    }
    return null;
  };

  try {
    const parsed = asArray(JSON.parse(cleaned));
    if (parsed) return parsed;
  } catch {
    // try slices below
  }

  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    const objEnd = cleaned.lastIndexOf('}');
    if (objEnd > objStart) {
      try {
        const parsed = asArray(JSON.parse(cleaned.slice(objStart, objEnd + 1)));
        if (parsed) return parsed;
      } catch {
        // fall through to array slice
      }
    }
  }

  if (arrStart >= 0) {
    const arrEnd = cleaned.lastIndexOf(']');
    if (arrEnd > arrStart) {
      try {
        const parsed = asArray(JSON.parse(cleaned.slice(arrStart, arrEnd + 1)));
        if (parsed) return parsed;
      } catch {
        // truncated array
      }
    }

    const truncated = arrEnd > arrStart ? cleaned.slice(arrStart, arrEnd) : cleaned.slice(arrStart);
    const lastObj = truncated.lastIndexOf('}');
    if (lastObj > 0) {
      try {
        const parsed = asArray(JSON.parse(`${truncated.slice(0, lastObj + 1)}]`));
        if (parsed) return parsed;
      } catch {
        // give up
      }
    }
  }

  throw new Error('Invalid AI response format');
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
