-- Video Lessons table: tracks YouTube learning sessions
CREATE TABLE IF NOT EXISTS public.video_lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  video_url TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  words_saved INTEGER DEFAULT 0,
  quiz_score DECIMAL,
  quiz_total INTEGER,
  status TEXT DEFAULT 'analyzed', -- 'analyzed', 'quiz_generated', 'completed'
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_video_lessons_user_id ON public.video_lessons(user_id);
CREATE INDEX IF NOT EXISTS idx_video_lessons_video_id ON public.video_lessons(video_id);
CREATE INDEX IF NOT EXISTS idx_video_lessons_status ON public.video_lessons(status);
CREATE INDEX IF NOT EXISTS idx_video_lessons_created_at ON public.video_lessons(created_at);

-- RLS: users can only see their own video lessons
ALTER TABLE public.video_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own video lessons"
  ON public.video_lessons FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own video lessons"
  ON public.video_lessons FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own video lessons"
  ON public.video_lessons FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own video lessons"
  ON public.video_lessons FOR DELETE
  USING (auth.uid() = user_id);
