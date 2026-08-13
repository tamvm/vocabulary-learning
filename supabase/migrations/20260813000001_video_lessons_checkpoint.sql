-- Wizard checkpoint fields so Learn sessions resume across devices (TOM-104)
-- Mirrors backend/sql/15_video_lessons_checkpoint.sql
ALTER TABLE public.video_lessons
  ADD COLUMN IF NOT EXISTS current_step SMALLINT DEFAULT 2,
  ADD COLUMN IF NOT EXISTS user_cefr_level TEXT,
  ADD COLUMN IF NOT EXISTS vocabulary_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS study_words_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS quiz_questions JSONB,
  ADD COLUMN IF NOT EXISTS quiz_answers JSONB;

COMMENT ON COLUMN public.video_lessons.current_step IS 'Wizard step: 2=vocab, 3=study, 4=quiz';
COMMENT ON COLUMN public.video_lessons.user_cefr_level IS 'CEFR level used when vocabulary was analyzed';
COMMENT ON COLUMN public.video_lessons.vocabulary_snapshot IS 'Full analyze vocabulary[] for resume';
COMMENT ON COLUMN public.video_lessons.study_words_snapshot IS 'Words chosen for the study step';
COMMENT ON COLUMN public.video_lessons.quiz_questions IS 'Generated quiz questions (avoid re-AI on resume)';
COMMENT ON COLUMN public.video_lessons.quiz_answers IS 'Mid-quiz answers map { "0": 2, "1": 0 }';

-- CONCURRENTLY cannot run inside Supabase's migration transaction.
-- video_lessons is per-user and small; a short SHARE lock is acceptable.
-- If this table is ever large, apply the index manually:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_video_lessons_updated_at ON public.video_lessons(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_lessons_updated_at ON public.video_lessons(updated_at DESC);
