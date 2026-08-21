# Research: Supabase RLS & auth request tax

**Date:** 2026-08-14  
**Sources:** Supabase RLS production guides (2025–2026), repo `backend/sql/*`, `auth.js`, `api.js`

## Executive summary

Per-request remote `getUser` + per-Axios `createClient` add latency on **every** CRUD call. That is fixable without leaving Supabase. Separately, RLS policies that call `auth.uid()` without `(select auth.uid())` can add 2×–11× query cost on large tables — audit policies when word/card counts grow.

## Findings relevant to Magic English

1. **App-layer tax (confirmed in code)**  
   - Axios interceptor: dynamic import + new client + `getSession` every request (`frontend/src/lib/api.js`).  
   - Auth middleware: construct client + `getUser` every protected call (`backend/src/middleware/auth.js`).  
   Fix: shared browser client (TOM-85); local JWT verify with JWKS/secret + user-scoped Supabase client for RLS (TOM-87 pattern).

2. **RLS InitPlan pattern**  
   Prefer `(select auth.uid()) = user_id` so Postgres evaluates once per statement. Index `user_id` (and composites used in filters). Repo policies often use bare `auth.uid()` — low priority until EXPLAIN shows pain.

3. **Do not leave Supabase for RLS latency**  
   Leaving Auth/RLS is a rewrite. Query shape + indexes + InitPlan fix the same class of issues cheaper.

## Recommendation

Phase 1: TOM-85 + auth middleware cleanup. Phase 2+: EXPLAIN on groups/profile/flashcards; wrap `auth.uid()` if needed. Stay on Supabase unless pool/cost/product walls appear.
