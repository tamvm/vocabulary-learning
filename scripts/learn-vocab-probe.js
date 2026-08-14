#!/usr/bin/env node

/**
 * Probe Learn vocabulary extraction (same path as /learn prepare).
 *
 * Direct (backend/.env — Transcript24 + AI keys):
 *   node scripts/learn-vocab-probe.js --direct
 *   node scripts/learn-vocab-probe.js --direct --cefr B1 --url 'https://www.youtube.com/watch?v=VIDEO_ID'
 *   node scripts/learn-vocab-probe.js --direct --transcript-only
 *
 * Remote (logged-in API, same as the app):
 *   VOCA_ACCESS_TOKEN='eyJ…' node scripts/learn-vocab-probe.js --remote
 *   VOCA_EMAIL=you@example.com VOCA_PASSWORD='…' node scripts/learn-vocab-probe.js --remote
 *
 * Do not print API keys or JWTs. Exit 0 if at least one vocab item is returned
 * (unless --transcript-only). Exit 1 on failure or empty vocab.
 */

import { existsSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describeAccessToken } from './aiServiceProbe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const DEFAULT_URL = 'https://www.youtube.com/watch?v=XuoqKYxDHVc';

function loadEnvFile(filePath) {
  if (!existsSync(filePath) || typeof process.loadEnvFile !== 'function') return;
  try {
    process.loadEnvFile(filePath);
  } catch {
    // Coolify injects process env; local .env is optional.
  }
}

loadEnvFile(path.join(repoRoot, 'backend', '.env'));
loadEnvFile(path.join(repoRoot, 'frontend', '.env.local'));
loadEnvFile(path.join(repoRoot, 'frontend', '.env'));

