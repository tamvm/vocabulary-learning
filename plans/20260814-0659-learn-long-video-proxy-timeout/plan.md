# Plan: Learn long-video paste / highlights vs proxy timeout

**Linear:** [TOM-112](https://linear.app/timtam-wp/issue/TOM-112/learn-long-video-pastehighlights-hit-proxy-timeout)  
**Do not implement in this PR** — docs only.

## Problem

Pasting a long YouTube URL on `/learn` dies as a dropped connection. Copy blames highlights because `apiErrorMessage` maps every Axios Network Error to that string.

Hard limit: Cloudflare/cloudflared ~**100s**. Analyze still stacks Transcript24 + vocab + `summarizeAndChapter` (default **45s + 60s retry**, chapters on for long videos). Frontend waits **180s**. PR #32 only capped the **sync** highlights route.

## What exists / minimum / complexity

1. Reuse `video_lessons` + `GET /lessons/:id` + existing highlights POST. No new queue service.
2. Ship: (A) analyze must return under proxy budget **without** waiting on highlights; (B) highlights as 202 + background write + poll; (C) endpoint-specific errors.
3. ~6–8 files, 1 optional SQL column. Defer map-reduce summaries and quiz async.

## Options

| | Approach | Verdict |
|---|----------|---------|
| A | Tighten more sync timeouts | Band-aid. Slow models still 502. |
| B | Raise Cloudflare/Coolify timeouts | Not under app control; may be impossible. |
| **C** | **Analyze = transcript + vocab; highlights = 202 + poll** | **Recommended.** Matches 100s physics. |
| D | Chunked map-reduce summaries | Quality later; more AI cost. After C. |

## Phases

| Phase | File | Status |
|-------|------|--------|
| 0 Research | [research/scout-01-current-path.md](./research/scout-01-current-path.md) | done |
| 1 Decouple | [phase-01-analyze-under-budget.md](./phase-01-analyze-under-budget.md) | planned |
| 2 Async highlights | [phase-02-async-highlights-poll.md](./phase-02-async-highlights-poll.md) | planned |
| 3 Errors + tests | [phase-03-errors-and-verify.md](./phase-03-errors-and-verify.md) | planned |

## Locked decisions (for implementer)

- Do **not** await summary/chapters on `POST /analyze`.
- Do **not** hold `POST /highlights` for the LLM. Return **202** immediately.
- Poll `GET /lessons/:id` (add `summaryStatus` on the row or infer: pending if empty + flag).
- In-process background job on the API Node process (Coolify single replica). Document: restart can drop an in-flight job; user retries Generate.
- Abort AI HTTP on timeout (`req.destroy`), one pass at a time.
- Keep YouTube chapters from Transcript24/yt-dlp on analyze; AI chapters only in the highlights job if still missing.

## Success

Paste of a long interview returns vocab/study **before 100s**. Highlights fill in without Network Error. Study works with empty highlights until ready.
