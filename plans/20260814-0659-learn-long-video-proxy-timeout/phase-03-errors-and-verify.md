# Phase 3 — Errors, tests, verify

**Priority:** P1.  
**Depends on:** Phase 1–2.

## Error copy

`apiErrorMessage(err, fallback)` must stay **generic**. Highlights-specific proxy text was misleading on analyze failures.

| Case | Message |
|------|---------|
| Network Error / no response | `The connection was interrupted before the server finished. Please try again.` |
| Caller fallback | Analyze: `Failed to analyze video`. Highlights kick: `Could not start highlights.` |
| 504 `highlights_timeout` | Keep only if a sync path remains (should be gone). |
| `summary_status=failed` | Show `summary_error` in the panel; keep Generate button |

Do not mention “highlights” on analyze failures.

## Tests (no TypeScript)

- `backend/test_youtube_analyze_helpers.js` — analyze + highlights **kick** budgets < 100s; pass timeouts sequential not summed past abort.
- `frontend/test_ai_errors.js` — Network Error is generic; optional `apiErrorMessage(err, 'Failed to analyze video')`.
- New small test: POST highlights with stub AI that sleeps 120s still returns 202 quickly (mock `setImmediate` / inject job runner).

## Verify locally (implementer)

1. `node backend/test_youtube_analyze_helpers.js`
2. `node frontend/test_ai_errors.js`
3. `npm test` at repo root (Quiz FSRS) if backend quiz files untouched — skip if docs-only.
4. Manual: paste long URL → vocab step appears; Highlights shows Generating then bullets. Chrome Network: analyze < 80s; highlights POST < 2s.

No production smoke (`voca.kenchange.com`).

## Unresolved

- Coolify replica count: in-process job is wrong if API scales to N nodes (poll would need shared DB status — column already solves visibility; **start** must be sticky or any node can run the job if POST is the only starter). Single replica today.
- Map-reduce for full-hour coverage (Phase 2 keeps 12k sample).
- Same 202 pattern for `/youtube/quiz` — separate issue if quiz 502s appear.

## Implementer commit style

`fix: generate Learn highlights off the request path (TOM-112)` plus `fix: skip summary on YouTube analyze to beat proxy timeout`.
