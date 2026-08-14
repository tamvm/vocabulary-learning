# Phase 0 — Measure

**Priority:** Do first  
**Status:** Planned  
**Invasiveness:** S (observability only)

## Context

- [scout-01-bottlenecks.md](./scout/scout-01-bottlenecks.md)
- Existing `[learn-job]` logs in `lessonPrepareJob.js`

## Goal

Attach numbers to each pain before coding Phase 1–2. Avoid rewriting on vibes.

## Tasks

1. **Learn step timings** — confirm logs for transcript / vocab / highlights / quiz durations on one long video.
2. **Browser Network pass** (logged-in):
   - `GET /api/groups` — time + response size
   - `GET /api/profile` — payload size vs word count
   - Learn poll `GET /lessons/:id` — KB while pending
3. **Query count** — note groups list issues 1 + 2N round-trips (code-confirmed).
4. **Confirm proxy budget** — ~100s remains hard constraint for sync AI.

## Acceptance

- Short table: pain → measured ms/KB/query count (or “code-proven N+1”).
- Decision: Phase 1 order still matches measurements (or reordered).

## Non-goals

No production curl of live app as “proof of deploy.” Local/staging Network + logs enough.
