#!/usr/bin/env node

/**
 * Probe the AI provider using the same env Coolify sets on the backend,
 * or by calling the live API (proves the running container, not just a local .env).
 *
 * Remote (recommended after deploy — uses Coolify's process env):
 *   VOCA_ACCESS_TOKEN='<Bearer from browser after login>' \
 *     node scripts/check-ai-service.js --remote
 *
 *   VOCA_EMAIL=you@example.com VOCA_PASSWORD='...' \
 *     node scripts/check-ai-service.js --remote
 *
 * Direct (same AI_* vars as Coolify; exec in the backend container or copy env locally):
 *   node scripts/check-ai-service.js --direct
 *
 * Options:
 *   --remote              Hit VOCA_API_URL (default https://voca-api.kenchange.com)
 *   --direct              Load backend/.env and call the provider from this process
 *   --word <word>         Word for analyze-word (default: serendipity)
 *   --expect-provider X   Fail if provider differs (opencode / opencode-go treated as aliases)
 *   --expect-model X      Fail if model differs (Coolify default: mimo-v2.5)
 *   --skip-completion     Skip chat/analyze; only health + config + /models
 *   --help
 *
 * Do not print API keys or JWTs. Exit 0 on success, 1 on failure.
 */

import { existsSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assertExpectedModel,
  assertExpectedProvider,
  classifyAnalyzeWordBody,
  classifyChatCompletionBody,
  classifyConfigBody,
  classifyTestConnectionBody,
} from './aiServiceProbe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

function loadEnvFile(filePath) {
  if (!existsSync(filePath) || typeof process.loadEnvFile !== 'function') return;
  try {
    process.loadEnvFile(filePath);
  } catch {
    // Missing or unreadable .env is fine; Coolify injects process env.
  }
}

loadEnvFile(path.join(repoRoot, 'backend', '.env'));
loadEnvFile(path.join(repoRoot, 'frontend', '.env.local'));
loadEnvFile(path.join(repoRoot, 'frontend', '.env'));

