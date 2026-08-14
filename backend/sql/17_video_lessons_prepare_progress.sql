-- Vocab-step chunk progress for Learn list UI (TOM-114)
ALTER TABLE public.video_lessons
  ADD COLUMN IF NOT EXISTS prepare_progress TEXT;

COMMENT ON COLUMN public.video_lessons.prepare_progress IS
  'In-step progress, e.g. vocabulary 2/3 chunks';
