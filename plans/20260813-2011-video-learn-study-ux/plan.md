# Plan: Video Learn Study UX (YouTube)

## Goal

Upgrade existing `/learn` so the learner can:

1. Paste a YouTube URL  
2. Review / save **new vocabulary first**  
3. Study with **video on top** + **two columns** (new words | timed transcript)  
4. Click a transcript cue → seek the video  
5. See **summary** + **chapters** (YouTube chapters if present, else AI)  
6. After listening, take a **mixed quiz**: comprehension + vocab-in-context  

**Out of scope:** non-YouTube sources, file upload, Vimeo, FSRS for video quiz, full lesson history redesign.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Source | YouTube only |
| Layout | Video top; columns = new words \| transcript |
| Seek | Click transcript cue → `player.seekTo(start)` |
| Order | Vocab first → then listen/study → then quiz |
| Chapters | Prefer YouTube chapters when available; else AI segmentation |
| Quiz | Both comprehension MCQ **and** vocab cloze/context |
| Summary | Always (short main-ideas blurb) |
| Chapters UI | Show when available (YT or AI) |
| Transcript source | **Primary: Transcript24 API**; fallback: existing yt-dlp VTT |

## What already exists (reuse)

| Piece | Location | Reuse |
|-------|----------|-------|
| `/learn` 3-step wizard | `frontend/src/pages/Learn.jsx` | Extend steps; split components |
| Analyze + vocab filter | `POST /api/youtube/analyze` | Keep; enrich response |
| Comprehension quiz | `POST /api/youtube/quiz` | Extend prompt / types |
| VTT parse with timestamps | `youtubeTranscriptService.parseVTT` | Fallback path; keep cues |
| yt-dlp video JSON | `extractVideoInfo` | Fallback meta/`chapters`; optional supplement |
| Lesson row | `video_lessons` | Add cache columns |
| Vocab bulk + flashcards | `/api/words/bulk` | Unchanged |
| Known words | `known_words` | Unchanged |

## Scope challenge

1. **What exists?** Full YouTube learn pipeline — do not rebuild analyze/vocab/quiz from scratch.  
2. **Minimum change set?** Timed transcript + embed + study layout + summary/chapters + dual quiz. Defer history UI, FSRS video quiz, multi-language subs.  
3. **Complexity?** ~10–12 files, 1 migration, 4 phases — justified; shrink by not inventing a parallel “Video Study” app.

## Recommended approach

**Extend `/learn` (Option A)** — not a new route tree.

### New learner flow

```
Step 1  Paste YouTube URL
   └─ analyze → vocab + timed cues + chapters + summary (async OK)

Step 2  Vocabulary (unchanged intent)
   ├─ checklist / mark known / learn selected → bulk import
   └─ Continue to Study

Step 3  Study (NEW)
   ├─ YouTube embed (top)
   ├─ Left: selected/new words (click → highlight in transcript)
   ├─ Right: timed transcript (click → seek)
   ├─ Chapters tabs/list (if any) + summary panel
   └─ “I’m ready for quiz”

Step 4  Quiz (EXTENDED)
   ├─ Mix: comprehension MCQ + vocab cloze/context
   └─ Score → complete lesson
```

### Layout (Study step)

```
┌─────────────────────────────────────────────┐
│           YouTube iframe (16:9)             │
│     chapters: [Intro] [Point A] [Q&A] …      │
├────────────────────┬────────────────────────┤
│  New words         │  Transcript            │
│  • word + gloss    │  [0:12] cue text…      │
│  • highlight sync  │  [0:18] cue text…      │
│  Summary (collapsible above or under cols)  │
└────────────────────┴────────────────────────┘
```

Mobile: stack video → summary/chapters → words → transcript.

## Backend design

### 1. Transcript provider: Transcript24 (primary) + yt-dlp (fallback)

**Docs:** https://www.transcript24.com/transcript-api  
**Base:** `https://api.transcript24.com`  
**Auth:** `Authorization: Bearer <API_KEY>`  
**Secret:** `TRANSCRIPT24_API_KEY` (copy from Hermes env on Mac Tony → Cursor secrets + Coolify backend). Never commit the key.

```http
POST /transcribe
Content-Type: application/json
Authorization: Bearer <API_KEY>

{ "url": "https://www.youtube.com/watch?v=...", "prefer": "auto" }
```

Response (relevant fields):

- `caption[]`: `{ start_time: "HH:MM:SS.mmm", end_time, text }` → map to internal `cues[{ start, end, text }]` (seconds)
- `meta`: `platform`, `id`, `title`, `duration`, `image`, …
- `mode`: `raw` (platform captions) or `asr` (AI) — prefer `auto` so captions win when present
- Credits: `raw` = 1/video; `asr` = ceil(minutes). **Do not enable `sceneDetection` in MVP** (billed per-minute even for raw)

**New file:** `backend/src/services/transcript24Service.js`

