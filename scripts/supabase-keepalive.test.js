/**
 * Unit tests for the Supabase keep-alive ping.
 * Run: node scripts/supabase-keepalive.test.js
 */

import {
  DEFAULT_TABLE,
  buildPingUrl,
  pingSupabase,
  pingSupabaseWithRetry,
  resolveConfig,
  runKeepalive,
} from './supabase-keepalive.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function assertThrows(fn, code, message) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${message} (expected throw)`);
  } catch (error) {
    if (error.code === code) {
      passed += 1;
      console.log(`  ✓ ${message}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${message} (unexpected: ${error.code || error.message})`);
    }
  }
}

function mockResponse({ ok = true, status = 200, body = '[]' } = {}) {
  return {
    ok,
    status,
    arrayBuffer: async () => new TextEncoder().encode(body),
  };
}

const validEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key-secret',
};

console.log('🧪 Supabase keep-alive\n');

console.log('📝 resolveConfig');
assertThrows(() => resolveConfig({}), 'MISSING_CONFIG', 'fails closed when URL and key are missing');
assertThrows(
  () => resolveConfig({ SUPABASE_URL: 'https://example.supabase.co' }),
  'MISSING_CONFIG',
  'fails closed when both keys are missing'
);
assertThrows(
  () => resolveConfig({ SUPABASE_ANON_KEY: 'abc' }),
  'MISSING_CONFIG',
  'fails closed when URL is missing'
);
assertThrows(
  () => resolveConfig({ SUPABASE_URL: 'not-a-url', SUPABASE_ANON_KEY: 'abc' }),
  'INVALID_URL',
  'rejects a non-URL SUPABASE_URL'
);
assertThrows(
  () => resolveConfig({ SUPABASE_URL: 'postgres://db.example', SUPABASE_ANON_KEY: 'abc' }),
  'INVALID_URL',
  'rejects a non-http(s) SUPABASE_URL'
);

{
  const config = resolveConfig(validEnv);
  assert(config.origin === 'https://example.supabase.co', 'keeps https origin');
  assert(config.keySource === 'SUPABASE_ANON_KEY', 'prefers anon key');
  assert(config.table === DEFAULT_TABLE, 'defaults table to profiles');
  assert(config.key === 'test-anon-key-secret', 'reads anon key value');
}

{
  const config = resolveConfig({
    SUPABASE_URL: 'https://example.supabase.co/',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    SUPABASE_KEEPALIVE_TABLE: 'words',
  });
  assert(config.url === 'https://example.supabase.co', 'strips trailing slash');
  assert(config.keySource === 'SUPABASE_SERVICE_ROLE_KEY', 'falls back to service role key');
  assert(config.table === 'words', 'honors SUPABASE_KEEPALIVE_TABLE');
}

{
  const config = resolveConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
  });
  assert(config.key === 'anon', 'does not use service role when anon is set');
}

console.log('\n📝 buildPingUrl');
{
  const url = buildPingUrl({
    url: 'https://example.supabase.co',
    table: 'profiles',
  });
  assert(
    url === 'https://example.supabase.co/rest/v1/profiles?select=id&limit=1',
    'builds a read-only PostgREST select'
  );
}

console.log('\n📝 pingSupabase');
{
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return mockResponse();
  };
  const result = await pingSupabase(resolveConfig(validEnv), { fetchImpl, timeoutMs: 1000 });
  assert(result.ok === true, 'treats HTTP 200 as success');
  assert(result.status === 200, 'returns status 200');
  assert(calls[0].init.method === 'GET', 'uses GET (no writes)');
  assert(calls[0].init.headers.Prefer === 'count=none', 'avoids extra count query');
  assert(
    calls[0].url.includes('select=id&limit=1'),
    'requests a single id column'
  );
}

{
  const fetchImpl = async () => mockResponse({ ok: false, status: 401, body: '{"message":"invalid"}' });
  const result = await pingSupabase(resolveConfig(validEnv), { fetchImpl });
  assert(result.ok === false && result.status === 401, 'surfaces HTTP 401');
}

console.log('\n📝 pingSupabaseWithRetry');
{
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) {
      return mockResponse({ ok: false, status: 503, body: 'paused' });
    }
    return mockResponse();
  };
  const result = await pingSupabaseWithRetry(resolveConfig(validEnv), {
    fetchImpl,
    retries: 1,
    retryDelayMs: 1,
  });
  assert(attempts === 2, 'retries once on 5xx');
  assert(result.ok === true, 'succeeds after retry');
}

{
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return mockResponse({ ok: false, status: 401, body: 'nope' });
  };
  const result = await pingSupabaseWithRetry(resolveConfig(validEnv), {
    fetchImpl,
    retries: 2,
    retryDelayMs: 1,
  });
  assert(attempts === 1, 'does not retry 4xx');
  assert(result.status === 401, 'returns 401 without retry');
}

console.log('\n📝 runKeepalive (fail closed + no secret logs)');
{
  const logs = [];
  const errors = [];
  const code = await runKeepalive({
    env: {},
    log: (message) => logs.push(String(message)),
    error: (message) => errors.push(String(message)),
  });
  assert(code === 1, 'exits 1 when secrets are missing');
  assert(
    errors.some((line) => line.includes('Missing required environment')),
    'explains missing environment without dumping values'
  );
}

{
  const logs = [];
  const errors = [];
  const secret = 'super-secret-anon-key-do-not-log';
  const code = await runKeepalive({
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: secret,
    },
    fetchImpl: async () => mockResponse({ body: '[{"id":"should-not-appear"}]' }),
    log: (message) => logs.push(String(message)),
    error: (message) => errors.push(String(message)),
  });
  const combined = [...logs, ...errors].join('\n');
  assert(code === 0, 'exits 0 on a successful ping');
  assert(!combined.includes(secret), 'does not log the API key');
  assert(!combined.includes('should-not-appear'), 'does not log query row data');
  assert(combined.includes('key=SUPABASE_ANON_KEY'), 'logs which key name was used');
  assert(combined.includes('Keepalive ok'), 'logs success');
}

{
  const errors = [];
  const code = await runKeepalive({
    env: validEnv,
    fetchImpl: async () => mockResponse({ ok: false, status: 500, body: 'boom' }),
    retries: 0,
    log: () => {},
    error: (message) => errors.push(String(message)),
  });
  assert(code === 1, 'exits 1 on HTTP 500');
  assert(errors.some((line) => line.includes('HTTP 500')), 'reports the HTTP status');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
