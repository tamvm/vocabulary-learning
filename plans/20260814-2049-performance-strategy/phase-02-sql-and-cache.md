# Phase 2 — SQL aggregates + caches

**Priority:** After Phase 1  
**Status:** Planned  
**Invasiveness:** M (SQL RPC/views + routes)

## Context

- Linear: [TOM-96](https://linear.app/timtam-wp/issue/TOM-96), [TOM-82](https://linear.app/timtam-wp/issue/TOM-82), [TOM-88](https://linear.app/timtam-wp/issue/TOM-88)
- RLS InitPlan notes: [reports/01-supabase-rls-auth-tax.md](./reports/01-supabase-rls-auth-tax.md)

## Requirements

1. **Groups O(1) queries (TOM-96)**  
   - Replace 2 counts/group in `groups.js` with one aggregated query/RPC/view.  
   - Fix any incorrect JSON due filter on words vs `quiz_questions`.

2. **Profile + flashcard stats aggregates (TOM-82 + `/stats`)**  
   - `count` / `group by` in SQL; stop loading all words/cards into Node.

3. **Transcript cache by `video_id` (TOM-88)**  
   - Skip Transcript24 when a usable cached row exists (per-user first; cross-user optional later).

4. **Puppeteer fallback-first**  
   - Prefer fetch/Readability; Chromium only when needed. Shrink API RAM pressure.

5. **CDN for SPA static**  
   - Confirm Cloudflare caches hashed assets; do **not** cache authenticated `/api`.

6. **Indexes / RLS**  
   - Only after EXPLAIN: composites, `(select auth.uid())` InitPlan wrap if policies hurt.

## Acceptance

- `GET /api/groups` query count independent of group count.
- Profile/stats endpoints do not download full word/card tables.
- Re-analyze same video skips external transcript when cache hit.
- Frontend TTFB for static assets acceptable via CDN.

## Verify

- Before/after query counts (logs or Supabase dashboard).
- Profile numbers match old JS aggregation on a fixture user.
- Transcript cache hit logged.
