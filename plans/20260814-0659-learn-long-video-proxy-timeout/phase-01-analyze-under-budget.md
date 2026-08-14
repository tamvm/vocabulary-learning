# Phase 1 — Analyze under the proxy budget

**Priority:** P0. Unblocks paste.  
**Depends on:** nothing.

## Goal

`POST /api/youtube/analyze` returns JSON (success or structured error) **before ~80s**, including hour-long videos. Highlights are **not** on this request.

## Current (remove)

In `backend/src/routes/youtube.js` analyze:

- `Promise.allSettled([vocab, summarizeAndChapter(...)])`
- `summarizeAndChapter` uses default 45s + 60s retry and `needChapters` when duration ≥ 8 min and no YT chapters

That is the paste timeout.

## Change

1. Analyze pipeline:
   - Transcript24 (keep 60s cap) + optional 8s meta
   - Persist `video_lessons` with transcript/cues/YT chapters **as soon as transcript exists** (checkpoint even if vocab fails)
   - Vocab only: 1 chunk, `chunkTimeout` ≤ 25s, overall analyze `withTimeout` **75000ms**
   - **Do not call** `summarizeAndChapter` here
   - Response: `summary: ''` unless a previous lesson row already has a summary (reuse)
2. If leftover budget after vocab is < 5s, skip vocab and return transcript + warning (`vocabulary_timeout`) rather than dying on the proxy.
3. Frontend `youtubeAPI.analyze` timeout: **90000** (fail closed with our JSON / axios timeout, not 180s past the tunnel).
4. After analyze success, existing auto-highlights effect still runs — Phase 2 makes that POST cheap.

## Files

| File | Action |
|------|--------|
| `backend/src/routes/youtube.js` | Drop summary from analyze; hard cap; persist transcript first |
| `backend/src/services/youtubeAnalyzeHelpers.js` | `ANALYZE_ROUTE_TIMEOUT_MS` (~75s) |
| `backend/test_youtube_analyze_helpers.js` | Assert analyze budget < proxy |
| `frontend/src/lib/api.js` | Analyze axios timeout 90s |

## Tests

- Helper: analyze timeout constant < `PROXY_REQUEST_BUDGET_MS`.
- Optional: analyze handler unit-test with stubbed transcript + delayed summary must **not** be invoked (spy).

## Success

Paste long URL → step 2 vocab (or empty vocab + warning) without Network Error. Highlights panel may still be empty until Phase 2.
