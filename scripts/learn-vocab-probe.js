#!/usr/bin/env node

/**
 * Probe Learn vocabulary extraction (same local ranking as /learn prepare).
 *
 *   node scripts/learn-vocab-probe.js --local --cefr B2 --url 'https://www.youtube.com/watch?v=WZ7mmTrSgxI'
 *   node scripts/learn-vocab-probe.js --direct --url 'https://www.youtube.com/watch?v=WZ7mmTrSgxI'
 *
 * --local uses a caption fixture when the URL is WZ7mmTrSgxI (no YouTube / AI).
 * --direct calls Transcript24 then the same extractor (needs TRANSCRIPT24_API_KEY).
 *
 * Do not print API keys. Exit 0 if at least one candidate is returned.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  extractVocabCandidates,
  lemmaFromToken,
  lemmaLevel,
} from '../backend/src/services/vocabCandidates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const DEFAULT_URL = 'https://www.youtube.com/watch?v=WZ7mmTrSgxI';
const DEFAULT_VIDEO_ID = 'WZ7mmTrSgxI';
const LEVEL_RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

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
loadTranscript24FromOpenclaw();

function loadTranscript24FromOpenclaw() {
  if (String(process.env.TRANSCRIPT24_API_KEY || '').trim()) return;
  const filePath = path.join(homedir(), '.openclaw', 'openclaw.json');
  if (!existsSync(filePath)) return;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    const key =
      parsed.TRANSCRIPT24_API_KEY ||
      parsed.transcript24ApiKey ||
      parsed.transcript24?.apiKey;
    if (typeof key === 'string' && key.trim()) {
      process.env.TRANSCRIPT24_API_KEY = key.trim();
    }
  } catch {
    // ignore unreadable host config
  }
}

function extractVideoId(url) {
  const match = String(url || '').match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  return match ? match[1] : null;
}

function parseArgs(argv) {
  const options = {
    local: false,
    direct: false,
    cefr: process.env.LEARN_CEFR || 'B2',
    url: process.env.LEARN_VIDEO_URL || process.env.YOUTUBE_URL || DEFAULT_URL,
    transcriptFile: '',
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || '');
    const eq = raw.startsWith('-') ? raw.indexOf('=') : -1;
    const arg = eq > 1 ? raw.slice(0, eq) : raw;
    const inline = eq > 1 ? raw.slice(eq + 1) : '';

    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--local') options.local = true;
    else if (arg === '--direct') options.direct = true;
    else if (arg === '--cefr') options.cefr = inline || argv[++i] || options.cefr;
    else if (arg === '--transcript-file') {
      options.transcriptFile = inline || argv[++i] || '';
    } else if (arg === '--url' || arg === '--video' || arg === '-u') {
      options.url = inline || argv[++i] || options.url;
    } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
      options.url = arg;
    } else {
      console.error(`Unknown argument: ${argv[i]}`);
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/learn-vocab-probe.js [--local|--direct] [options]

  node scripts/learn-vocab-probe.js --local --cefr B2 --url '${DEFAULT_URL}'
  node scripts/learn-vocab-probe.js --direct --url '${DEFAULT_URL}'

--local     Rank vocab from a fixture or --transcript-file (no YouTube / AI)
--direct    Fetch transcript via Transcript24, then the same local ranker
--cefr      Learner level (default B2)
--url       YouTube URL (default ${DEFAULT_URL})
--transcript-file <path>
`);
}

function preview(text, n = 220) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
}

function fixturePathForUrl(url) {
  const videoId = extractVideoId(url);
  if (!videoId) return '';
  return path.join(__dirname, 'fixtures', `${videoId}.txt`);
}

function loadLocalTranscript(options) {
  if (options.transcriptFile) {
    if (!existsSync(options.transcriptFile)) {
      throw new Error(`transcript file not found: ${options.transcriptFile}`);
    }
    return {
      source: options.transcriptFile,
      text: readFileSync(options.transcriptFile, 'utf8'),
    };
  }
  const fixture = fixturePathForUrl(options.url);
  if (fixture && existsSync(fixture)) {
    return { source: fixture, text: readFileSync(fixture, 'utf8') };
  }
  throw new Error(
    `No local fixture for ${extractVideoId(options.url) || options.url}. ` +
      'Pass --transcript-file or run --direct on a host with TRANSCRIPT24_API_KEY.'
  );
}

function userLevelRank(cefr) {
  return LEVEL_RANK[String(cefr || 'B2').toUpperCase()] || 4;
}

function tokenize(text) {
  return String(text || '')
    .replace(/>>/g, ' ')
    .split(/[^A-Za-z']+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function printFunnel(text, cefr, candidates) {
  const tokens = tokenize(text);
  const lemmas = tokens.map((t) => lemmaFromToken(t)).filter(Boolean);
  const rank = userLevelRank(cefr);
  let short = 0;
  let belowCefr = 0;
  let offList = 0;
  for (const lemma of lemmas) {
    if (lemma.length < 3) {
      short += 1;
      continue;
    }
    const level = lemmaLevel(lemma);
    if (!level) offList += 1;
    else if (LEVEL_RANK[level] < rank) belowCefr += 1;
  }

  console.log(
    `funnel tokens=${tokens.length} lemmas=${lemmas.length} short<3=${short} below-${cefr}=${belowCefr} off-list=${offList}`
  );
  console.log(`snip  ${preview(text)}`);
  const words = candidates.map((item) => item.word);
  console.log(`vocab ${candidates.length} candidate(s): ${words.join(', ') || '(none)'}`);
  for (const item of candidates.slice(0, 12)) {
    const level = item.level ? ` [${item.level}]` : '';
    console.log(`  - ${item.word}${level} ×${item.count}`);
  }
}

function probeText(text, cefr, label) {
  const candidates = extractVocabCandidates(text, { cefr, limit: 36 });
  console.log(`ok    ${label} chars=${String(text || '').length} cefr=${cefr}`);
  printFunnel(text, cefr, candidates);
  if (!candidates.length) {
    console.error(
      'FAIL  0 candidates. If the snip is English, CEFR/lemma filtering is too aggressive; do not swap the app AI model.'
    );
    process.exitCode = 1;
    return;
  }
  const junk = candidates.filter((item) =>
    ['ther', 'bubbl', 'prick', 'alway', 'win'].includes(item.word)
  );
  if (junk.length) {
    console.error(`FAIL  junk stems still present: ${junk.map((item) => item.word).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('ok    local extractor returned a non-empty, non-junk list');
}

async function runDirect(options) {
  const { youtubeTranscriptService } = await import(
    '../backend/src/services/youtubeTranscriptService.js'
  );
  const { transcript24Service } = await import(
    '../backend/src/services/transcript24Service.js'
  );

  console.log(`mode  direct  cefr=${options.cefr}`);
  console.log(`url   ${options.url}`);
  if (!transcript24Service.isConfigured()) {
    console.error(
      'FAIL  TRANSCRIPT24_API_KEY is not set (backend/.env or ~/.openclaw/openclaw.json).'
    );
    process.exitCode = 1;
    return;
  }
  console.log('ok    Transcript24 key is set');

  const result = await youtubeTranscriptService.processYouTubeUrl(options.url, {
    transcript24TimeoutMs: 120000,
    metaTimeoutMs: 8000,
  });
  if (!result?.success) {
    console.error(`FAIL  transcript: ${result?.error || 'failed'}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `ok    transcript provider=${result.provider || '?'} cues=${(result.cues || []).length} title=${result.title || result.videoInfo?.title || '?'}`
  );
  probeText(result.content, options.cefr, 'live transcript');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.local && !options.direct) options.local = true;

  if (options.local) {
    console.log(`mode  local  cefr=${options.cefr}`);
    console.log(`url   ${options.url}`);
    const loaded = loadLocalTranscript(options);
    console.log(`ok    source=${path.relative(repoRoot, loaded.source) || loaded.source}`);
    probeText(loaded.text, options.cefr, 'fixture');
  }

  if (options.direct) {
    await runDirect(options);
  }

  if (process.exitCode === 1) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
