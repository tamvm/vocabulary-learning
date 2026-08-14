# Scout: Performance bottlenecks (Magic English)

**Date:** 2026-08-14  
**Method:** Codebase exploration of hot paths, SQL, frontend waterfalls, deploy topology.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + Tailwind (JS), Coolify `serve:3102` |
| Backend | Node/Express, single replica, in-process Learn jobs |
| DB/Auth | Supabase Postgres + Auth + RLS; JWT-scoped client per request |
| AI | OpenCode / Ollama / OpenAI (90–120s timeouts) |
| Edge | Cloudflare tunnel → Coolify; SPA `voca.kenchange.com` → API `voca-api.kenchange.com` |

## Ranked offenders

1. **`lessonPrepareJob.js`** — serial multi-minute AI (transcript → vocab → summary → quiz); in-process; restart drops work.
2. **`aiService.js`** — 90–120s HTTP timeouts; chunked content analysis.
3. **`GET /lessons/:id` + Learn 2s poll** — `select('*')` including cues/vocab/quiz while waiting.
4. **`groups.js`** — 1 + 2N count queries per groups list.
5. **`profile.js` / `flashcards.js` `/stats`** — load all words/cards into Node for aggregates.
6. **`frontend/src/lib/api.js`** — new Supabase client + `getSession` every Axios call.
7. **`auth.js` + flashcards double middleware** — remote `getUser` every protected request.
8. **Puppeteer/Chromium in API image** — RAM spikes; competes with jobs.
9. **No Redis / HTTP cache / ETag** — fine at small scale; not first fix for AI.

## Caching today

- Lesson transcript/summary/quiz stored in Postgres columns (`video_lessons`).
- History list uses projected columns (avoids transcript blob).
- No app-level response cache.

## Existing related plans

- `plans/20260814-0659-learn-long-video-proxy-timeout/` — async Learn vs ~100s proxy (partially shipped).
- `plans/20260813-2011-video-learn-study-ux/` — study cache columns.
- `docs/supabase-keepalive.md` — cold start after pause (~90s).

## Cross-cutting constraints

1. Proxy budget ~100s — sync AI behind HTTP → 502.
2. Horizontal Coolify replicas **break** in-process jobs until queue exists.
3. “Real-time sync” in marketing ≠ Supabase Realtime for lessons/vocab.
