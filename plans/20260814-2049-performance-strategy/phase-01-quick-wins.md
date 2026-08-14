# Phase 1 — Quick wins (Keep-stack)

**Priority:** Highest leverage after measure  
**Status:** Planned  
**Invasiveness:** S–M (~handful of files)

## Context

- Linear: [TOM-85](https://linear.app/timtam-wp/issue/TOM-85), [TOM-87](https://linear.app/timtam-wp/issue/TOM-87), [TOM-98](https://linear.app/timtam-wp/issue/TOM-98)
- Learn async: `plans/20260814-0659-learn-long-video-proxy-timeout/`

## Requirements

1. **Shared Supabase client (TOM-85)**  
   - Files: `frontend/src/lib/api.js`, export from Auth/`lib/supabase.js`  
   - Interceptor only reads `session.access_token` from singleton.

2. **Remove double auth (TOM-87)**  
   - Files: `backend/src/server.js`, `backend/src/routes/flashcards.js`  
   - Auth once per request. Optional follow-up: local JWT verify (see unresolved in plan.md).

3. **Slim Learn poll**  
   - Files: `backend/src/routes/youtube.js`, `frontend/src/pages/Learn.jsx`  
   - Poll returns status/`prepareJob` (+ flags), not full `select('*')` cues blob.  
   - Adaptive interval / pause when tab hidden.

4. **Guard Learn async**  
   - No sync AI path that can exceed proxy ~100s. Align with existing 202 + enqueue design.

5. **Prune activity_history (TOM-98)**  
   - File: `backend/src/routes/profile.js` — keep last N days on write.

## Acceptance

- No `createClient` per Axios call.
- Flashcards: single auth validation path.
- Pending Learn poll payload ≪ full lesson hydrate.
- Long-video paste does not 502 waiting on LLM.
- Activity JSON capped on write.

## Verify

- Code review + local Network size for poll.
- Manual Learn pending → ready path.
- Profile activity write still updates streak.