- `transcribe(url, { prefer: 'auto' })` → normalized `{ content, cues, videoInfo, provider: 'transcript24', mode }`
- Parse `start_time`/`end_time` strings → seconds
- Clear errors for missing key / insufficient credits / fetch failure

**Orchestrator (extend)** `youtubeTranscriptService.processYouTubeUrl` (or thin wrapper used by routes):

1. If `TRANSCRIPT24_API_KEY` set → call Transcript24  
2. On success → return cues + meta  
3. On missing key / hard failure → fallback existing yt-dlp VTT + `extractVideoInfo` (keep cues; pass YT `chapters` when present)  
4. Always same return shape so `/analyze` / `/quiz` stay provider-agnostic

Optional later: use Transcript24 `sceneDetection` as chapter hints — **deferred** (cost).

### 2. Persist lesson cache (avoid re-fetch on quiz)

**New SQL:** `backend/sql/14_video_lessons_study_cache.sql`

Add to `video_lessons` (nullable JSON/text):

| Column | Purpose |
|--------|---------|
| `transcript_cues` | JSONB cues |
| `transcript_text` | plain text |
| `summary` | text |
| `chapters` | JSONB `[{start, end?, title, source: 'youtube'\|'ai'}]` |
| `duration_seconds` | int |

Aligns with backlog idea TOM-88 (transcript cache) — do it here as part of analyze.

RLS policies already cover row updates; no new table required for MVP.

### 3. Enrich `POST /api/youtube/analyze`

After transcript:

1. Save cues + text on lesson  
2. Prefer YouTube chapters; if none **and** duration ≥ ~8–10 min (or cue count large), call AI chaptering  
3. Always call AI **summary** (short: 3–6 bullets or 1 short paragraph + bullets)  
4. Response shape:

```js
{
  lessonId,
  videoInfo: { videoId, title, thumbnail, duration, channel },
  vocabulary: [...],
  cues: [{ start, end, text }],
  summary: "...",
  chapters: [{ start, end, title, source }],
  // keep preview fields for back-compat or drop after FE update
}
```

**Cost control:** one combined AI call for `{ summary, chapters? }` when chapters missing; skip chapter AI if YT chapters exist. Vocab extraction stays as today (chunked).

### 4. Extend `POST /api/youtube/quiz`

- Accept `lessonId` (preferred) and/or `videoUrl`; load cached transcript when possible  
- Accept `vocabularyWords: string[]` (saved/selected words)  
- Accept `questionCount`, optional `chapterStart`/`chapterEnd` (defer section quiz to Phase 4 if tight)  
- Generate mixed set, e.g. default 8:
  - ~50% `type: "comprehension"` (current style)
  - ~50% `type: "vocab"` — cloze or “which word fits / meaning in this sentence from the video”
- Each item: `{ type, question, options[4], correctIndex, timestamp?, explanation, targetWord? }`  
- Prefer section-aware prompts when chapters exist (spread questions across chapters)

### 5. Optional thin endpoints (only if analyze payload too heavy)

- `GET /api/youtube/lessons/:id` — reload study state  
- Not required if FE keeps analyze payload in memory for the session  

## Frontend design

### Split `Learn.jsx` (~949 lines) into components

| Component | Role |
|-----------|------|
| `pages/Learn.jsx` | Step state machine |
| `components/Learn/StepUrl.jsx` | Paste URL (extract if already inline) |
| `components/Learn/StepVocab.jsx` | Vocab checklist |
| `components/Learn/StepStudy.jsx` | **New** player + columns |
| `components/Learn/StepQuiz.jsx` | Quiz UI (support `type`) |
| `components/Learn/TranscriptPanel.jsx` | Cue list + active highlight + seek |
| `components/Learn/VocabPanel.jsx` | Word list; optional filter by chapter |
| `components/Learn/ChapterBar.jsx` | Chapter chips → seek |
| `components/Learn/VideoPlayer.jsx` | YouTube IFrame API wrapper |

### Player

- Use YouTube IFrame API (`enablejsapi=1`) for `seekTo`  
- On cue click / chapter click → seek + play  
- Optional: poll `getCurrentTime` to highlight active cue (nice-to-have in Phase 2; click-to-seek is required)

### API client

Extend `youtubeAPI` in `frontend/src/lib/api.js` for enriched analyze + quiz body (`lessonId`, `vocabularyWords`).

## Phases & tasks

### Phase 0 — Plan / contract (this doc)

