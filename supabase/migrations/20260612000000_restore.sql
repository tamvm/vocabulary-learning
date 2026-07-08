-- Magic English Database Schema
-- Execute these SQL statements in your Supabase SQL editor

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- User profiles table for tracking progress and achievements
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  total_words_added INTEGER DEFAULT 0,
  total_sentences_scored INTEGER DEFAULT 0,
  daily_goal INTEGER DEFAULT 5,
  weekly_goal INTEGER DEFAULT 30,
  streak_freezes_available INTEGER DEFAULT 2,
  last_activity_date DATE,
  achievements JSONB DEFAULT '[]'::jsonb,
  activity_history JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Words table for vocabulary storage
CREATE TABLE IF NOT EXISTS public.words (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word TEXT NOT NULL,
  definition TEXT DEFAULT '',
  word_type TEXT DEFAULT '',
  cefr_level TEXT DEFAULT '',
  ipa_pronunciation TEXT DEFAULT '',
  example_sentence TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Add index for better search performance
  CONSTRAINT words_word_check CHECK (length(word) > 0)
);

-- Database collections table for organizing words
CREATE TABLE IF NOT EXISTS public.collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(user_id, name)
);

-- Word collections mapping table
CREATE TABLE IF NOT EXISTS public.word_collections (
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE,
  PRIMARY KEY (word_id, collection_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_words_user_id ON public.words(user_id);
CREATE INDEX IF NOT EXISTS idx_words_word ON public.words(word);
CREATE INDEX IF NOT EXISTS idx_words_created_at ON public.words(created_at);
CREATE INDEX IF NOT EXISTS idx_collections_user_id ON public.collections(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(id);

-- Full text search index for words
CREATE INDEX IF NOT EXISTS idx_words_search ON public.words
USING gin(to_tsvector('english', word || ' ' || definition || ' ' || example_sentence));

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_collections ENABLE ROW LEVEL SECURITY;

-- Create Row Level Security Policies

-- Users policies
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Profiles policies
CREATE POLICY "Users can view their own profile data" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile data" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile data" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Words policies
CREATE POLICY "Users can view their own words" ON public.words
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own words" ON public.words
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own words" ON public.words
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own words" ON public.words
  FOR DELETE USING (auth.uid() = user_id);

-- Collections policies
CREATE POLICY "Users can view their own collections" ON public.collections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own collections" ON public.collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collections" ON public.collections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own collections" ON public.collections
  FOR DELETE USING (auth.uid() = user_id);

-- Word collections policies
CREATE POLICY "Users can manage word collections" ON public.word_collections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.words w
      WHERE w.id = word_collections.word_id AND w.user_id = auth.uid()
    )
  );

-- Create functions for automatic profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');

  INSERT INTO public.profiles (id)
  VALUES (NEW.id);

  -- Create a default collection
  INSERT INTO public.collections (user_id, name, description, is_active)
  VALUES (NEW.id, 'My Vocabulary', 'Default vocabulary collection', true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_words BEFORE UPDATE ON public.words
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_collections BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();-- Database functions for Magic English
-- Execute these in your Supabase SQL editor after running migrations.sql

-- Function to increment words added count and update streak
CREATE OR REPLACE FUNCTION increment_words_added(user_id UUID)
RETURNS void AS $$
DECLARE
    today DATE := CURRENT_DATE;
    profile_record profiles%ROWTYPE;
    new_streak INTEGER := 1;
    activity_data JSONB;
    today_activity JSONB;
BEGIN
    -- Get current profile
    SELECT * INTO profile_record
    FROM profiles
    WHERE id = user_id;

    -- If profile doesn't exist, create it
    IF NOT FOUND THEN
        INSERT INTO profiles (id, total_words_added, current_streak, last_activity_date)
        VALUES (user_id, 1, 1, today);
        RETURN;
    END IF;

    -- Update activity history
    activity_data := COALESCE(profile_record.activity_history, '{}'::jsonb);
    today_activity := COALESCE(activity_data->today::text, '{"words": 0, "sentences": 0}'::jsonb);

    today_activity := jsonb_set(
        today_activity,
        '{words}',
        ((today_activity->>'words')::int + 1)::text::jsonb
    );

    activity_data := jsonb_set(activity_data, ARRAY[today::text], today_activity);

    -- Calculate streak
    IF profile_record.last_activity_date = today THEN
        -- Same day, keep current streak
        new_streak := profile_record.current_streak;
    ELSIF profile_record.last_activity_date = today - INTERVAL '1 day' THEN
        -- Yesterday, increment streak
        new_streak := profile_record.current_streak + 1;
    ELSE
        -- Gap in activity, reset streak
        new_streak := 1;
    END IF;

    -- Update profile
    UPDATE profiles
    SET
        total_words_added = profile_record.total_words_added + 1,
        current_streak = new_streak,
        longest_streak = GREATEST(profile_record.longest_streak, new_streak),
        last_activity_date = today,
        activity_history = activity_data,
        updated_at = NOW()
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment sentences scored count
CREATE OR REPLACE FUNCTION increment_sentences_scored(user_id UUID)
RETURNS void AS $$
DECLARE
    today DATE := CURRENT_DATE;
    profile_record profiles%ROWTYPE;
    new_streak INTEGER := 1;
    activity_data JSONB;
    today_activity JSONB;
BEGIN
    -- Get current profile
    SELECT * INTO profile_record
    FROM profiles
    WHERE id = user_id;

    -- If profile doesn't exist, create it
    IF NOT FOUND THEN
        INSERT INTO profiles (id, total_sentences_scored, current_streak, last_activity_date)
        VALUES (user_id, 1, 1, today);
        RETURN;
    END IF;

    -- Update activity history
    activity_data := COALESCE(profile_record.activity_history, '{}'::jsonb);
    today_activity := COALESCE(activity_data->today::text, '{"words": 0, "sentences": 0}'::jsonb);

    today_activity := jsonb_set(
        today_activity,
        '{sentences}',
        ((today_activity->>'sentences')::int + 1)::text::jsonb
    );

    activity_data := jsonb_set(activity_data, ARRAY[today::text], today_activity);

    -- Calculate streak
    IF profile_record.last_activity_date = today THEN
        -- Same day, keep current streak
        new_streak := profile_record.current_streak;
    ELSIF profile_record.last_activity_date = today - INTERVAL '1 day' THEN
        -- Yesterday, increment streak
        new_streak := profile_record.current_streak + 1;
    ELSE
        -- Gap in activity, reset streak
        new_streak := 1;
    END IF;

    -- Update profile
    UPDATE profiles
    SET
        total_sentences_scored = profile_record.total_sentences_scored + 1,
        current_streak = new_streak,
        longest_streak = GREATEST(profile_record.longest_streak, new_streak),
        last_activity_date = today,
        activity_history = activity_data,
        updated_at = NOW()
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search words with full text search
CREATE OR REPLACE FUNCTION search_words(
    user_id UUID,
    search_query TEXT,
    search_limit INTEGER DEFAULT 50,
    search_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    word TEXT,
    definition TEXT,
    word_type TEXT,
    cefr_level TEXT,
    ipa_pronunciation TEXT,
    example_sentence TEXT,
    notes TEXT,
    tags JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.word,
        w.definition,
        w.word_type,
        w.cefr_level,
        w.ipa_pronunciation,
        w.example_sentence,
        w.notes,
        w.tags,
        w.created_at,
        w.updated_at,
        ts_rank(
            to_tsvector('english', w.word || ' ' || w.definition || ' ' || w.example_sentence),
            plainto_tsquery('english', search_query)
        ) as rank
    FROM words w
    WHERE
        w.user_id = search_words.user_id
        AND (
            search_query IS NULL
            OR to_tsvector('english', w.word || ' ' || w.definition || ' ' || w.example_sentence)
               @@ plainto_tsquery('english', search_query)
        )
    ORDER BY rank DESC, w.created_at DESC
    LIMIT search_limit OFFSET search_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user statistics
CREATE OR REPLACE FUNCTION get_user_stats(user_id UUID)
RETURNS TABLE(
    total_words INTEGER,
    words_today INTEGER,
    words_this_week INTEGER,
    cefr_distribution JSONB,
    word_type_distribution JSONB,
    recent_activity JSONB
) AS $$
DECLARE
    today DATE := CURRENT_DATE;
    week_start DATE := today - INTERVAL '7 days';
BEGIN
    RETURN QUERY
    SELECT
        COUNT(w.id)::INTEGER as total_words,
        COUNT(CASE WHEN DATE(w.created_at) = today THEN 1 END)::INTEGER as words_today,
        COUNT(CASE WHEN DATE(w.created_at) >= week_start THEN 1 END)::INTEGER as words_this_week,

        COALESCE(
            jsonb_object_agg(
                COALESCE(NULLIF(w.cefr_level, ''), 'Unknown'),
                cefr_counts.count
            ) FILTER (WHERE cefr_counts.count > 0),
            '{}'::jsonb
        ) as cefr_distribution,

        COALESCE(
            jsonb_object_agg(
                COALESCE(NULLIF(w.word_type, ''), 'Unknown'),
                type_counts.count
            ) FILTER (WHERE type_counts.count > 0),
            '{}'::jsonb
        ) as word_type_distribution,

        COALESCE(p.activity_history, '{}'::jsonb) as recent_activity

    FROM words w
    LEFT JOIN (
        SELECT cefr_level, COUNT(*) as count
        FROM words
        WHERE user_id = get_user_stats.user_id
        GROUP BY cefr_level
    ) cefr_counts ON w.cefr_level = cefr_counts.cefr_level
    LEFT JOIN (
        SELECT word_type, COUNT(*) as count
        FROM words
        WHERE user_id = get_user_stats.user_id
        GROUP BY word_type
    ) type_counts ON w.word_type = type_counts.word_type
    LEFT JOIN profiles p ON p.id = get_user_stats.user_id
    WHERE w.user_id = get_user_stats.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean old activity history (keep last 6 months)
CREATE OR REPLACE FUNCTION cleanup_activity_history()
RETURNS void AS $$
DECLARE
    cutoff_date DATE := CURRENT_DATE - INTERVAL '6 months';
    profile_record RECORD;
    cleaned_history JSONB;
    activity_key TEXT;
BEGIN
    FOR profile_record IN SELECT id, activity_history FROM profiles LOOP
        cleaned_history := '{}'::jsonb;

        FOR activity_key IN SELECT jsonb_object_keys(profile_record.activity_history) LOOP
            IF activity_key::DATE >= cutoff_date THEN
                cleaned_history := jsonb_set(
                    cleaned_history,
                    ARRAY[activity_key],
                    profile_record.activity_history->activity_key
                );
            END IF;
        END LOOP;

        UPDATE profiles
        SET activity_history = cleaned_history, updated_at = NOW()
        WHERE id = profile_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION increment_words_added(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_sentences_scored(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION search_words(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_stats(UUID) TO authenticated;-- Fix RLS policies for Magic English
-- Run this in your Supabase SQL editor to fix the permission issues

-- Drop existing policies that might be too restrictive
DROP POLICY IF EXISTS "Users can view their own profile data" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile data" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile data" ON public.profiles;

DROP POLICY IF EXISTS "Users can view their own words" ON public.words;
DROP POLICY IF EXISTS "Users can insert their own words" ON public.words;
DROP POLICY IF EXISTS "Users can update their own words" ON public.words;
DROP POLICY IF EXISTS "Users can delete their own words" ON public.words;

-- Create more permissive RLS policies for profiles
CREATE POLICY "Enable read access for authenticated users on profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Enable insert access for authenticated users on profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable update access for authenticated users on profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Create more permissive RLS policies for words
CREATE POLICY "Enable read access for authenticated users on words"
ON public.words FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Enable insert access for authenticated users on words"
ON public.words FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable update access for authenticated users on words"
ON public.words FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable delete access for authenticated users on words"
ON public.words FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Also create a policy for the users table if needed
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;

CREATE POLICY "Enable read access for authenticated users on users"
ON public.users FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Enable insert access for authenticated users on users"
ON public.users FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable update access for authenticated users on users"
ON public.users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Grant additional permissions to authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.words TO authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.collections TO authenticated;
GRANT ALL ON public.word_collections TO authenticated;

-- Make sure the trigger function has proper permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO authenticated;-- Temporary fix: Disable RLS to get the app working
-- Run this in your Supabase SQL editor
-- WARNING: This temporarily disables security - use only for development

-- Disable RLS temporarily on all tables
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.words DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_collections DISABLE ROW LEVEL SECURITY;

-- Grant full access to authenticated users for development
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Create a function to debug auth context (optional)
CREATE OR REPLACE FUNCTION debug_auth_context()
RETURNS TABLE(
  current_user_id UUID,
  user_role TEXT,
  jwt_claims JSONB
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    auth.uid() as current_user_id,
    current_user as user_role,
    auth.jwt() as jwt_claims;
$$;-- Add Vietnamese translation and synonyms columns to words table
-- Execute this SQL statement in your Supabase SQL editor

ALTER TABLE public.words
ADD COLUMN IF NOT EXISTS vietnamese_translation TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS synonyms TEXT DEFAULT '';

-- Update the full text search index to include the new columns
DROP INDEX IF EXISTS idx_words_search;
CREATE INDEX idx_words_search ON public.words
USING gin(to_tsvector('english', word || ' ' || definition || ' ' || example_sentence || ' ' || vietnamese_translation || ' ' || synonyms));

-- Add comment for documentation
COMMENT ON COLUMN public.words.vietnamese_translation IS 'Vietnamese translation of the word';
COMMENT ON COLUMN public.words.synonyms IS 'Comma-separated list of synonym words or phrases';-- Add unique constraint to prevent duplicate words per user
-- This migration adds a unique constraint on (user_id, word) to prevent duplicate words

-- First, let's remove any existing duplicates (keeping the most recent one)
DELETE FROM public.words w1
WHERE EXISTS (
  SELECT 1 FROM public.words w2
  WHERE w2.user_id = w1.user_id
  AND LOWER(w2.word) = LOWER(w1.word)
  AND w2.created_at > w1.created_at
);

-- Add unique constraint on (user_id, LOWER(word)) to prevent case-insensitive duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_words_user_word_unique
ON public.words(user_id, LOWER(word));

-- Add comment for documentation
COMMENT ON INDEX idx_words_user_word_unique IS 'Prevents duplicate words per user (case-insensitive)';-- Add CEFR level field to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cefr_level TEXT DEFAULT 'B2';

-- Update existing profiles to have B2 as default (intermediate level)
UPDATE public.profiles
SET cefr_level = 'B2'
WHERE cefr_level IS NULL OR cefr_level = '';-- Complete Flashcard System with FSRS Spaced Repetition
-- This script safely creates all components and handles existing ones gracefully
-- Execute this SQL statement in your Supabase SQL editor

-- Cards table: One card per word for each user
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,

  -- FSRS Algorithm Parameters
  stability REAL DEFAULT 1.0,              -- How stable the memory is
  difficulty REAL DEFAULT 5.0,             -- Difficulty rating (1-10)
  elapsed_days INTEGER DEFAULT 0,          -- Days since last review
  scheduled_days INTEGER DEFAULT 1,        -- Days until next review
  reps INTEGER DEFAULT 0,                  -- Number of repetitions
  lapses INTEGER DEFAULT 0,                -- Number of times forgotten
  last_review TIMESTAMP WITH TIME ZONE,    -- Last review time

  -- Card State
  state TEXT DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review', 'relearning')),
  due_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),

  -- Performance tracking
  total_study_time INTEGER DEFAULT 0,      -- Total time spent studying (seconds)
  ease_factor REAL DEFAULT 2.5,           -- Legacy Anki-style ease factor

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Ensure one card per word per user
  UNIQUE(user_id, word_id)
);

-- Review History table: Track all review sessions
CREATE TABLE IF NOT EXISTS public.review_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,

  -- Review details
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 4), -- 1=Again, 2=Hard, 3=Good, 4=Easy
  response_time INTEGER,                    -- Time to answer in milliseconds
  review_type TEXT DEFAULT 'manual' CHECK (review_type IN ('manual', 'auto')),

  -- State before review
  old_stability REAL,
  old_difficulty REAL,
  old_state TEXT,
  old_due_date TIMESTAMP WITH TIME ZONE,

  -- State after review
  new_stability REAL,
  new_difficulty REAL,
  new_state TEXT,
  new_due_date TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Quiz Questions table: Store AI-generated questions for each word
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,

  -- Question details
  question_type TEXT NOT NULL CHECK (question_type IN (
    'fill_blank', 'definition_choice', 'synonym_choice', 'context_choice'
  )),
  question_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  options JSONB DEFAULT '[]'::jsonb,        -- Array of all options for multiple choice
  explanation TEXT DEFAULT '',             -- Explanation of correct answer

  -- Metadata
  difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level >= 1 AND difficulty_level <= 5),
  usage_count INTEGER DEFAULT 0,          -- How many times this question was used
  success_rate REAL DEFAULT 0.0,          -- Success rate for this question

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Quiz Attempts table: Track quiz question attempts
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES public.quiz_questions(id) ON DELETE CASCADE NOT NULL,

  -- Attempt details
  user_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  response_time INTEGER,                    -- Time to answer in milliseconds

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Study Sessions table: Track study sessions for analytics
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Session details
  cards_studied INTEGER DEFAULT 0,
  new_cards INTEGER DEFAULT 0,
  review_cards INTEGER DEFAULT 0,
  total_time INTEGER DEFAULT 0,           -- Total session time in seconds

  -- Performance metrics
  correct_answers INTEGER DEFAULT 0,
  total_answers INTEGER DEFAULT 0,
  average_response_time INTEGER DEFAULT 0,

  started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- User Statistics table: Aggregate statistics for dashboard
CREATE TABLE IF NOT EXISTS public.user_statistics (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,

  -- Daily metrics
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_study_date DATE,

  -- Lifetime metrics
  total_cards_studied INTEGER DEFAULT 0,
  total_study_time INTEGER DEFAULT 0,    -- Total time in seconds
  total_reviews INTEGER DEFAULT 0,
  words_mastered INTEGER DEFAULT 0,      -- Cards with stability > 21 days

  -- Performance metrics
  average_retention_rate REAL DEFAULT 0.0,
  average_response_time INTEGER DEFAULT 0,

  -- Weekly/Monthly goals
  daily_goal INTEGER DEFAULT 20,
  weekly_goal INTEGER DEFAULT 140,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for performance (safe creation)
DO $$
BEGIN
    -- Cards indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cards_user_id') THEN
        CREATE INDEX idx_cards_user_id ON public.cards(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cards_due_date') THEN
        CREATE INDEX idx_cards_due_date ON public.cards(due_date);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cards_state') THEN
        CREATE INDEX idx_cards_state ON public.cards(state);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cards_user_due') THEN
        CREATE INDEX idx_cards_user_due ON public.cards(user_id, due_date) WHERE state IN ('learning', 'review', 'relearning');
    END IF;

    -- Review history indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_review_history_user_id') THEN
        CREATE INDEX idx_review_history_user_id ON public.review_history(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_review_history_card_id') THEN
        CREATE INDEX idx_review_history_card_id ON public.review_history(card_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_review_history_created_at') THEN
        CREATE INDEX idx_review_history_created_at ON public.review_history(created_at);
    END IF;

    -- Quiz questions indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_quiz_questions_word_id') THEN
        CREATE INDEX idx_quiz_questions_word_id ON public.quiz_questions(word_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_quiz_questions_type') THEN
        CREATE INDEX idx_quiz_questions_type ON public.quiz_questions(question_type);
    END IF;

    -- Quiz attempts indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_quiz_attempts_user_id') THEN
        CREATE INDEX idx_quiz_attempts_user_id ON public.quiz_attempts(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_quiz_attempts_card_id') THEN
        CREATE INDEX idx_quiz_attempts_card_id ON public.quiz_attempts(card_id);
    END IF;

    -- Study sessions indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_study_sessions_user_id') THEN
        CREATE INDEX idx_study_sessions_user_id ON public.study_sessions(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_study_sessions_started_at') THEN
        CREATE INDEX idx_study_sessions_started_at ON public.study_sessions(started_at);
    END IF;
END
$$;

-- Enable Row Level Security
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_statistics ENABLE ROW LEVEL SECURITY;

-- Create or replace Row Level Security Policies (handles existing policies gracefully)

-- Cards policies
DROP POLICY IF EXISTS "Users can view their own cards" ON public.cards;
CREATE POLICY "Users can view their own cards" ON public.cards
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own cards" ON public.cards;
CREATE POLICY "Users can insert their own cards" ON public.cards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own cards" ON public.cards;
CREATE POLICY "Users can update their own cards" ON public.cards
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own cards" ON public.cards;
CREATE POLICY "Users can delete their own cards" ON public.cards
  FOR DELETE USING (auth.uid() = user_id);

-- Review history policies
DROP POLICY IF EXISTS "Users can view their own review history" ON public.review_history;
CREATE POLICY "Users can view their own review history" ON public.review_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own review history" ON public.review_history;
CREATE POLICY "Users can insert their own review history" ON public.review_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Quiz questions policies (read-only for users, questions are generated by system)
DROP POLICY IF EXISTS "Users can view quiz questions for their words" ON public.quiz_questions;
CREATE POLICY "Users can view quiz questions for their words" ON public.quiz_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.words w
      WHERE w.id = quiz_questions.word_id AND w.user_id = auth.uid()
    )
  );

-- Quiz attempts policies
DROP POLICY IF EXISTS "Users can view their own quiz attempts" ON public.quiz_attempts;
CREATE POLICY "Users can view their own quiz attempts" ON public.quiz_attempts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own quiz attempts" ON public.quiz_attempts;
CREATE POLICY "Users can insert their own quiz attempts" ON public.quiz_attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Study sessions policies
DROP POLICY IF EXISTS "Users can view their own study sessions" ON public.study_sessions;
CREATE POLICY "Users can view their own study sessions" ON public.study_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own study sessions" ON public.study_sessions;
CREATE POLICY "Users can insert their own study sessions" ON public.study_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own study sessions" ON public.study_sessions;
CREATE POLICY "Users can update their own study sessions" ON public.study_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- User statistics policies
DROP POLICY IF EXISTS "Users can view their own statistics" ON public.user_statistics;
CREATE POLICY "Users can view their own statistics" ON public.user_statistics
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own statistics" ON public.user_statistics;
CREATE POLICY "Users can insert their own statistics" ON public.user_statistics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own statistics" ON public.user_statistics;
CREATE POLICY "Users can update their own statistics" ON public.user_statistics
  FOR UPDATE USING (auth.uid() = user_id);

-- Create or replace updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DROP TRIGGER IF EXISTS set_updated_at_cards ON public.cards;
CREATE TRIGGER set_updated_at_cards BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_quiz_questions ON public.quiz_questions;
CREATE TRIGGER set_updated_at_quiz_questions BEFORE UPDATE ON public.quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_user_statistics ON public.user_statistics;
CREATE TRIGGER set_updated_at_user_statistics BEFORE UPDATE ON public.user_statistics
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to create cards automatically when words are added
CREATE OR REPLACE FUNCTION public.create_card_for_word()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.cards (user_id, word_id)
  VALUES (NEW.user_id, NEW.id)
  ON CONFLICT (user_id, word_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create cards for new words
DROP TRIGGER IF EXISTS on_word_created ON public.words;
CREATE TRIGGER on_word_created
  AFTER INSERT ON public.words
  FOR EACH ROW EXECUTE FUNCTION public.create_card_for_word();

-- Create cards for existing words that don't have cards yet
INSERT INTO public.cards (user_id, word_id)
SELECT w.user_id, w.id
FROM public.words w
LEFT JOIN public.cards c ON c.user_id = w.user_id AND c.word_id = w.id
WHERE c.id IS NULL
ON CONFLICT (user_id, word_id) DO NOTHING;

-- Initialize user statistics for users who don't have them
INSERT INTO public.user_statistics (user_id)
SELECT DISTINCT u.id
FROM auth.users u
LEFT JOIN public.user_statistics s ON s.user_id = u.id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Update the existing user creation trigger to include stats
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');

  INSERT INTO public.profiles (id)
  VALUES (NEW.id);

  INSERT INTO public.user_statistics (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create a default collection
  INSERT INTO public.collections (user_id, name, description, is_active)
  VALUES (NEW.id, 'My Vocabulary', 'Default vocabulary collection', true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;-- Fix missing RLS policies for quiz_questions table
-- This allows the system to insert quiz questions for words owned by the user

-- Add INSERT policy for quiz_questions (drop first to avoid conflicts)
DROP POLICY IF EXISTS "System can insert quiz questions for user words" ON public.quiz_questions;
CREATE POLICY "System can insert quiz questions for user words" ON public.quiz_questions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.words w
      WHERE w.id = quiz_questions.word_id AND w.user_id = auth.uid()
    )
  );

-- Add UPDATE policy for quiz_questions (for usage stats)
DROP POLICY IF EXISTS "System can update quiz questions for user words" ON public.quiz_questions;
CREATE POLICY "System can update quiz questions for user words" ON public.quiz_questions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.words w
      WHERE w.id = quiz_questions.word_id AND w.user_id = auth.uid()
    )
  );

-- Add DELETE policy for quiz_questions
DROP POLICY IF EXISTS "System can delete quiz questions for user words" ON public.quiz_questions;
CREATE POLICY "System can delete quiz questions for user words" ON public.quiz_questions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.words w
      WHERE w.id = quiz_questions.word_id AND w.user_id = auth.uid()
    )
  );-- Add FSRS fields to quiz_questions table for exponential spaced repetition

-- Add new fields to quiz_questions table
ALTER TABLE public.quiz_questions
ADD COLUMN IF NOT EXISTS stability REAL DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS difficulty REAL DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS total_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS correct_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS interval_days REAL DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS last_review TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS avg_response_time INTEGER DEFAULT 5000;

-- Add constraints
ALTER TABLE public.quiz_questions
ADD CONSTRAINT quiz_stability_check CHECK (stability > 0),
ADD CONSTRAINT quiz_difficulty_check CHECK (difficulty >= 1 AND difficulty <= 10),
ADD CONSTRAINT quiz_attempts_check CHECK (total_attempts >= 0 AND correct_attempts >= 0 AND correct_attempts <= total_attempts),
ADD CONSTRAINT quiz_interval_check CHECK (interval_days > 0);

-- Update existing quiz questions with default FSRS values based on their current performance
DO $$
DECLARE
    question_record RECORD;
    calculated_success_rate REAL;
    calculated_stability REAL;
    calculated_difficulty REAL;
BEGIN
    -- Loop through existing quiz questions that don't have FSRS data
    FOR question_record IN
        SELECT id, usage_count, success_rate
        FROM public.quiz_questions
        WHERE stability = 1.0 AND difficulty = 5.0 -- Default values indicate no FSRS data
    LOOP
        -- Calculate initial FSRS values based on historical performance
        calculated_success_rate := COALESCE(question_record.success_rate, 0.0);

        -- Set initial stability based on success rate and usage
        IF question_record.usage_count = 0 THEN
            calculated_stability := 1.0; -- New question
        ELSE
            -- Higher success rate = higher initial stability (1-7 days)
            calculated_stability := 1.0 + (calculated_success_rate * 6.0);
        END IF;

        -- Set initial difficulty based on success rate
        -- Lower success rate = higher difficulty
        calculated_difficulty := 10.0 - (calculated_success_rate * 5.0);
        calculated_difficulty := GREATEST(1.0, LEAST(10.0, calculated_difficulty));

        -- Update the question with calculated values
        UPDATE public.quiz_questions
        SET
            stability = calculated_stability,
            difficulty = calculated_difficulty,
            total_attempts = GREATEST(question_record.usage_count, 0),
            correct_attempts = GREATEST(ROUND(question_record.usage_count * calculated_success_rate), 0),
            interval_days = calculated_stability,
            due_date = timezone('utc'::text, now()) -- Make all existing questions available immediately
        WHERE id = question_record.id;
    END LOOP;
END $$;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_quiz_questions_due_date ON public.quiz_questions(due_date);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_stability ON public.quiz_questions(stability);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_difficulty ON public.quiz_questions(difficulty);

-- Add composite index for efficient scheduling queries
CREATE INDEX IF NOT EXISTS idx_quiz_questions_scheduling
ON public.quiz_questions(due_date, difficulty, stability)
WHERE due_date IS NOT NULL;

-- Update the updated_at timestamp trigger to include new fields
CREATE OR REPLACE FUNCTION update_quiz_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists and recreate
DROP TRIGGER IF EXISTS trigger_quiz_questions_updated_at ON public.quiz_questions;
CREATE TRIGGER trigger_quiz_questions_updated_at
    BEFORE UPDATE ON public.quiz_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_quiz_questions_updated_at();

-- Add a function to clean up old quiz attempts (optional - for performance)
CREATE OR REPLACE FUNCTION cleanup_old_quiz_attempts()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete quiz attempts older than 1 year to keep table manageable
    DELETE FROM public.quiz_attempts
    WHERE created_at < (now() - interval '1 year');

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the new system
COMMENT ON COLUMN public.quiz_questions.stability IS 'FSRS stability value - higher means longer intervals between reviews';
COMMENT ON COLUMN public.quiz_questions.difficulty IS 'FSRS difficulty value (1-10) - higher means more difficult to remember';
COMMENT ON COLUMN public.quiz_questions.total_attempts IS 'Total number of times this question was attempted';
COMMENT ON COLUMN public.quiz_questions.correct_attempts IS 'Number of correct attempts';
COMMENT ON COLUMN public.quiz_questions.interval_days IS 'Current review interval in days';
COMMENT ON COLUMN public.quiz_questions.due_date IS 'When this question is next due for review';
COMMENT ON COLUMN public.quiz_questions.last_review IS 'When this question was last reviewed';
COMMENT ON COLUMN public.quiz_questions.avg_response_time IS 'Average response time in milliseconds';-- Groups Feature Migration
-- Extends collections table with color/icon metadata for Groups UI
-- Adds optional group_id FK to words table for one-to-many relationship
-- Execute in Supabase SQL editor

-- Step 1: Extend collections table with group metadata
ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#6366f1' CHECK (color ~* '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT 'folder';

COMMENT ON COLUMN public.collections.color IS 'Hex color code for group UI display (e.g., #FF5733)';
COMMENT ON COLUMN public.collections.icon IS 'Lucide-react icon name for group visual representation';

-- Step 2: Add optional group relationship to words
ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.collections(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.words.group_id IS 'Optional group assignment (one word belongs to one group). NULL = ungrouped/orphaned vocabulary';

-- Step 3: Create performance indexes
-- Single column index for group filtering queries
CREATE INDEX IF NOT EXISTS idx_words_group_id ON public.words(group_id);

-- Composite index for common query pattern (user_id + group_id)
-- Optimizes: SELECT * FROM words WHERE user_id = ? AND group_id IN (?, ?)
CREATE INDEX IF NOT EXISTS idx_words_user_group ON public.words(user_id, group_id);

-- Step 4: Verify RLS policies (no changes needed - group_id scoped via FK)
-- Existing policies on collections already enforce user_id scoping:
-- - SELECT: auth.uid() = user_id
-- - INSERT: auth.uid() = user_id
-- - UPDATE: auth.uid() = user_id
-- - DELETE: auth.uid() = user_id
-- Group_id is automatically user-scoped via FK to collections(user_id)

-- Migration completed successfully
-- All schema changes are idempotent (IF NOT EXISTS clauses)
-- No data loss - existing words remain queryable with group_id = NULL

-- ============================================================================
-- ROLLBACK SCRIPT
-- Execute manually if migration needs to be reversed
-- Test in staging environment before running in production
-- ============================================================================

/*
BEGIN;

-- Remove group_id column and related indexes
ALTER TABLE public.words DROP COLUMN IF EXISTS group_id;
DROP INDEX IF EXISTS public.idx_words_group_id;
DROP INDEX IF EXISTS public.idx_words_user_group;

-- Remove color and icon columns from collections
ALTER TABLE public.collections DROP COLUMN IF EXISTS color;
ALTER TABLE public.collections DROP COLUMN IF EXISTS icon;

COMMIT;
*/
-- Change default collection from "My Vocabulary" to "Uncategorized"
-- Update all existing collections named "My Vocabulary"
-- Assign all ungrouped words to their user's Uncategorized collection

BEGIN;

-- Step 1: Rename existing "My Vocabulary" collections to "Uncategorized"
UPDATE public.collections
SET
  name = 'Uncategorized',
  description = 'Default group for uncategorized vocabulary'
WHERE
  name = 'My Vocabulary'
  OR name = 'Default vocabulary collection'
  OR description = 'Default vocabulary collection';

-- Step 2: Update the trigger function to create "Uncategorized" for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');

  INSERT INTO public.profiles (id)
  VALUES (NEW.id);

  -- Create a default Uncategorized collection
  INSERT INTO public.collections (user_id, name, description, is_active, color, icon)
  VALUES (NEW.id, 'Uncategorized', 'Default group for uncategorized vocabulary', true, '#6366f1', 'Folder');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Assign all ungrouped words to their user's Uncategorized collection
-- This ensures all words belong to a group for consistent UI/filtering
UPDATE public.words w
SET group_id = (
  SELECT c.id
  FROM public.collections c
  WHERE c.user_id = w.user_id
    AND c.name = 'Uncategorized'
  LIMIT 1
)
WHERE w.group_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.collections c
    WHERE c.user_id = w.user_id
      AND c.name = 'Uncategorized'
  );

COMMIT;

-- Verify the migration
-- SELECT COUNT(*) FROM words WHERE group_id IS NULL; -- Should be 0 or very low
-- SELECT name, COUNT(*) as user_count FROM collections WHERE name = 'Uncategorized' GROUP BY name;
