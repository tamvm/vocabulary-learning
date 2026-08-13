/**
 * Transcript24 API client — primary transcript source for /learn.
 * Docs: https://www.transcript24.com/transcript-api
 */

function parseTimestampToSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'string') return 0;

  const cleaned = value.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return parseInt(m, 10) * 60 + parseFloat(s);
  }
  return parseFloat(cleaned) || 0;
}

function captionsToCues(caption = []) {
  return caption
    .map((item) => {
      const start = parseTimestampToSeconds(item.start_time ?? item.start);
      const end = parseTimestampToSeconds(item.end_time ?? item.end);
      const text = String(item.text || '').replace(/\s+/g, ' ').trim();
      return { start, end: end || start, text };
    })
    .filter((c) => c.text);
}

function mergeNearDuplicateCues(cues, gapSeconds = 0.15) {
  if (!cues.length) return [];
  const merged = [{ ...cues[0] }];
  for (let i = 1; i < cues.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = cues[i];
    if (
      cur.text === prev.text &&
      Math.abs(cur.start - prev.start) <= gapSeconds
    ) {
      prev.end = Math.max(prev.end, cur.end);
      continue;
    }
    // Drop exact consecutive duplicates common in auto-captions
    if (cur.text === prev.text && cur.start < prev.end + 0.5) {
      prev.end = Math.max(prev.end, cur.end);
      continue;
    }
    merged.push({ ...cur });
  }
  return merged;
}

class Transcript24Service {
  constructor() {
    this.baseUrl = process.env.TRANSCRIPT24_BASE_URL || 'https://api.transcript24.com';
    this.apiKey = process.env.TRANSCRIPT24_API_KEY || '';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim());
  }

  async transcribe(url, { prefer = 'auto' } = {}) {
    if (!this.isConfigured()) {
      const err = new Error('TRANSCRIPT24_API_KEY is not configured');
      err.code = 'transcript24_not_configured';
      throw err;
    }

    const body = { url };
    if (prefer && prefer !== 'auto') {
      body.prefer = prefer;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let response;
    try {
      response = await fetch(`${this.baseUrl}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'MagicEnglish/1.0',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const err = new Error(
        error.name === 'AbortError'
          ? 'Transcript24 request timed out'
          : `Transcript24 request failed: ${error.message}`
      );
      err.code = 'transcript24_network';
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      const err = new Error(`Transcript24 returned non-JSON (HTTP ${response.status})`);
      err.code = 'transcript24_bad_response';
      throw err;
    }

    if (!response.ok || data?.ok === false || data?.error) {
      const message = data?.error || data?.message || `Transcript24 HTTP ${response.status}`;
      const err = new Error(message);
      err.code =
        /insufficient credits/i.test(message)
          ? 'transcript24_credits'
          : /invalid api key/i.test(message)
            ? 'transcript24_auth'
            : 'transcript24_error';
      err.status = response.status;
      throw err;
    }

    const cues = mergeNearDuplicateCues(captionsToCues(data.caption || []));
    const content = cues.map((c) => c.text).join(' ').trim();

    if (!content || content.length < 40) {
      const err = new Error('Transcript24 returned an empty or very short transcript');
      err.code = 'transcript24_empty';
      throw err;
    }

    const meta = data.meta || {};
    return {
      success: true,
      provider: 'transcript24',
      mode: data.mode || null,
      taskCredits: data.taskCredits ?? null,
      content,
      cues,
      title: meta.title || null,
      videoInfo: {
        title: meta.title || null,
        description: meta.desc || meta.description || null,
        duration: meta.duration ?? null,
        thumbnail: meta.image || meta.thumbnail || null,
        channel: meta.channel || meta.uploader || null,
        platform: meta.platform || null,
        id: meta.id || null,
        views: meta.views ?? null,
        likes: meta.likes ?? null,
        chapters: Array.isArray(meta.chapters) ? meta.chapters : null,
      },
    };
  }
}

export const transcript24Service = new Transcript24Service();
export { parseTimestampToSeconds, captionsToCues, mergeNearDuplicateCues };
