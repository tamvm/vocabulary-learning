#!/usr/bin/env node

/**
 * Read-only ping so a free-tier Supabase project does not pause from inactivity.
 *
 * Usage:
 *   node scripts/supabase-keepalive.js
 *
 * Requires SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 * Never logs secret values. Does not write to the database.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TABLE = 'profiles';
export const DEFAULT_TIMEOUT_MS = 90_000;
export const DEFAULT_RETRIES = 1;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load KEY=VALUE pairs from a .env file without overwriting existing env.
 * Does not print file contents.
 */
export function loadDotEnvFile(filePath, env = process.env) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (env[key] === undefined || env[key] === '') {
      env[key] = value;
    }
  }
}

export function resolveConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anon = String(env.SUPABASE_ANON_KEY || '').trim();
  const service = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const table = String(env.SUPABASE_KEEPALIVE_TABLE || DEFAULT_TABLE).trim() || DEFAULT_TABLE;
  const key = anon || service;
  const keySource = anon ? 'SUPABASE_ANON_KEY' : service ? 'SUPABASE_SERVICE_ROLE_KEY' : null;

  const missing = [];
  if (!url) {
    missing.push('SUPABASE_URL');
  }
  if (!key) {
    missing.push('SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (missing.length > 0) {
    const error = new Error(`Missing required environment: ${missing.join(', ')}`);
    error.code = 'MISSING_CONFIG';
    throw error;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    const error = new Error('SUPABASE_URL is not a valid URL');
    error.code = 'INVALID_URL';
    throw error;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    const error = new Error('SUPABASE_URL must be an http(s) URL');
    error.code = 'INVALID_URL';
    throw error;
  }

  return {
    url,
    origin: parsed.origin,
    key,
    keySource,
    table,
  };
}

export function buildPingUrl(config) {
  const table = encodeURIComponent(config.table);
  return `${config.url}/rest/v1/${table}?select=id&limit=1`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function pingSupabase(config, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetchImpl(buildPingUrl(config), {
      method: 'GET',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Accept: 'application/json',
        Prefer: 'count=none',
      },
      signal: controller.signal,
    });
    // Consume the body so the socket can close; do not return or log it.
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeoutError = new Error(`timed out after ${timeoutMs}ms`);
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function pingSupabaseWithRetry(config, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? 3000;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await pingSupabase(config, options);
      if (result.ok) {
        return result;
      }
      // 4xx is a config/auth problem — fail closed without retry.
      if (result.status >= 400 && result.status < 500) {
        return result;
      }
      lastError = new Error(`HTTP ${result.status}`);
      lastError.result = result;
    } catch (error) {
      lastError = error;
    }

    if (attempt < retries) {
      await sleep(retryDelayMs);
    }
  }

  if (lastError && lastError.result) {
    return lastError.result;
  }
  throw lastError;
}

export async function runKeepalive(options = {}) {
  const env = options.env || process.env;
  const log = options.log || console.log;
  const error = options.error || console.error;

  let config;
  try {
    config = resolveConfig(env);
  } catch (err) {
    error(`Keepalive failed: ${err.message}`);
    return 1;
  }

  log(
    `Pinging Supabase host=${config.origin} table=${config.table} key=${config.keySource}`
  );

  try {
    const result = await pingSupabaseWithRetry(config, options);
    if (!result.ok) {
      error(`Keepalive failed: HTTP ${result.status} after ${result.elapsedMs}ms`);
      return 1;
    }
    log(`Keepalive ok: HTTP ${result.status} in ${result.elapsedMs}ms`);
    return 0;
  } catch (err) {
    error(`Keepalive failed: ${err.message}`);
    return 1;
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return fileURLToPath(import.meta.url) === path.resolve(entry);
}

if (isDirectRun()) {
  loadDotEnvFile(path.resolve(__dirname, '../backend/.env'));
  const code = await runKeepalive();
  process.exit(code);
}
