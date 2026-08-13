# Phase 1 — Transcript foundation (backend)

## Goal
Analyze returns timed cues + YT chapters metadata; lesson row caches transcript for quiz.

## Tasks
- T1.1 Keep `cues` from `parseVTT` in `processYouTubeUrl`
- T1.2 Pass `chapters` / thumbnail from yt-dlp `--dump-json`
- T1.3 Migration `14_video_lessons_study_cache.sql` (cues, text, summary, chapters, duration)
- T1.4 Persist on analyze
- T1.5 Return `cues` (+ YT chapters) from `/analyze`
- T1.6 Quiz loads cache by `lessonId` when present

## Done when
- Analyze JSON includes `cues[{start,end,text}]`
- Second quiz call with `lessonId` skips yt-dlp when cache filled
- No FE Study UI required yet (can verify via API)
