# Phase 2 — Async highlights (202 + poll)

**Priority:** P0.  
**Depends on:** Phase 1 (analyze no longer generates summary).

## Goal

Generating highlights never holds the Cloudflare request. Slow models can take minutes. UI stays on Vocab/Study.

**Evidence:** production `POST /lessons/:id/highlights` returns **502**, not `{ error: 'highlights_timeout' }`. The gateway wins the race against the 80s Express cap. Kick must return in **&lt;2s**.

## Design (KISS — no Redis)

```
POST /lessons/:id/highlights
  auth + own lesson + transcript ≥ 80 chars
  if summary already good → 200 { summary, chapters, status: 'ready' }
  if status pending (started recently) → 202 { status: 'pending' }
  else set summary_status=pending, return 202 immediately
  setImmediate: run summarizeAndChapter, write summary/chapters, status=ready|failed

GET /lessons/:id  (existing)
  include summaryStatus, summaryError

Learn.jsx
  POST once (auto or button)
  poll GET every 2s, stop at 3 min or ready/failed
  LessonSummary: Generating… until ready
```

### Status column (preferred)

`backend/sql/16_video_lessons_summary_status.sql`:

```sql
ALTER TABLE public.video_lessons
  ADD COLUMN IF NOT EXISTS summary_status text DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS summary_error text;
-- idle | pending | ready | failed
```

Inferring “pending” only from empty summary races with two tabs. Column is small and RLS already covers the table.

Fallback if migration delayed: in-memory `Map<lessonId, startedAt>` **plus** skip POST if another request is in flight — weaker across restarts.

### AI call rules

- `needChapters: false` if YT chapters already on the row; else true **only** in the background job (no proxy clock).
- Single pass first (e.g. 90s). Retry without chapters only if summary empty/rejected.
- **Abort** the HTTP request on timeout: pass `Abort`/`req.destroy` into `httpRequest`. Do not start pass-2 until pass-1 is destroyed.
- Keep `sampleTranscriptForAnalysis` 12k for v1. Map-reduce (per-chunk then merge) is a later quality PR, not required to fix timeout.

### Concurrency

- One job per lesson. Second POST while pending → 202, no second LLM.
- Button “Generate highlights” if `failed` or `idle` with empty summary.
- Unload/restart: pending stuck > 4 min → treat as failed on GET so the button works.

## Files

| File | Action |
|------|--------|
| `backend/sql/16_video_lessons_summary_status.sql` | create |
| `backend/src/routes/youtube.js` | 202 + background; hydrate status on GET |
| `backend/src/services/aiService.js` | abort on timeout; sequential retry |
| `frontend/src/lib/api.js` | highlights timeout 15s (kick only) |
| `frontend/src/pages/Learn.jsx` | poll; don’t toast Network Error on kick |
| `frontend/src/components/Learn/LessonSummary.jsx` | pending vs failed copy |

## Security

- Background job must use the **same user-scoped** Supabase client / `user_id` filter. Do not switch to service role for this write unless RLS update already allows the user.
- Auth on POST unchanged.

## Success

Auto-generate after paste: 202 in <1s, bullets appear within poll window. No proxy Network Error on this path.
