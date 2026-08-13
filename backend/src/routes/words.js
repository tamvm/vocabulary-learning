import express from 'express';
import Joi from 'joi';
import { quizService } from '../services/quizService.js';
import { buildWordSearchOrFilter } from '../utils/postgrestFilter.js';

const router = express.Router();

// Validation schemas
const createWordSchema = Joi.object({
  word: Joi.string().min(1).max(100).required(),
  definition: Joi.string().max(1000).default(''),
  wordType: Joi.string().max(50).default(''),
  cefrLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2', '').default(''),
  ipaPronunciation: Joi.string().max(200).default(''),
  exampleSentence: Joi.string().max(500).default(''),
  notes: Joi.string().max(1000).default(''),
  tags: Joi.array().items(Joi.string().max(50)).default([]),
  collectionId: Joi.string().uuid().optional(),
  groupId: Joi.string().uuid().optional().allow(null), // NEW: Group assignment
  vietnameseTranslation: Joi.string().max(500).default(''),
  synonyms: Joi.string().max(1000).default(''),
});

const updateWordSchema = Joi.object({
  word: Joi.string().min(1).max(100),
  definition: Joi.string().max(1000),
  wordType: Joi.string().max(50),
  cefrLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2', ''),
  ipaPronunciation: Joi.string().max(200),
  exampleSentence: Joi.string().max(500),
  notes: Joi.string().max(1000),
  tags: Joi.array().items(Joi.string().max(50)),
  groupId: Joi.string().uuid().optional().allow(null), // NEW: Group reassignment
  vietnameseTranslation: Joi.string().max(500),
  synonyms: Joi.string().max(1000),
});

