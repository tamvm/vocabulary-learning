import express from 'express';
import Joi from 'joi';
import { aiService } from '../services/aiService.js';
import { youtubeTranscriptService } from '../services/youtubeTranscriptService.js';

const router = express.Router();

// Validation
const analyzeSchema = Joi.object({
  videoUrl: Joi.string().uri().required(),
});

const quizSchema = Joi.object({
  videoUrl: Joi.string().uri().required(),
  vocabularyWordIds: Joi.array().items(Joi.string().uuid()).optional(),
  questionCount: Joi.number().integer().min(3).max(15).default(8),
});

// POST /api/youtube/analyze
// Extract transcript + find vocabulary at user's CEFR level
router.post('/analyze', async (req, res, next) => {
  try {
    const { error, value } = analyzeSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { videoUrl } = value;

    // Step 1: Get user's CEFR level
    let userCefrLevel = 'B2';
    try {
      const { data: profile } = await req.supabase
        .from('profiles')
        .select('cefr_level')
        .eq('id', req.user.id)
        .single();
      if (profile?.cefr_level) {
        userCefrLevel = profile.cefr_level;
      }
    } catch (err) {
      console.log('Could not fetch user CEFR level, using default B2');
    }

    // Step 2: Extract transcript
    console.log(`🎥 Extracting transcript for: ${videoUrl}`);
    const transcriptResult = await youtubeTranscriptService.processYouTubeUrl(videoUrl);

    if (!transcriptResult.success) {
      return res.status(400).json({
        error: 'youtube_transcript_failed',
        message: transcriptResult.error,
      });
    }

    const { content, title, videoInfo } = transcriptResult;
    const videoId = youtubeTranscriptService.extractVideoId(videoUrl);

    // Step 3: Get user's known words + existing vocabulary
    let knownWords = new Set();
    let learnedWords = new Set();
    try {
      const [knownResult, wordsResult] = await Promise.all([
        req.supabase.from('known_words').select('word').eq('user_id', req.user.id),
        req.supabase.from('words').select('word').eq('user_id', req.user.id),
      ]);
      knownWords = new Set((knownResult.data || []).map(k => k.word.toLowerCase()));
      learnedWords = new Set((wordsResult.data || []).map(w => w.word.toLowerCase()));
    } catch (err) {
      console.log('Could not fetch known/learned words:', err.message);
    }

    // Step 4: AI vocabulary extraction
    console.log(`🤖 Analyzing vocabulary at ${userCefrLevel} level...`);
    const result = await aiService.analyzeWebsiteContent(content, userCefrLevel, {
      limit: 30,
      chunksToProcess: 6, // YouTube transcripts can be long
    });

    // Step 5: Mark known + learned words
    const vocabulary = (result.vocabulary || []).map(item => ({
      ...item,
      isKnown: knownWords.has(item.word.toLowerCase()),
      isLearned: learnedWords.has(item.word.toLowerCase()),
    }));

    // Step 6: Save video lesson record
    let lessonId = null;
    try {
      const { data: lesson, error: lessonErr } = await req.supabase
        .from('video_lessons')
        .insert({
          user_id: req.user.id,
          video_url: videoUrl,
          video_id: videoId,
          title: title || videoInfo?.title,
          thumbnail_url: videoInfo?.thumbnail || null,
          status: 'analyzed',
        })
        .select('id')
        .single();

      if (!lessonErr && lesson) {
        lessonId = lesson.id;
      }
    } catch (err) {
      console.log('Could not save video lesson:', err.message);
    }

    res.json({
      success: true,
      lessonId,
      videoInfo: {
        videoId,
        title: title || videoInfo?.title,
        thumbnail: videoInfo?.thumbnail || null,
        duration: videoInfo?.duration || null,
        channel: videoInfo?.channel || videoInfo?.uploader || null,
      },
      vocabulary,
      transcriptPreview: content.substring(0, 300) + '...',
      transcriptLength: content.length,
      userCefrLevel,
      totalFound: vocabulary.length,
      knownCount: vocabulary.filter(v => v.isKnown).length,
      learnedCount: vocabulary.filter(v => v.isLearned && !v.isKnown).length,
      newCount: vocabulary.filter(v => !v.isKnown && !v.isLearned).length,
    });
  } catch (error) {
    console.error('YouTube analyze error:', error);
    next(error);
  }
});

