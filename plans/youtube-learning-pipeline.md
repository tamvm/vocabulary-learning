# Plan: YouTube Learning Pipeline (Option A)

## Overview

Dedicated `/learn` page with a 3-step wizard:
1. **Paste YouTube URL** → extract transcript → AI finds vocabulary at user's CEFR level
2. **Select Vocabulary** → checklist with uncheck for known words → bulk save + flashcard creation
3. **Listening Comprehension Quiz** → AI generates content-based quiz from the video

## What Already Exists (Reuse)

| Component | Location | Reuse |
|-----------|----------|-------|
| YouTube transcript extraction | `backend/src/services/youtubeTranscriptService.js` | ✅ Full reuse |
| AI content analysis (chunked) | `backend/src/services/aiService.js` → `analyzeWebsiteContent()` | ✅ Reuse for vocab extraction |
| AI prompt for vocab extraction | `backend/src/services/aiService.js` → `analyzeContentChunk()` | ✅ Reuse with video-specific context |
| Vocabulary bulk import | `POST /api/words/bulk` | ✅ Reuse |
| Flashcard system (FSRS) | `backend/src/services/fsrs.js`, `backend/src/routes/flashcards.js` | ✅ Reuse |
| Frontend checklist UI patterns | `frontend/src/pages/Vocabulary.jsx` (content analysis tabs) | ✅ Reference |
| API client patterns | `frontend/src/lib/api.js` | ✅ Extend |
| Sidebar navigation | `frontend/src/components/Layout/Sidebar.jsx` | ✅ Add entry |

## What's New

### Backend

#### 1. New Route: `POST /api/youtube/analyze`
- Accepts `{ videoUrl }`
- Calls `youtubeTranscriptService.processYouTubeUrl()` → gets transcript + video info
- Calls `aiService.analyzeWebsiteContent()` with the transcript
- Returns `{ videoInfo, vocabulary[], transcriptPreview }`
- **Note:** Reuses existing chunked analysis pipeline

#### 2. New Route: `POST /api/youtube/quiz`
- Accepts `{ videoUrl, vocabularyWordIds[] }`
- Gets transcript (cached or re-fetched)
- AI prompt: generates 5-10 listening comprehension questions based on video content
- Questions test understanding of the video (not word definitions)
- Each question has: `{ question, options[4], correctIndex, timestamp, explanation }`
- **Note:** This is different from existing `quizService` which tests vocabulary definitions

#### 3. New DB Table: `video_lessons`
```sql
CREATE TABLE video_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  words_saved INTEGER DEFAULT 0,
  quiz_score DECIMAL,
  quiz_total INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 4. New DB Table: `known_words` (optional — see Question 2)
```sql
CREATE TABLE known_words (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, word)
);
```

### Frontend

#### 1. New Page: `/learn` (`frontend/src/pages/Learn.jsx`)

**Step 1 — Paste YouTube URL**
- Input field with URL validation
- "Extract" button → shows loading state with progress
- On success: show video thumbnail, title, duration
- "Analyze Vocabulary" button

**Step 2 — Vocabulary Selection**
- Header: video info bar (collapsed)
- Vocabulary list as scrollable checklist cards
- Each card shows: word, definition, context sentence, CEFR badge, check/uncheck toggle
- All pre-checked by default
- Actions: "Select All" / "Deselect All"
- Bulk actions bar: "Learn Selected (N)" → saves to vocabulary + creates flashcards
- "Skip to Quiz" link for users who know all the words

**Step 3 — Listening Comprehension Quiz**
- Quiz UI: one question at a time, multiple choice
- Progress bar (Q 3/10)
- Each question shows: question text, 4 options, optional timestamp link
- After answering: show correct/incorrect + explanation
- Final score screen with:
  - Score (e.g. 8/10)
  - Per-question review (expandable)
  - "Study These Words" → links to Study page
  - "Try Another Video" → back to Step 1

#### 2. Sidebar Entry
- Add "Learn" nav item with `Play` icon (lucide-react) between "Study" and "Sentence Scoring"

#### 3. API Client Extensions
```js
export const youtubeAPI = {
  analyze: (videoUrl) => api.post('/youtube/analyze', { videoUrl }),
  generateQuiz: (videoUrl, vocabularyWordIds) => 
    api.post('/youtube/quiz', { videoUrl, vocabularyWordIds }),
}
```

## Flow Diagram

```
User on /learn
  │
  ├─ Step 1: Paste YouTube URL
  │   └─ POST /api/youtube/analyze
  │       ├─ yt-dlp: extract transcript
  │       └─ AI: extract vocabulary at CEFR level
  │
  ├─ Step 2: Review Vocabulary
  │   ├─ User unchecks known words
  │   ├─ User clicks "Learn Selected"
  │   │   └─ POST /api/words/bulk (import selected)
  │   │       └─ Auto-generate flashcards (existing FSRS)
  │   └─ User clicks "Continue to Quiz"
  │
  └─ Step 3: Listening Quiz
      └─ POST /api/youtube/quiz
          └─ AI: generates content comprehension questions
      └─ User answers questions
      └─ Score + review screen
```

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `backend/src/routes/youtube.js` | New YouTube-specific routes |
| `frontend/src/pages/Learn.jsx` | 3-step learning page |
| `frontend/src/components/Learn/StepUrl.jsx` | Step 1: URL input |
| `frontend/src/components/Learn/StepVocab.jsx` | Step 2: vocab checklist |
| `frontend/src/components/Learn/StepQuiz.jsx` | Step 3: listening quiz |
| `backend/sql/12_video_lessons.sql` | Migration for video_lessons table |

### Modified Files
| File | Change |
|------|--------|
| `backend/src/server.js` | Register `/api/youtube` route |
| `frontend/src/App.jsx` | Add `/learn` route |
| `frontend/src/components/Layout/Sidebar.jsx` | Add "Learn" nav item |
| `frontend/src/lib/api.js` | Add `youtubeAPI` |

## Phases

### Phase 1: Backend API (do first)
1. Create `youtube.js` route with `/analyze` and `/quiz` endpoints
2. Create DB migration for `video_lessons`
3. Test with curl

### Phase 2: Frontend Page
1. Create `Learn.jsx` with 3-step state machine
2. Build `StepUrl`, `StepVocab`, `StepQuiz` components
3. Wire up API calls
4. Add sidebar + router entries

### Phase 3: Polish
1. Loading/error states
2. Responsive design
3. Keyboard shortcuts (1-4 for quiz answers)
4. Toast notifications

## Estimated Effort
- Backend: 2-3 hours (routes are thin wrappers around existing services)
- Frontend: 4-6 hours (3-step wizard with quiz interaction)
- Total: ~1-2 sessions