const searchSchema = Joi.object({
  q: Joi.string().min(1).max(100),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  offset: Joi.number().integer().min(0).default(0),
  collection: Joi.string().uuid(),
  groups: Joi.alternatives().try(
    Joi.string().uuid(), // Single group ID
    Joi.string().pattern(/^([0-9a-f-]{36}|ungrouped)(,([0-9a-f-]{36}|ungrouped))*$/) // Comma-separated UUIDs or "ungrouped"
  ).optional(), // NEW: Multi-group filtering
  sortBy: Joi.string().valid('created_at', 'word', 'updated_at').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// Get all words
router.get('/', async (req, res, next) => {
  try {
    const { error, value } = searchSchema.validate(req.query);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { q, limit, offset, collection, groups, sortBy, sortOrder } = value;

    let query = req.supabase
      .from('words')
      .select(`
        *,
        group:collections!group_id(id, name, color, icon),
        word_collections(
          collection_id,
          collections(name)
        )
      `)
      .eq('user_id', req.user.id);

    // Add search filter (q is escaped for ILIKE wildcards + PostgREST grammar)
    if (q) {
      query = query.or(buildWordSearchOrFilter(q));
    }

    // NEW: Group filtering (takes precedence over collection filter)
    if (groups) {
      const groupIds = groups.includes(',')
        ? groups.split(',').map(id => id.trim())
        : [groups];

      // Support "ungrouped" special value
      if (groupIds.includes('ungrouped')) {
        const otherGroups = groupIds.filter(id => id !== 'ungrouped');
        if (otherGroups.length > 0) {
          query = query.or(`group_id.in.(${otherGroups.join(',')}),group_id.is.null`);
        } else {
          query = query.is('group_id', null);
        }
      } else {
        query = query.in('group_id', groupIds);
      }
    }
    // Fallback to existing collection filter
    else if (collection) {
      const { data: wordsInCollection } = await req.supabase
        .from('word_collections')
        .select('word_id')
        .eq('collection_id', collection);

      const wordIds = wordsInCollection?.map(wc => wc.word_id) || [];
      query = query.in('id', wordIds);
    }

    // Add sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Add pagination
    query = query.range(offset, offset + limit - 1);

    const { data: words, error: wordsError } = await query;

    if (wordsError) {
      return next(wordsError);
    }

    // Get total count for pagination
    let countQuery = req.supabase
      .from('words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    if (q) {
      countQuery = countQuery.or(buildWordSearchOrFilter(q));
    }

    // NEW: Apply group filter to count query
    if (groups) {
      const groupIds = groups.includes(',')
        ? groups.split(',').map(id => id.trim())
        : [groups];

      if (groupIds.includes('ungrouped')) {
        const otherGroups = groupIds.filter(id => id !== 'ungrouped');
        if (otherGroups.length > 0) {
          countQuery = countQuery.or(`group_id.in.(${otherGroups.join(',')}),group_id.is.null`);
        } else {
          countQuery = countQuery.is('group_id', null);
        }
      } else {
        countQuery = countQuery.in('group_id', groupIds);
      }
    }
    else if (collection) {
      // For collection filtering in count query, we need to use a subquery
      const { data: wordsInCollection } = await req.supabase
        .from('word_collections')
        .select('word_id')
        .eq('collection_id', collection);

      const wordIds = wordsInCollection?.map(wc => wc.word_id) || [];
      countQuery = countQuery.in('id', wordIds);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      return next(countError);
    }

    res.json({
      words,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: offset + limit < count,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get word by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { data: word, error } = await req.supabase
      .from('words')
      .select(`
        *,
        word_collections(
          collection_id,
          collections(id, name)
        )
      `)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Word not found' });
      }
      return next(error);
    }

    res.json({ word });
  } catch (error) {
    next(error);
  }
});

// Create new word
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createWordSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { collectionId, groupId, ...wordData } = value;

    // NEW: Validate groupId if provided
    if (groupId) {
      const { data: groupExists } = await req.supabase
        .from('collections')
        .select('id')
        .eq('id', groupId)
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (!groupExists) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }
    }

    // Insert word with group_id
    const { data: word, error: insertError} = await req.supabase
      .from('words')
      .insert({
        ...wordData,
        user_id: req.user.id,
        group_id: groupId || null, // NEW: Set group assignment
        cefr_level: wordData.cefrLevel,
        word_type: wordData.wordType,
        ipa_pronunciation: wordData.ipaPronunciation,
        example_sentence: wordData.exampleSentence,
        vietnamese_translation: wordData.vietnameseTranslation,
        synonyms: wordData.synonyms,
      })
      .select(`
        *,
        group:collections!group_id(id, name, color, icon)
      `)
      .single();

    if (insertError) {
      // Check if it's a duplicate word error
      if (insertError.code === '23505' && insertError.message.includes('idx_words_user_word_unique')) {
        return res.status(409).json({
          error: 'duplicate_word',
          message: `"${wordData.word}" is already in your vocabulary`
        });
      }
      return next(insertError);
    }

    // Add to collection if specified
    if (collectionId) {
      const { error: collectionError } = await req.supabase
        .from('word_collections')
        .insert({
          word_id: word.id,
          collection_id: collectionId,
        });

      if (collectionError) {
        // If collection assignment fails, we could either rollback or continue
        console.error('Failed to add word to collection:', collectionError);
      }
    } else {
      // Add to user's default collection
      const { data: defaultCollection } = await req.supabase
        .from('collections')
        .select('id')
        .eq('user_id', req.user.id)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (defaultCollection) {
        await req.supabase
          .from('word_collections')
          .insert({
            word_id: word.id,
            collection_id: defaultCollection.id,
          });
      }
    }

    // Update user profile stats
    const { error: profileError } = await req.supabase.rpc(
      'increment_words_added',
      { user_id: req.user.id }
    );

    if (profileError) {
      console.error('Failed to update profile stats:', profileError);
    }

    // Generate quiz question for the new word (async, don't wait for completion)
    quizService.generateAndSaveQuizQuestions([word], req.supabase)
      .then(result => {
        console.log(`Quiz question generation result for word "${word.word}":`, result);
      })
      .catch(error => {
        console.error(`Failed to generate quiz question for word "${word.word}":`, error);
      });

    res.status(201).json({
      message: 'Word created successfully',
      word,
    });
  } catch (error) {
    next(error);
  }
});