// POST /api/youtube/quiz
// Generate content comprehension quiz based on video transcript
router.post('/quiz', async (req, res, next) => {
  try {
    const { error, value } = quizSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { videoUrl, questionCount } = value;

    // Step 1: Get transcript (re-fetch, could cache later)
    console.log(`🎥 Fetching transcript for quiz: ${videoUrl}`);
    const transcriptResult = await youtubeTranscriptService.processYouTubeUrl(videoUrl);

    if (!transcriptResult.success) {
      return res.status(400).json({
        error: 'youtube_transcript_failed',
        message: transcriptResult.error,
      });
    }

    const content = transcriptResult.content;
    const videoId = youtubeTranscriptService.extractVideoId(videoUrl);

    // Step 2: Get user's CEFR level for question difficulty
    let userCefrLevel = 'B2';
    try {
      const { data: profile } = await req.supabase
        .from('profiles')
        .select('cefr_level')
        .eq('id', req.user.id)
        .single();
      if (profile?.cefr_level) {
        userCefrLevel = profile.cefr_level;
      }
    } catch (err) {
      console.log('Could not fetch user CEFR level');
    }

    // Step 3: AI generates comprehension questions
    console.log(`🧠 Generating ${questionCount} comprehension questions...`);

    // Truncate transcript if too long for a single prompt
    const maxChars = 15000;
    const truncatedContent = content.length > maxChars
      ? content.substring(0, maxChars) + '\n[... transcript continues ...]'
      : content;

    const prompt = `You are an English listening comprehension test creator.
The student's English level is ${userCefrLevel} (CEFR).

Below is a transcript from a YouTube video. Create ${questionCount} multiple-choice questions that test whether the student **understood the content** of the video.

🎯 Question Rules:
- Test comprehension of the video's main ideas, key details, sequence of events, speaker opinions, and implicit meanings
- Do NOT ask vocabulary definitions or grammar questions
- Each question must have exactly 4 options (A, B, C, D)
- One correct answer, three plausible distractors
- Questions should be at ${userCefrLevel} level English
- Include a rough timestamp hint (e.g., "around 2:30") so the student can re-listen if needed

📝 Return a JSON array of question objects:

[
  {
    "question": "What was the main reason the speaker gave for...",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "timestamp": "approx 1:45",
    "explanation": "The speaker explicitly states at 1:45 that..."
  }
]

Transcript:
"""
${truncatedContent}
"""

Return ONLY valid JSON array, no other text.`;

    const response = await aiService.makeRequest('chat/completions', {
      model: aiService.config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 4000,
    });

    if (!response.choices || !response.choices[0]) {
      throw new Error('No response from AI service');
    }

    let content_response = response.choices[0].message.content;
    content_response = content_response.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

    let questions;
    try {
      questions = JSON.parse(content_response);
    } catch (parseError) {
      console.error('Failed to parse quiz response:', content_response);
      throw new Error('Invalid AI response format for quiz');
    }

    if (!Array.isArray(questions)) {
      throw new Error('Quiz response is not an array');
    }

    // Validate and clean questions
    const validatedQuestions = questions
      .filter(q => q.question && Array.isArray(q.options) && q.options.length === 4)
      .map((q, idx) => ({
        id: idx,
        question: q.question,
        options: q.options,
        correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
        timestamp: q.timestamp || null,
        explanation: q.explanation || '',
      }));

    // Step 4: Update video lesson with quiz info
    try {
      await req.supabase
        .from('video_lessons')
        .update({
          quiz_total: validatedQuestions.length,
          status: 'quiz_generated',
        })
        .eq('video_id', videoId)
        .eq('user_id', req.user.id);
    } catch (err) {
      console.log('Could not update video lesson:', err.message);
    }

    res.json({
      success: true,
      videoId,
      questions: validatedQuestions,
      totalQuestions: validatedQuestions.length,
    });
  } catch (error) {
    console.error('YouTube quiz error:', error);
    next(error);
  }
});

