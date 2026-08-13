-- Cache timed transcript + study metadata on video_lessons (TOM-102 / Phase 1)
-- Mirrors backend/sql/14_video_lessons_study_cache.sql
ALTER TABLE public.video_lessons
  ADD COLUMN IF NOT EXISTS transcript_cues JSONB,
  ADD COLUMN IF NOT EXISTS transcript_text TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS chapters JSONB,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS transcript_provider TEXT;

COMMENT ON COLUMN public.video_lessons.transcript_cues IS 'Timed caption cues [{start,end,text}]';
COMMENT ON COLUMN public.video_lessons.transcript_text IS 'Plain transcript text for AI/quiz (cached)';
COMMENT ON COLUMN public.video_lessons.summary IS 'AI main-ideas summary';
COMMENT ON COLUMN public.video_lessons.chapters IS 'Chapters [{start,end,title,source}] youtube|ai';
COMMENT ON COLUMN public.video_lessons.duration_seconds IS 'Video duration in seconds';
COMMENT ON COLUMN public.video_lessons.transcript_provider IS 'transcript24 | ytdlp';