// Update word
router.put('/:id', async (req, res, next) => {
  try {
    const { error, value } = updateWordSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { groupId, ...otherFields } = value;

    // NEW: Validate groupId if provided (and not null)
    if (groupId !== undefined && groupId !== null) {
      const { data: groupExists } = await req.supabase
        .from('collections')
        .select('id')
        .eq('id', groupId)
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (!groupExists) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }
    }

    // Build update object - only include fields that were provided
    const updateData = {
      updated_at: new Date().toISOString(),
    };

    // Map camelCase to snake_case for provided fields only
    if (otherFields.word !== undefined) updateData.word = otherFields.word;
    if (otherFields.definition !== undefined) updateData.definition = otherFields.definition;
    if (otherFields.cefrLevel !== undefined) updateData.cefr_level = otherFields.cefrLevel;
    if (otherFields.wordType !== undefined) updateData.word_type = otherFields.wordType;
    if (otherFields.ipaPronunciation !== undefined) updateData.ipa_pronunciation = otherFields.ipaPronunciation;
    if (otherFields.exampleSentence !== undefined) updateData.example_sentence = otherFields.exampleSentence;
    if (otherFields.notes !== undefined) updateData.notes = otherFields.notes;
    if (otherFields.tags !== undefined) updateData.tags = otherFields.tags;
    if (otherFields.vietnameseTranslation !== undefined) updateData.vietnamese_translation = otherFields.vietnameseTranslation;
    if (otherFields.synonyms !== undefined) updateData.synonyms = otherFields.synonyms;

    // NEW: Add group_id to update if provided (allow null to unassign)
    if (groupId !== undefined) {
      updateData.group_id = groupId;
    }

    const { data: word, error: updateError } = await req.supabase
      .from('words')
      .update(updateData)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select(`
        *,
        group:collections!group_id(id, name, color, icon)
      `)
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Word not found' });
      }
      return next(updateError);
    }

    res.json({
      message: 'Word updated successfully',
      word,
    });
  } catch (error) {
    next(error);
  }
});

// Delete word
router.delete('/:id', async (req, res, next) => {
  try {
    const { data: word, error } = await req.supabase
      .from('words')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Word not found' });
      }
      return next(error);
    }

    res.json({
      message: 'Word deleted successfully',
      word,
    });
  } catch (error) {
    next(error);
  }
});