function parseArgs(argv) {
  const options = {
    remote: false,
    direct: false,
    transcriptOnly: false,
    allowYtdlp: false,
    cefr: process.env.LEARN_CEFR || 'B2',
    url: process.env.LEARN_VIDEO_URL || process.env.YOUTUBE_URL || DEFAULT_URL,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--remote') options.remote = true;
    else if (arg === '--direct') options.direct = true;
    else if (arg === '--transcript-only') options.transcriptOnly = true;
    else if (arg === '--allow-ytdlp') options.allowYtdlp = true;
    else if (arg === '--cefr') options.cefr = argv[++i] || options.cefr;
    else if (arg === '--url' || arg === '--video' || arg === '--video-url' || arg === '-u') {
      options.url = argv[++i] || options.url;
    }
    else if (arg.startsWith('http://') || arg.startsWith('https://')) options.url = arg;
    else {
      console.error(`Unknown argument: ${arg}`);
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/learn-vocab-probe.js [--direct|--remote] [options]

Examples:
  node scripts/learn-vocab-probe.js --remote --url 'https://www.youtube.com/watch?v=VIDEO_ID'
  node scripts/learn-vocab-probe.js --direct --video 'https://youtu.be/VIDEO_ID' --cefr B1

Default video if you omit --url: ${DEFAULT_URL}

Direct (this process, same services as Learn prepare):
  backend/.env needs TRANSCRIPT24_API_KEY + AI_PROVIDER / AI_API_KEY / AI_MODEL
  Do not rely on yt-dlp — YouTube returns 429 / bot-check from laptops.

Remote (live API — recommended if you do not have Transcript24 locally):
  VOCA_ACCESS_TOKEN   Supabase session JWT (eyJ…) from DevTools after login
  VOCA_EMAIL / VOCA_PASSWORD  Sign in instead of a token
  VOCA_API_URL        Default https://voca-api.kenchange.com
  SUPABASE_URL / SUPABASE_ANON_KEY  Needed for email/password

Options:
  --url, --video, -u <youtube-url>   Video to probe (or env LEARN_VIDEO_URL)
  --cefr B1|B2|C1|…
  --transcript-only   Skip AI vocab (direct only)
  --allow-ytdlp       Opt in to yt-dlp fallback (usually blocked by YouTube)
`);
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`ok    ${message}`);
}

function preview(text, n = 240) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
}

async function jsonRequest(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 240) };
  }
  return { status: res.status, ok: res.ok, body };
}

async function resolveAccessToken() {
  const existing = String(process.env.VOCA_ACCESS_TOKEN || '').trim();
  if (existing) {
    const described = describeAccessToken(existing);
    if (!described.ok) {
      throw new Error(described.reason);
    }
    return existing;
  }

  const email = String(process.env.VOCA_EMAIL || '').trim();
  const password = process.env.VOCA_PASSWORD || '';
  if (!email || !password) return '';

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'VOCA_EMAIL/PASSWORD need SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_*)'
    );
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || 'sign-in failed');
  }
  return data.session.access_token;
}

function printVocab(items) {
  const list = Array.isArray(items) ? items : [];
  console.log(`vocab ${list.length} item(s)`);
  for (const item of list.slice(0, 20)) {
    const word = item?.word || '(no word)';
    const cefr = item?.cefrLevel || item?.cefr_level || '';
    const def = preview(item?.definition, 80);
    console.log(`  - ${word}${cefr ? ` [${cefr}]` : ''}${def ? ` — ${def}` : ''}`);
  }
  if (list.length > 20) console.log(`  … ${list.length - 20} more`);
  return list.length;
}

async function runDirect(options) {
  console.log(`mode  direct  cefr=${options.cefr}`);
  console.log(`url   ${options.url}`);

  const { youtubeTranscriptService } = await import(
    '../backend/src/services/youtubeTranscriptService.js'
  );
  const { transcript24Service } = await import(
    '../backend/src/services/transcript24Service.js'
  );
  const { sampleTranscriptForAnalysis } = await import(
    '../backend/src/services/youtubeAnalyzeHelpers.js'
  );
  const { VOCAB_SAMPLE_CHARS, VOCAB_TIMEOUT_MS } = await import(
    '../backend/src/services/lessonPrepareJob.js'
  );
  const { aiService } = await import('../backend/src/services/aiService.js');

  if (transcript24Service.isConfigured()) {
    ok('Transcript24 key is set');
  } else {
    console.log('note  TRANSCRIPT24_API_KEY missing — /learn on the server uses this, not yt-dlp');
  }

  const started = Date.now();
  const transcript = await youtubeTranscriptService.processYouTubeUrl(options.url, {
    transcript24TimeoutMs: 120000,
    skipYtDlpMeta: true,
    allowYtDlpFallback: options.allowYtdlp,
  });

  if (!transcript?.success) {
    fail(`transcript: ${transcript?.error || 'failed'}`);
    return;
  }

  const text = String(transcript.content || '');
  ok(
    `transcript provider=${transcript.provider || '?'} chars=${text.length} cues=${(transcript.cues || []).length} title=${transcript.title || transcript.videoInfo?.title || '?'}`
  );
  console.log(`snip  ${preview(text)}`);

  const sample = sampleTranscriptForAnalysis(text, VOCAB_SAMPLE_CHARS);
  ok(`sample chars=${sample.length} (cap ${VOCAB_SAMPLE_CHARS})`);

  if (options.transcriptOnly) {
    console.log(`done  transcript-only in ${Date.now() - started}ms`);
    return;
  }

  const configErr = aiService.configurationError();
  if (configErr) {
    fail(`AI config: ${configErr}`);
    return;
  }
  ok(`AI provider=${aiService.config.provider} model=${aiService.config.model}`);

  let result;
  try {
    result = await aiService.analyzeWebsiteContent(sample, options.cefr, {
      limit: 24,
      chunksToProcess: 3,
      chunkTimeout: VOCAB_TIMEOUT_MS,
    });
  } catch (err) {
    fail(`vocab first pass: ${err.message}`);
    try {
      result = await aiService.analyzeWebsiteContent(sample, options.cefr, {
        limit: 24,
        chunksToProcess: 3,
        chunkTimeout: VOCAB_TIMEOUT_MS,
        preferRecall: true,
      });
      ok('vocab retry (preferRecall) ran');
    } catch (retryErr) {
      fail(`vocab retry: ${retryErr.message}`);
      return;
    }
  }

  if (!(result?.vocabulary || []).length) {
    ok('first pass empty — retrying preferRecall');
    try {
      result = await aiService.analyzeWebsiteContent(sample, options.cefr, {
        limit: 24,
        chunksToProcess: 3,
        chunkTimeout: VOCAB_TIMEOUT_MS,
        preferRecall: true,
      });
    } catch (retryErr) {
      fail(`vocab retry: ${retryErr.message}`);
      return;
    }
  }

  const count = printVocab(result?.vocabulary);
  if (!count) {
    fail(
      'AI returned 0 vocabulary items. Check the snip above: if it is greetings/filler only, sampling is still too small; if it has real English, the model/prompt is dropping terms.'
    );
    return;
  }
  ok(`done in ${Date.now() - started}ms`);
}

async function runRemote(options) {
  const apiBase = String(process.env.VOCA_API_URL || 'https://voca-api.kenchange.com').replace(
    /\/$/,
    ''
  );
  console.log(`mode  remote  ${apiBase}  cefr=${options.cefr}`);
  console.log(`url   ${options.url}`);

  let token;
  try {
    token = await resolveAccessToken();
  } catch (err) {
    fail(`auth: ${err.message}`);
    return;
  }
  if (!token) {
    fail('set VOCA_ACCESS_TOKEN (JWT eyJ…) or VOCA_EMAIL + VOCA_PASSWORD');
    return;
  }
  ok('got access token');

  const auth = { Authorization: `Bearer ${token}` };
  const kicked = await jsonRequest(`${apiBase}/api/youtube/analyze`, {
    method: 'POST',
    headers: auth,
    body: { videoUrl: options.url },
  });
  if (!kicked.ok) {
    fail(
      `POST /api/youtube/analyze → ${kicked.status} ${kicked.body?.message || JSON.stringify(kicked.body)}`
    );
    return;
  }

  const lessonId = kicked.body?.lessonId;
  ok(`lesson ${lessonId} prepare=${kicked.body?.prepareStatus || kicked.body?.status}`);
  if (!lessonId) {
    fail('analyze did not return lessonId');
    return;
  }

  const deadline = Date.now() + 300000;
  let data = kicked.body;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const poll = await jsonRequest(`${apiBase}/api/youtube/lessons/${lessonId}`, {
      headers: auth,
    });
    if (!poll.ok) {
      fail(`GET lesson → ${poll.status} ${poll.body?.message || JSON.stringify(poll.body)}`);
      return;
    }
    data = poll.body;
    const job = data.prepareJob || {};
    console.log(
      `poll  status=${data.prepareStatus || job.status} step=${data.prepareStep || job.step} vocabReady=${data.vocabReady} n=${(data.vocabulary || []).length}`
    );
    if (data.vocabReady) break;
    if (data.prepareStatus === 'failed') {
      fail(`prepare failed: ${data.prepareError || 'unknown'}`);
      return;
    }
  }

  if (!data.vocabReady) {
    fail('timed out waiting for vocab (5 min). Job may still be running on the server.');
    return;
  }

  if (data.prepareError) {
    console.log(`note  prepareError=${data.prepareError}`);
  }
  const count = printVocab(data.vocabulary);
  if (!count) {
    fail(
      'API returned 0 vocabulary items. Re-run with --direct on a machine that has backend/.env to see transcript sample + AI errors.'
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const hasToken = Boolean(
    String(process.env.VOCA_ACCESS_TOKEN || '').trim() || process.env.VOCA_EMAIL
  );
  if (!options.remote && !options.direct) {
    if (hasToken) options.remote = true;
    else if (process.env.AI_API_KEY || process.env.OPENCODE_API_KEY) options.direct = true;
    else {
      printHelp();
      fail('pass --remote (login JWT/email) or --direct (backend/.env AI + Transcript24 keys)');
      return;
    }
  }

  if (options.remote) await runRemote(options);
  if (options.direct) await runDirect(options);

  if (process.exitCode === 1) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