function parseArgs(argv) {
  const options = {
    remote: false,
    direct: false,
    word: 'serendipity',
    expectProvider: process.env.EXPECT_AI_PROVIDER || '',
    expectModel: process.env.EXPECT_AI_MODEL || '',
    skipCompletion: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--remote') options.remote = true;
    else if (arg === '--direct') options.direct = true;
    else if (arg === '--skip-completion') options.skipCompletion = true;
    else if (arg === '--word') options.word = argv[++i] || options.word;
    else if (arg === '--expect-provider') options.expectProvider = argv[++i] || '';
    else if (arg === '--expect-model') options.expectModel = argv[++i] || '';
    else {
      console.error(`Unknown argument: ${arg}`);
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/check-ai-service.js [--remote|--direct] [options]

Remote (live Coolify API):
  VOCA_ACCESS_TOKEN   Supabase access JWT (Network tab → Authorization: Bearer …)
  VOCA_EMAIL / VOCA_PASSWORD  Sign in instead of a token
  VOCA_API_URL        Default https://voca-api.kenchange.com
  SUPABASE_URL / SUPABASE_ANON_KEY  Or VITE_SUPABASE_* from frontend/.env

Direct (this process, Coolify-equivalent env):
  AI_PROVIDER         opencode | opencode-go | openai | ollama-cloud | ollama-local
  AI_API_KEY          or OPENCODE_API_KEY
  AI_MODEL            e.g. mimo-v2.5

  --expect-provider opencode --expect-model mimo-v2.5
  --skip-completion
`);
}

function maskSecret(value) {
  const s = String(value || '');
  if (!s) return '(empty)';
  if (s.length <= 8) return '********';
  return `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})`;
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`ok    ${message}`);
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
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ok: res.ok, body };
}

async function resolveAccessToken() {
  const existing = String(process.env.VOCA_ACCESS_TOKEN || '').trim();
  if (existing) return existing;

  const email = String(process.env.VOCA_EMAIL || '').trim();
  const password = process.env.VOCA_PASSWORD || '';
  if (!email || !password) return '';

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('VOCA_EMAIL/PASSWORD need SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_*)');
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || 'sign-in failed');
  }
  return data.session.access_token;
}

function checkExpectations(provider, model, options) {
  const p = assertExpectedProvider(provider, options.expectProvider);
  if (!p.ok) fail(p.reason);
  else if (options.expectProvider) ok(`provider matches ${options.expectProvider}`);

  const m = assertExpectedModel(model, options.expectModel);
  if (!m.ok) fail(m.reason);
  else if (options.expectModel) ok(`model matches ${options.expectModel}`);
}

async function runRemote(options) {
  const apiBase = String(process.env.VOCA_API_URL || 'https://voca-api.kenchange.com').replace(/\/$/, '');
  console.log(`mode  remote  ${apiBase}`);

  const health = await jsonRequest(`${apiBase}/health`);
  if (!health.ok || health.body?.status !== 'ok') {
    fail(`/health → ${health.status} ${JSON.stringify(health.body)}`);
    return;
  }
  ok(`/health ${health.body.timestamp || ''}`);

  let token;
  try {
    token = await resolveAccessToken();
  } catch (err) {
    fail(`auth: ${err.message}`);
    return;
  }
  if (!token) {
    fail('set VOCA_ACCESS_TOKEN or VOCA_EMAIL + VOCA_PASSWORD (AI routes require a logged-in user)');
    return;
  }
  ok('got access token');

  const auth = { Authorization: `Bearer ${token}` };

  const configRes = await jsonRequest(`${apiBase}/api/ai/config`, { headers: auth });
  if (configRes.status === 401) {
    fail('/api/ai/config → 401 (token rejected)');
    return;
  }
  const configClass = classifyConfigBody(configRes.body);
  if (!configClass.ok) {
    fail(`/api/ai/config → ${configRes.status} ${configClass.reason}`);
    return;
  }
  ok(`/api/ai/config provider=${configClass.config.provider} model=${configClass.config.model}`);
  checkExpectations(configClass.config.provider, configClass.config.model, options);

  const testRes = await jsonRequest(`${apiBase}/api/ai/test-connection`, {
    method: 'POST',
    headers: auth,
  });
  const testClass = classifyTestConnectionBody(testRes.body);
  if (!testClass.ok) {
    fail(`/api/ai/test-connection → ${testRes.status} ${testClass.reason}`);
    return;
  }
  ok(`/api/ai/test-connection ${testClass.message} (${testClass.provider} / ${testClass.model})`);

  if (options.skipCompletion) return;

  const wordRes = await jsonRequest(`${apiBase}/api/ai/analyze-word`, {
    method: 'POST',
    headers: auth,
    body: { word: options.word, autoSave: false },
  });
  if (!wordRes.ok) {
    const msg = wordRes.body?.message || wordRes.body?.error || JSON.stringify(wordRes.body);
    fail(`/api/ai/analyze-word → ${wordRes.status} ${msg}`);
    return;
  }
  const wordClass = classifyAnalyzeWordBody(wordRes.body);
  if (!wordClass.ok) {
    fail(`/api/ai/analyze-word ${wordClass.reason}`);
    return;
  }
  ok(`/api/ai/analyze-word "${wordClass.word || options.word}" (${wordClass.wordType || 'ok'})`);
}

async function runDirect(options) {
  console.log('mode  direct  (process env / backend/.env)');
  console.log(`      AI_PROVIDER=${process.env.AI_PROVIDER || '(unset → openai)'}`);
  console.log(`      AI_MODEL=${process.env.AI_MODEL || '(unset → provider default)'}`);
  console.log(`      AI_API_KEY=${maskSecret(process.env.AI_API_KEY || process.env.OPENCODE_API_KEY)}`);

  const { aiService } = await import('../backend/src/services/aiService.js');

  const cfg = aiService.getConfig();
  const configClass = classifyConfigBody({ config: cfg });
  if (!configClass.ok) {
    fail(`getConfig: ${configClass.reason}`);
    return;
  }
  ok(`getConfig provider=${cfg.provider} model=${cfg.model}`);
  checkExpectations(cfg.provider, cfg.model, options);

  const test = await aiService.testConnection();
  const testClass = classifyTestConnectionBody(test);
  if (!testClass.ok) {
    fail(`testConnection: ${testClass.reason}`);
    return;
  }
  ok(`testConnection ${test.message}`);

  if (options.skipCompletion) return;

  let completion;
  try {
    completion = await aiService.makeRequest(
      'chat/completions',
      {
        model: aiService.config.model,
        messages: [{ role: 'user', content: 'Reply with exactly the single word: pong' }],
        temperature: 0,
        max_tokens: 16,
      },
      { timeout: 60000 }
    );
  } catch (err) {
    const msg = String(err?.message || err);
    fail(`chat/completions: ${msg.replace(/sk-[a-zA-Z0-9]+/g, 'sk-***').slice(0, 240)}`);
    return;
  }
  const chatClass = classifyChatCompletionBody(completion);
  if (!chatClass.ok) {
    fail(`chat/completions ${chatClass.reason}`);
    return;
  }
  ok(`chat/completions "${chatClass.preview}"`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const hasToken = Boolean(String(process.env.VOCA_ACCESS_TOKEN || '').trim() || process.env.VOCA_EMAIL);
  if (!options.remote && !options.direct) {
    if (hasToken) options.remote = true;
    else if (process.env.AI_API_KEY || process.env.OPENCODE_API_KEY) options.direct = true;
    else {
      printHelp();
      fail('pass --remote (with token/email) or --direct (with AI_API_KEY)');
      return;
    }
  }

  if (options.remote) await runRemote(options);
  if (options.direct) await runDirect(options);

  if (process.exitCode === 1) {
    console.error('\nAI probe failed. On Coolify backend check AI_PROVIDER, AI_API_KEY (or OPENCODE_API_KEY), AI_MODEL=mimo-v2.5, then redeploy.');
    process.exit(1);
  }
  console.log('\nAI probe passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