// Bulk operations
router.post('/bulk', async (req, res, next) => {
  try {
    const bulkSchema = Joi.object({
      operation: Joi.string().valid('import', 'export', 'delete', 'update-group').required(),
      words: Joi.array().items(createWordSchema).when('operation', {
        is: 'import',
        then: Joi.required(),
      }),
      ids: Joi.array().items(Joi.string().uuid()).when('operation', {
        is: Joi.valid('delete', 'update-group'),
        then: Joi.required(),
      }),
      groupId: Joi.string().uuid().allow(null).when('operation', {
        is: 'update-group',
        then: Joi.required(),
      }),
      collectionId: Joi.string().uuid(),
    });

    const { error, value } = bulkSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { operation, words, ids, groupId, collectionId } = value;

    switch (operation) {
      case 'import':
        const wordsToInsert = words.map(word => {
          // Destructure to exclude camelCase fields that need to be converted to snake_case
          const { cefrLevel, wordType, ipaPronunciation, exampleSentence, vietnameseTranslation, groupId, ...restWord } = word;

          return {
            ...restWord,
            user_id: req.user.id,
            group_id: groupId || null, // Handle group assignment during import
            cefr_level: cefrLevel,
            word_type: wordType,
            ipa_pronunciation: ipaPronunciation,
            example_sentence: exampleSentence,
            vietnamese_translation: vietnameseTranslation,
          };
        });

        const { data: insertedWords, error: insertError } = await req.supabase
          .from('words')
          .insert(wordsToInsert)
          .select();

        if (insertError) {
          return next(insertError);
        }

        // Generate quiz questions for imported words (async, don't wait for completion)
        if (insertedWords.length > 0) {
          quizService.generateAndSaveQuizQuestions(insertedWords, req.supabase)
            .then(result => {
              console.log(`Batch quiz question generation result for ${insertedWords.length} imported words:`, result);
            })
            .catch(error => {
              console.error(`Failed to generate quiz questions for imported words:`, error);
            });
        }

        res.status(201).json({
          message: `${insertedWords.length} words imported successfully`,
          words: insertedWords,
        });
        break;

      case 'export':
        const { data: exportWords, error: exportError } = await req.supabase
          .from('words')
          .select('*')
          .eq('user_id', req.user.id);

        if (exportError) {
          return next(exportError);
        }

        res.json({
          words: exportWords,
          exportedAt: new Date().toISOString(),
        });
        break;

      case 'delete':
        const { data: deletedWords, error: deleteError } = await req.supabase
          .from('words')
          .delete()
          .eq('user_id', req.user.id)
          .in('id', ids)
          .select();

        if (deleteError) {
          return next(deleteError);
        }

        res.json({
          message: `${deletedWords.length} words deleted successfully`,
          deletedWords,
        });
        break;

      case 'update-group':
        // Validate groupId if provided (and not null)
        if (groupId !== null) {
          const { data: groupExists } = await req.supabase
            .from('collections')
            .select('id')
            .eq('id', groupId)
            .eq('user_id', req.user.id)
            .maybeSingle();

          if (!groupExists) {
            return res.status(400).json({ error: 'Invalid group ID' });
          }
        }

        // Update all words with the new group_id
        const { data: updatedWords, error: updateError } = await req.supabase
          .from('words')
          .update({
            group_id: groupId,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', req.user.id)
          .in('id', ids)
          .select(`
            *,
            group:collections!group_id(id, name, color, icon)
          `);

        if (updateError) {
          return next(updateError);
        }

        res.json({
          message: `${updatedWords.length} ${updatedWords.length === 1 ? 'word' : 'words'} assigned to group successfully`,
          words: updatedWords,
        });
        break;

      default:
        res.status(400).json({ error: 'Invalid operation' });
    }
  } catch (error) {
    next(error);
  }
});

// Generate quiz questions for words that don't have any
router.post('/generate-quiz-questions', async (req, res, next) => {
  try {
    const schema = Joi.object({
      wordIds: Joi.array().items(Joi.string().uuid()).optional(),
      regenerateAll: Joi.boolean().default(false),
      batchSize: Joi.number().integer().min(1).max(20).default(10),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const { wordIds, regenerateAll, batchSize } = value;

    let query = req.supabase
      .from('words')
      .select('*')
      .eq('user_id', req.user.id);

    // Filter by specific word IDs if provided
    if (wordIds && wordIds.length > 0) {
      query = query.in('id', wordIds);
    }

    const { data: words, error: wordsError } = await query;

    if (wordsError) {
      return next(wordsError);
    }

    if (!words || words.length === 0) {
      return res.json({
        message: 'No words found',
        generated: 0,
        saved: 0,
        errors: 0,
      });
    }

    let wordsToProcess = words;

    // If not regenerating all, filter out words that already have quiz questions
    if (!regenerateAll) {
      const { data: existingQuestions, error: existingError } = await req.supabase
        .from('quiz_questions')
        .select('word_id')
        .in('word_id', words.map(w => w.id));

      if (existingError) {
        return next(existingError);
      }

      const existingWordIds = new Set(existingQuestions?.map(q => q.word_id) || []);
      wordsToProcess = words.filter(word => !existingWordIds.has(word.id));
    } else {
      // If regenerating all, delete existing questions first
      const { error: deleteError } = await req.supabase
        .from('quiz_questions')
        .delete()
        .in('word_id', words.map(w => w.id));

      if (deleteError) {
        console.error('Error deleting existing quiz questions:', deleteError);
        return next(deleteError);
      }
    }

    if (wordsToProcess.length === 0) {
      return res.json({
        message: regenerateAll ? 'No words to regenerate questions for' : 'All selected words already have quiz questions',
        generated: 0,
        saved: 0,
        errors: 0,
      });
    }

    const result = await quizService.generateAndSaveQuizQuestions(wordsToProcess, req.supabase);

    res.json({
      message: result.message || `Processed ${wordsToProcess.length} words`,
      totalWordsProcessed: wordsToProcess.length,
      ...result,
    });

  } catch (error) {
    console.error('Quiz question generation endpoint error:', error);
    next(error);
  }
});

export default router;