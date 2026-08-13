#!/usr/bin/env node

/**
 * Ping Supabase so free-tier projects do not auto-pause from inactivity.
 *
 * Free projects pause after ~7 days without DB activity. This script runs a
 * cheap read (HEAD select) so Postgres / PostgREST stay warm.
 *
 * Usage:
 *   node scripts/supabase-keepalive.js
 *   npm run supabase:keepalive
 *
 * Env (from process env or backend/.env):
 *   SUPABASE_URL                          required
 *   SUPABASE_SERVICE_ROLE_KEY             preferred
 *   SUPABASE_ANON_KEY                     fallback if service role unset
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const MAX_ATTEMPTS = 3;
const RETRY_MS = 5000;
/** Paused projects can take a long time on first wake. */
const FETCH_TIMEOUT_MS = 90_000;

const PING_TABLES = ['profiles', 'words', 'users'];

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!supabaseUrl) {
  fail('Missing SUPABASE_URL');
}

if (!supabaseKey) {
  fail(
    'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY'
  );
}

const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: (url, options = {}) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      return fetch(url, { ...options, signal: controller.signal }).finally(() => {
        clearTimeout(timer);
      });
    },
  },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cheap round-trip through PostgREST → Postgres.
 * head: true returns no rows; count still hits the database.
 */
async function pingTable(table) {
  const { error, count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .limit(1);

  if (error) {
    return { ok: false, table, error: error.message };
  }

  return { ok: true, table, count: count ?? 0 };
}

async function pingOnce() {
  const errors = [];

  for (const table of PING_TABLES) {
    const result = await pingTable(table);
    if (result.ok) {
      return result;
    }
    errors.push(`${table}: ${result.error}`);
  }

  // Last resort: touch PostgREST root (still activity against the API gateway).
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(
      `All table pings failed (${errors.join('; ')}); REST root HTTP ${res.status}`
    );
  }

  return { ok: true, table: 'rest/v1/', count: null, fallback: true };
}

async function main() {
  console.log('🔄 Supabase keep-alive');
  console.log(`   URL host: ${new URL(supabaseUrl).host}`);
  console.log(`   Key: ${usingServiceRole ? 'service_role' : 'anon'}`);

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await pingOnce();
      const where = result.fallback
        ? result.table
        : `${result.table} (count≈${result.count})`;
      console.log(`✅ Keep-alive ok via ${where} (attempt ${attempt}/${MAX_ATTEMPTS})`);
      process.exit(0);
    } catch (err) {
      lastError = err;
      const msg = err?.name === 'AbortError' ? 'request timed out' : err.message;
      console.warn(`⚠️  Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_MS * attempt);
      }
    }
  }

  fail(`Keep-alive failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message || lastError}`);
}

main();
