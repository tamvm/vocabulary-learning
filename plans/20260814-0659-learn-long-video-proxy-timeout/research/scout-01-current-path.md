# Scout: Learn long-video timeout (current path)

Linear: [TOM-112](https://linear.app/timtam-wp/issue/TOM-112/learn-long-video-pastehighlights-hit-proxy-timeout). Related done: TOM-103 (analyze 502), TOM-110 (highlights endpoint), PR #32 (sync highlights under ~80s).

## User-visible failure

Two client shapes, same cause:

1. Browser Axios **Network Error** (no body) → `apiErrorMessage()` says the highlights/proxy copy (`frontend/src/lib/aiErrors.js`). That string is **not highlights-specific**.
2. **Confirmed 2026-08-14:** `POST https://voca-api.kenchange.com/api/youtube/lessons/{id}/highlights` with `{}` returns **502** (gateway). Axios interceptor maps 502/504 to “server took too long / gateway timeout” when a body exists.

**502 (not Express 504 JSON `highlights_timeout`)** means Cloudflare/cloudflared/Coolify cut the origin **before** `withTimeout(80s)` could write JSON. The live proxy budget is **≤ Express’s 80s cap** (often ~60s Traefik / ~100s CF; 502 = origin dropped or CF origin-fail). Tightening Express timeouts only helps if we go well under that; holding the LLM on this POST cannot be made reliable.

Do not replay production curls with user JWTs. Rotate the session if a token was pasted into chat.

## Proxy budget (hard)

Production API: `voca-api.kenchange.com` via **cloudflared**. Cloudflare/cloudflared idle/proxy timeout ≈ **100s**. Constants in `backend/src/services/youtubeAnalyzeHelpers.js`:

- `PROXY_REQUEST_BUDGET_MS = 100000`
- Highlights route self-timeout `80000` (PR #32)
- Frontend axios: analyze/highlights/quiz **180000** — longer than proxy → client waits until the tunnel drops → Network Error, never sees 504 JSON

Raising Cloudflare timeout is not a reliable product fix (tunnel / Free-Pro limits). Coolify Traefik may be ≤100s too.

## Request path after paste

```
Learn.analyzeVideo
  POST /api/youtube/analyze  (timeout 180s)
    Transcript24 up to 60s + yt-dlp meta 8s
    then Promise.allSettled:
      vocab: analyzeWebsiteContent (1 chunk, chunkTimeout 45s)
      summary: summarizeAndChapter(needChapters for long vids without YT chapters)
               defaults firstTimeout 45s + retryTimeout 60s  → up to ~105s
    persist video_lessons
    return JSON

If summary empty, useEffect auto:
  POST /api/youtube/lessons/:id/highlights  (timeout 180s)
    sample 12k chars start/mid/end
    summarizeAndChapter(needChapters: false, 40s + 25s) wrapped in 80s withTimeout
```

Long interviews without YouTube chapters: **analyze already runs the slow chapter+summary path**. If that overruns 100s, paste fails before highlights. If analyze “succeeds” with empty summary (settled reject / rejected dump), auto-highlights starts a **second** long hold.

## Why PR #32 is not enough

1. Analyze still uses **default** summary timeouts (45+60) and **needChapters: true** for long videos.
2. `withTimeout` **races** but does not `req.destroy()` the AI HTTP call (`aiService.httpRequest`). Pass-1 can still occupy the event loop / sockets while pass-2 starts. Node may not write 504 before the proxy cuts.
3. Highlights remain **synchronous**. Slow models still lose to 100s.
4. Transcript sample is 12k chars (~few minutes of speech). Hour-long videos get thin coverage even when the call succeeds.

## Reuse

| Piece | Reuse |
|-------|--------|
| `video_lessons.summary` / `chapters` / `transcript_text` | Job output columns |
| `GET /api/youtube/lessons/:id` | Poll target |
| `POST .../highlights` | Kick job instead of await AI |
| `sampleTranscriptForAnalysis` | Keep for single-pass AI |
| `normalizeLessonSummary` | Keep dump rejection |
| In-process fire-and-forget | Same pattern as quiz-question gen on `words` routes — **no new queue infra** |

## Out of scope for this plan

Quiz 502 on long videos (same proxy class; same async pattern later). Redis/Bull. Raising Cloudflare timeouts as the primary fix.
