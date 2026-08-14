-- Background Learn pipeline (TOM-112): transcript → vocab → highlights → quiz
ALTER TABLE public.video_lessons
  ADD COLUMN IF NOT EXISTS prepare_status TEXT DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS prepare_step TEXT,
  ADD COLUMN IF NOT EXISTS prepare_error TEXT,
  ADD COLUMN IF NOT EXISTS summary_status TEXT DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS summary_error TEXT;

COMMENT ON COLUMN public.video_lessons.prepare_status IS 'idle | pending | ready | failed';
COMMENT ON COLUMN public.video_lessons.prepare_step IS 'transcript | vocab | highlights | quiz | done';
COMMENT ON COLUMN public.video_lessons.prepare_error IS 'Last prepare-pipeline error (user-safe)';
COMMENT ON COLUMN public.video_lessons.summary_status IS 'idle | pending | ready | failed';
COMMENT ON COLUMN public.video_lessons.summary_error IS 'Last highlight job error (user-safe)';