- [x] Lock UX decisions with product owner  
- [x] Linear: [TOM-102](https://linear.app/timtam-wp/issue/TOM-102/video-learn-study-ux-transcript-side-by-side-summary-chapters-mixed)  


### Phase 1 — Transcript foundation (backend)

**Goal:** cues + chapters metadata + DB cache; analyze returns data Study needs.

| ID | Task | Files |
|----|------|-------|
| T1.1 | Return `cues` from `processYouTubeUrl`; stop discarding timestamps | `youtubeTranscriptService.js` |
| T1.2 | Pass `chapters` + thumbnail from yt-dlp dump | same |
| T1.3 | Migration `14_video_lessons_study_cache.sql` | `backend/sql/` |
| T1.4 | Persist cues/text/chapters/duration on analyze insert/update | `routes/youtube.js` |
| T1.5 | Return full `cues` (+ YT chapters) from `/analyze` | `routes/youtube.js` |
| T1.6 | Quiz prefers cached `transcript_text` via `lessonId` | `routes/youtube.js` |

**Verify:** analyze a short EN-caption video → JSON has `cues[].start` and non-empty text; quiz with `lessonId` does not re-call yt-dlp when cache present.

### Phase 2 — Study UI (frontend)

**Goal:** Vocab → Study layout with seek.

| ID | Task | Files |
|----|------|-------|
| T2.1 | Add `STEPS.STUDY` between vocab and quiz | `Learn.jsx` |
| T2.2 | Split Step components (at least Study + panels) | `components/Learn/*` |
| T2.3 | `VideoPlayer` + click cue → seek | `VideoPlayer.jsx`, `TranscriptPanel.jsx` |
| T2.4 | Two-column Study layout (video top) | `StepStudy.jsx` |
| T2.5 | Vocab panel shows words chosen/saved for this lesson | `VocabPanel.jsx` |
| T2.6 | Wire analyze response (`cues`, `videoId`) into Study | `Learn.jsx`, `api.js` |
| T2.7 | Mobile stack layout | CSS/Tailwind in Study |

**Verify:** click cue seeks; words and transcript both visible; flow Vocab → Study → Quiz still works.

**Screenshots required** before `[ready]` (UI PR).

### Phase 3 — Summary + chapters (AI + UI)

**Goal:** main ideas + navigable chapters.

| ID | Task | Files |
|----|------|-------|
| T3.1 | AI `summarizeAndChapter(transcript, duration, existingChapters)` | `aiService.js` |
| T3.2 | If YT chapters exist → use them; else AI chapters | `youtube.js` |
| T3.3 | Persist `summary` + `chapters` | migration already has cols |
| T3.4 | Summary panel + `ChapterBar` seek | `StepStudy.jsx`, `ChapterBar.jsx` |
| T3.5 | Loading/skeleton while summary/chapters generate (if split from analyze) | FE |

**Policy:**  
- YT chapters present → `source: 'youtube'`, still generate summary.  
- No YT chapters → AI returns chapters with approximate `start` (map to nearest cue).  
- Very short videos (< ~5–8 min) → summary only, skip AI chapters.

**Verify:** video with chapters shows YT titles; long video without chapters gets AI sections; summary readable in UI.

### Phase 4 — Mixed quiz

**Goal:** comprehension + vocab practice.

| ID | Task | Files |
|----|------|-------|
| T4.1 | Extend quiz prompt + schema for `type` | `youtube.js` |
| T4.2 | Pass selected vocab words into quiz | FE + API |
| T4.3 | Quiz UI renders both types; badge optional | `StepQuiz.jsx` |
| T4.4 | Score + complete unchanged; store total | existing `/complete` |
| T4.5 | (Stretch) Prefer questions spanning chapters | prompt tweak |

**Verify:** response includes both `comprehension` and `vocab` items; wrong/right + explanation still work.

## Non-goals / defer

- Multi-language captions  
- Upload / non-YouTube  
- Persisting quiz question bank into `quiz_questions` / FSRS  
- Lesson history browser (API exists; UI later)  
- Auto-scroll transcript without click (Phase 2 optional polish)  
- Per-chapter mini-quizzes as separate steps (stretch after MVP)

## Risks

| Risk | Mitigation |
|------|------------|
| Auto-captions noisy / overlapping | Light cue merge; don’t block on perfect VTT |
| Large cue payloads | Cap / merge cues; JSONB OK for typical lengths |
| AI cost (vocab + summary + quiz) | Combined summary/chapter call; cache transcript; quiz uses cache |
| YouTube embed restrictions | IFrame API; fallback message if embed disabled |
| `Learn.jsx` size | Split components in Phase 2 — do not grow the monolith |

## Success criteria (MVP)

1. User pastes YouTube URL with EN captions → gets vocab list.  
2. After saving/selecting words, Study shows video + words | transcript.  
3. Clicking a transcript line seeks the video.  
4. Summary visible; chapters visible when YT or AI provides them.  
5. Quiz contains both comprehension and vocab-style items.  
6. Existing mark-known / bulk-learn / complete lesson still work.  
7. Lint/build green; UI screenshots on PR.

## Implementation order

Ship **Phase 1 → 2** first (usable Study + seek). Then **3** (summary/chapters). Then **4** (mixed quiz). Each phase = own commit(s); one PR is fine if sequential, or split PRs if review load is high — prefer **one PR** with clear commits unless Phase 1 alone is large.

## Open micro-details (defaults if unanswered)

- Default quiz mix: 4 comprehension + 4 vocab (of `questionCount`)  
- Chapter AI threshold: duration ≥ 8 minutes OR cues ≥ ~80  
- Active-cue highlight while playing: Phase 2 polish if time  
