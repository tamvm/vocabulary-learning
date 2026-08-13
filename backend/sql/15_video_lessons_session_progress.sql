-- Persist Learn wizard progress for cross-device resume (TOM-104)
ALTER TABLE public.video_lessons
  ADD COLUMN IF NOT EXISTS current_step TEXT DEFAULT 'vocab',
  ADD COLUMN IF NOT EXISTS vocabulary JSONB,
  ADD COLUMN IF NOT EXISTS study_words JSONB,
  ADD COLUMN IF NOT EXISTS quiz_questions JSONB,
  ADD COLUMN IF NOT EXISTS user_cefr_level TEXT;

COMMENT ON COLUMN public.video_lessons.current_step IS 'Wizard step: vocab | study | quiz | completed';
COMMENT ON COLUMN public.video_lessons.vocabulary IS 'AI vocabulary snapshot for resume [{word, definition, ...}]';
COMMENT ON COLUMN public.video_lessons.study_words IS 'Words taken into Study step';
COMMENT ON COLUMN public.video_lessons.quiz_questions IS 'Cached mixed quiz questions for resume';
COMMENT ON COLUMN public.video_lessons.user_cefr_level IS 'CEFR level used when analyzing this lesson';

-- Keep updated_at fresh so "continue last" can order by recency
DROP TRIGGER IF EXISTS set_updated_at_video_lessons ON public.video_lessons;
CREATE TRIGGER set_updated_at_video_lessons
  BEFORE UPDATE ON public.video_lessons
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_video_lessons_user_updated
  ON public.video_lessons(user_id, updated_at DESC);
