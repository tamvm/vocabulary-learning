# Scout: Learn long-video timeout (current path)

Linear: [TOM-112](https://linear.app/timtam-wp/issue/TOM-112/learn-long-video-pastehighlights-hit-proxy-timeout). Related done: TOM-103 (analyze 502), TOM-110 (highlights endpoint), PR #32 (sync highlights under ~80s).

## User-visible failure

Paste long YouTube URL on `/learn` → Axios `Network Error` (no HTTP body) → `apiErrorMessage()` always says:

> The connection was interrupted before the server finished. Generating highlights can hit a proxy timeout — please try again.

That string is **not highlights-specific**. Any dropped socket on Learn (analyze, highlights, quiz) maps to it. `frontend/src/lib/aiErrors.js`.

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
