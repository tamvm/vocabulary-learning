-- Known Words table: tracks words the user already knows
-- These words are pre-unchecked when analyzing new content
CREATE TABLE IF NOT EXISTS public.known_words (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, word)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_known_words_user_id ON public.known_words(user_id);

-- RLS
ALTER TABLE public.known_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own known words"
  ON public.known_words FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own known words"
  ON public.known_words FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own known words"
  ON public.known_words FOR DELETE
  USING (auth.uid() = user_id);
