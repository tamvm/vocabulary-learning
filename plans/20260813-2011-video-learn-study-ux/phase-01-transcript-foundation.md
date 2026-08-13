# Phase 1 — Transcript foundation (backend)

## Goal
Primary transcript via Transcript24 (timed captions); yt-dlp fallback; analyze returns cues; lesson caches transcript for quiz.

## Tasks
- T1.0 `transcript24Service.js` — `POST /transcribe`, map `caption[]` → cues; env `TRANSCRIPT24_API_KEY`
- T1.1 Orchestrator: Transcript24 first, yt-dlp fallback; unified `{ content, cues, videoInfo, provider }`
- T1.2 yt-dlp path: keep VTT cues; pass `chapters` / thumbnail from dump-json
- T1.3 Migration `14_video_lessons_study_cache.sql` (cues, text, summary, chapters, duration, optional `transcript_provider`)
- T1.4 Persist on analyze
- T1.5 Return `cues` (+ chapters when known) from `/analyze`
- T1.6 Quiz loads cache by `lessonId` when present (no re-call Transcript24/yt-dlp)

## Secrets / ops
- Hermes (Tony Mac) → Cursor secret + Coolify: `TRANSCRIPT24_API_KEY`
- Egress: `api.transcript24.com`
- MVP: `prefer: "auto"`, **no** `sceneDetection`

## Done when
- With key set, analyze a YouTube URL → `cues[{start,end,text}]` from Transcript24
- Without key / T24 failure → yt-dlp fallback still works
- Quiz with `lessonId` uses cache (no second external transcript call)