// POST /api/youtube/complete
// Mark lesson as completed with quiz score
router.post('/complete', async (req, res, next) => {
  try {
    const schema = Joi.object({
      lessonId: Joi.string().uuid().optional(),
      videoUrl: Joi.string().uri().optional(),
      quizScore: Joi.number().integer().min(0).required(),
      quizTotal: Joi.number().integer().min(1).required(),
      wordsSaved: Joi.number().integer().min(0).default(0),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { lessonId, videoUrl, quizScore, quizTotal, wordsSaved } = value;

    // Find or create lesson
    let lesson;
    if (lessonId) {
      const { data } = await req.supabase
        .from('video_lessons')
        .select('id')
        .eq('id', lessonId)
        .eq('user_id', req.user.id)
        .single();
      lesson = data;
    }

    if (!lesson && videoUrl) {
      const videoId = youtubeTranscriptService.extractVideoId(videoUrl);
      const { data } = await req.supabase
        .from('video_lessons')
        .insert({
          user_id: req.user.id,
          video_url: videoUrl,
          video_id: videoId,
          quiz_score: quizScore,
          quiz_total: quizTotal,
          words_saved: wordsSaved,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      lesson = data;
    } else if (lesson) {
      await req.supabase
        .from('video_lessons')
        .update({
          quiz_score: quizScore,
          quiz_total: quizTotal,
          words_saved: wordsSaved,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', lesson.id);
    }

    res.json({
      success: true,
      lessonId: lesson?.id || null,
      score: quizScore,
      total: quizTotal,
      percentage: Math.round((quizScore / quizTotal) * 100),
    });
  } catch (error) {
    console.error('Complete lesson error:', error);
    next(error);
  }
});

// POST /api/youtube/mark-known
// Mark a word as known (so it's pre-unchecked in future analyses)
router.post('/mark-known', async (req, res, next) => {
  try {
    const schema = Joi.object({
      word: Joi.string().min(1).max(200).required(),
      known: Joi.boolean().default(true),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { word, known } = value;
    const normalizedWord = word.toLowerCase().trim();

    if (known) {
      // Upsert into known_words
      const { error: upsertErr } = await req.supabase
        .from('known_words')
        .upsert({
          user_id: req.user.id,
          word: normalizedWord,
        }, {
          onConflict: 'user_id,word',
          ignoreDuplicates: true,
        });

      if (upsertErr) {
        // Fallback: try insert, ignore duplicate
        try {
          await req.supabase
            .from('known_words')
            .insert({
              user_id: req.user.id,
              word: normalizedWord,
            });
        } catch (_) {
          // Already exists, that's fine
        }
      }
    } else {
      // Remove from known_words
      await req.supabase
        .from('known_words')
        .delete()
        .eq('user_id', req.user.id)
        .eq('word', normalizedWord);
    }

    res.json({ success: true, word: normalizedWord, known });
  } catch (error) {
    console.error('Mark known error:', error);
    next(error);
  }
});

// GET /api/youtube/history
// Get user's video lesson history
router.get('/history', async (req, res, next) => {
  try {
    const { data: lessons, error } = await req.supabase
      .from('video_lessons')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    res.json({
      lessons: lessons || [],
      total: lessons?.length || 0,
    });
  } catch (error) {
    console.error('History error:', error);
    next(error);
  }
});

export default router;
