import https from 'https';
import http from 'http';
import {
  parseAiJsonObject,
  normalizeLessonSummary,
  extractLessonSummaryRaw,
} from './lessonSummaryNormalize.js';
import {
  configurationError,
  createPublicAiError,
  resolveAiProvider,
} from './aiConfig.js';
import { withTimeout } from './youtubeAnalyzeHelpers.js';
import {
  requireChatMessageText,
  stripJsonFences,
  withThinkingDisabled,
} from './chatMessageText.js';

/**
 * Map Free Dictionary API entry → app word-analysis shape.
 * Exported for unit tests.
 */
export function mapFreeDictionaryEntry(entry, fallbackWord = '') {
  if (!entry || typeof entry !== 'object') return null;

  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  const meaning = meanings[0] || {};
  const definitions = Array.isArray(meaning.definitions) ? meaning.definitions : [];
  const def = definitions[0] || {};
  const definition = typeof def.definition === 'string' ? def.definition.trim() : '';
  if (!definition) return null;

  const phoneticFromList = Array.isArray(entry.phonetics)
    ? entry.phonetics.find((p) => p?.text)?.text
    : '';
  const ipaRaw = entry.phonetic || phoneticFromList || '';
  const ipaPronunciation = String(ipaRaw).replace(/^\/|\/$/g, '').trim();

  const synonymSet = new Set();
  for (const m of meanings) {
    for (const s of m.synonyms || []) {
      if (typeof s === 'string' && s.trim()) synonymSet.add(s.trim());
    }
    for (const d of m.definitions || []) {
      for (const s of d.synonyms || []) {
        if (typeof s === 'string' && s.trim()) synonymSet.add(s.trim());
      }
    }
  }

  return {
    word: entry.word || fallbackWord,
    definition,
    wordType: meaning.partOfSpeech || '',
    cefrLevel: '',
    ipaPronunciation,
    exampleSentence: typeof def.example === 'string' ? def.example : '',
    notes: 'Definition from Free Dictionary (AI unavailable)',
    tags: ['dictionary'],
    vietnameseTranslation: '',
    synonyms: [...synonymSet].slice(0, 8).join(', '),
    source: 'dictionary',
  };
}

class AIService {
  constructor() {
    this.providers = {
      'ollama-cloud': {
        baseUrl: 'https://api.ollama.cloud/v1',
        defaultModel: 'gpt-oss:20b-cloud',
      },
      'openai': {
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
      },
      'opencode': {
        baseUrl: 'https://opencode.ai/zen/go/v1',
        // Prefer mimo-v2.5 on OpenCode Go when AI_MODEL is unset.
        defaultModel: 'mimo-v2.5',
      },
      // Alias used in Coolify / other apps (e.g. LLM_PROVIDER=opencode-go)
      'opencode-go': {
        baseUrl: 'https://opencode.ai/zen/go/v1',
        defaultModel: 'mimo-v2.5',
      },
      'ollama-local': {
        baseUrl: 'http://localhost:11434',
        defaultModel: 'llama3.2:latest',
      },
    };

    const providerName = resolveAiProvider(
      process.env.AI_PROVIDER
        || (String(process.env.OPENCODE_API_KEY || '').trim() ? 'opencode' : 'openai')
    );
    const providerDefaults = this.providers[providerName] || {};
    const configuredModel = String(
      process.env.AI_MODEL || providerDefaults.defaultModel || 'gpt-4o-mini'
    ).trim();

    this.config = {
      provider: providerName,
      apiKey: String(
        process.env.AI_API_KEY || process.env.OPENCODE_API_KEY || ''
      ).trim(),
      model: configuredModel,
      localHost: process.env.OLLAMA_LOCAL_HOST || 'http://localhost:11434',
    };
  }

  configurationError() {
    return configurationError({
      provider: this.config.provider,
      apiKey: this.config.apiKey,
      knownProviders: new Set(Object.keys(this.providers)),
    });
  }

  isConfigured() {
    return !this.configurationError();
  }

  async httpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const req = protocol.request(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout || 90000, // Increased to 90 seconds for AI requests
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            text: () => Promise.resolve(data),
            json: () => Promise.resolve(JSON.parse(data)),
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  async analyzeWord(word) {
    if (!word || typeof word !== 'string') {
      throw new Error('Word must be a non-empty string');
    }

    const prompt = `Analyze the English word "${word}" and provide a comprehensive analysis in the following JSON format:

{
  "word": "${word}",
  "definition": "Clear, concise definition",
  "wordType": "noun/verb/adjective/adverb/etc",
  "cefrLevel": "A1/A2/B1/B2/C1/C2",
  "ipaPronunciation": "IPA pronunciation",
  "exampleSentence": "Example sentence using the word",
  "notes": "Additional notes about usage, etymology, or context",
  "tags": ["tag1", "tag2"],
  "vietnameseTranslation": "Vietnamese translation of the word",
  "synonyms": "Comma-separated list of synonym words or phrases"
}

Ensure the response is valid JSON only, without any additional text or explanations.`;

    try {
      const response = await this.makeRequest('chat/completions', {
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }, { timeout: 60000 });

      if (response.choices && response.choices[0]) {
        let content = response.choices[0].message.content;

        // Clean up the response - remove markdown code blocks if present
        content = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

        try {
          return JSON.parse(content);
        } catch (parseError) {
          console.error('Failed to parse AI response:', content);
          throw new Error('Invalid AI response format');
        }
      }

      throw new Error('No response from AI service');
    } catch (error) {
      console.error('AI word analysis error:', error);

      // Prefer a real dictionary entry over a misleading stub when AI is down
      try {
        const dictionary = await this.lookupFreeDictionary(word);
        if (dictionary?.definition) {
          return dictionary;
        }
      } catch (dictError) {
        console.error('Free dictionary fallback failed:', dictError);
      }

      throw createPublicAiError(error);
    }
  }

  /**
   * Public dictionary fallback (no API key). Used when the configured LLM fails.
   * @param {string} word
   * @returns {Promise<object|null>}
   */
  async lookupFreeDictionary(word) {
    const cleaned = String(word || '').trim().toLowerCase();
    if (!cleaned || !/^[a-z][a-z'-]*$/i.test(cleaned)) {
      return null;
    }

    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`;
    const response = await this.httpRequest(url, {
      method: 'GET',
      timeout: 12000,
    });

    if (!response.ok) {
      return null;
    }

    let entries;
    try {
      entries = await response.json();
    } catch (_) {
      return null;
    }

    if (!Array.isArray(entries) || !entries.length) {
      return null;
    }

    return mapFreeDictionaryEntry(entries[0], cleaned);
  }

  /**
   * Analyze a chunk of content and extract vocabulary
   * @private
   */
  async analyzeContentChunk(contentChunk, userCefrLevel, itemsPerChunk, options = {}) {
    const prompt = `You are an experienced English teacher.
My English level: ${userCefrLevel} (CEFR).
Analyze the content below and extract terms or expressions I probably don't know, to help me expand my English vocabulary.

🎯 Extraction Rules
Include: idioms, phrasal verbs, advanced/uncommon vocabulary, cultural references, technical terms
Exclude: proper names (people, places, brands, organizations)

✅ Focus on quality over quantity — include only useful and memorable items.
🪄 Make translations natural in Vietnamese, and sentences practical for memory.
🔤 Use standard British IPA transcription (e.g., /ˈvɒk.jʊ.lə.ri/).

Content to analyze:
"""
${contentChunk}
"""

Return a JSON array of vocabulary items (maximum ${itemsPerChunk} items), each with:
{
  "word": "vocabulary item or phrase",
  "definition": "clear English definition",
  "wordType": "noun/verb/adjective/phrase/idiom/etc",
  "cefrLevel": "estimated CEFR level (A1-C2)",
  "ipaPronunciation": "British IPA pronunciation",
  "exampleSentence": "natural example sentence for memorization",
  "vietnameseTranslation": "natural Vietnamese translation",
  "synonyms": "comma-separated list of synonyms",
  "notes": "usage notes or cultural context if relevant",
  "tags": ["tag1", "tag2"]
}

Provide only valid JSON array without additional text. Focus on words that are challenging but learnable for a ${userCefrLevel} level student.`;

    const response = await this.makeRequest('chat/completions', {
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }, {
      timeout: options.timeout || 120000,
    });

    if (response.choices && response.choices[0]) {
      let content = response.choices[0].message.content;

      // Clean up the response - remove markdown code blocks if present
      content = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

      try {
        const vocabulary = JSON.parse(content);

        // Validate that it's an array
        if (!Array.isArray(vocabulary)) {
          throw new Error('Response is not an array');
        }

        // Validate each item
        const validatedVocabulary = vocabulary
          .map(item => ({
            word: item.word || '',
            definition: item.definition || '',
            wordType: item.wordType || 'unknown',
            cefrLevel: item.cefrLevel || 'B2',
            ipaPronunciation: item.ipaPronunciation || '',
            exampleSentence: item.exampleSentence || '',
            vietnameseTranslation: item.vietnameseTranslation || '',
            synonyms: item.synonyms || '',
            notes: item.notes || '',
            tags: Array.isArray(item.tags) ? item.tags : []
          }))
          .filter(item => item.word && item.definition);

        return validatedVocabulary;
      } catch (parseError) {
        console.error('Failed to parse AI response:', content);
        throw new Error('Invalid AI response format');
      }
    }

    throw new Error('No response from AI service');
  }

  /**
   * Split content into overlapping chunks for analysis
   * @private
   */
  splitContentIntoChunks(content, chunkSize = 7000, overlap = 500) {
    const chunks = [];
    let start = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      let chunk = content.substring(start, end);

      // Try to end at a sentence boundary if possible
      if (end < content.length) {
        const lastPeriod = chunk.lastIndexOf('. ');
        const lastNewline = chunk.lastIndexOf('\n');
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > chunkSize * 0.7) { // Only break if we're past 70% of chunk
          chunk = content.substring(start, start + breakPoint + 1);
        }
      }

      chunks.push(chunk.trim());

      // Move start position with overlap
      start += chunk.length - overlap;

      // Prevent infinite loop if chunk is too small
      if (chunk.length < overlap) {
        start = end;
      }
    }

    return chunks;
  }

  /**
   * Deduplicate vocabulary items based on word (case-insensitive)
   * Keeps the first occurrence of each word
   * @private
   */
  deduplicateVocabulary(vocabularyArray) {
    const seen = new Map();
    const deduplicated = [];

    for (const item of vocabularyArray) {
      const normalizedWord = item.word.toLowerCase().trim();

      if (!seen.has(normalizedWord)) {
        seen.set(normalizedWord, true);
        deduplicated.push(item);
      }
    }

    return deduplicated;
  }

  async analyzeWebsiteContent(content, userCefrLevel = 'B2', options = {}) {
    const {
      limit = 20,
      onProgress = null,
      chunksToProcess = 3,
      offset = 0,
      chunkTimeout = 120000,
    } = options;

    if (!content || typeof content !== 'string') {
      throw new Error('Content must be a non-empty string');
    }

    try {
      const CHUNK_SIZE = 5000; // Characters per chunk (reduced for memory efficiency)
      const OVERLAP = 300; // Overlap to avoid cutting mid-context

      console.log(`📊 Analyzing content: ${content.length} characters (offset: ${offset}, processing ${chunksToProcess} chunks)`);

      // For small content, use single request
      if (content.length <= CHUNK_SIZE) {
        console.log('📝 Content is small, using single-chunk analysis');
        const vocabulary = await this.analyzeContentChunk(content, userCefrLevel, limit, {
          timeout: chunkTimeout,
        });
        return {
          vocabulary: vocabulary.slice(0, limit),
          hasMore: false,
          nextOffset: 0,
          totalChunks: 1,
          processedChunks: 1
        };
      }

      // For large content, use chunked analysis
      console.log('📚 Content is large, using chunked analysis');

      // Calculate number of chunks without creating them all at once
      const totalChunks = Math.ceil(content.length / (CHUNK_SIZE - OVERLAP));
      console.log(`📑 Total chunks: ${totalChunks}, processing chunks ${offset + 1} to ${Math.min(offset + chunksToProcess, totalChunks)}`);

      // Send initial progress if callback provided
      if (onProgress) {
        onProgress({
          type: 'init',
          totalChunks,
          currentChunk: offset,
          percentage: 0
        });
      }

      // Calculate items per chunk
      const itemsPerChunk = Math.ceil(limit / chunksToProcess) + 5; // +5 to account for deduplication

      // Analyze only the requested chunks
      const results = [];
      let start = 0;
      let chunkIndex = 0;
      const startTime = Date.now();

      // Skip to the offset chunk
      for (let i = 0; i < offset; i++) {
        const end = Math.min(start + CHUNK_SIZE, content.length);
        const chunkLength = end - start;
        start += chunkLength - OVERLAP;
      }

      // Process only chunksToProcess chunks starting from offset
      let processedCount = 0;
      while (start < content.length && processedCount < chunksToProcess) {
        chunkIndex = offset + processedCount + 1;
        const end = Math.min(start + CHUNK_SIZE, content.length);
        let chunk = content.substring(start, end);

        // Try to end at a sentence boundary if possible
        if (end < content.length) {
          const lastPeriod = chunk.lastIndexOf('. ');
          const lastNewline = chunk.lastIndexOf('\n');
          const breakPoint = Math.max(lastPeriod, lastNewline);

          if (breakPoint > CHUNK_SIZE * 0.7) {
            chunk = content.substring(start, start + breakPoint + 1);
          }
        }

        console.log(`🔍 Analyzing chunk ${chunkIndex}/${totalChunks} (${chunk.length} chars)`);

        // Calculate estimated time remaining
        let estimatedTimeRemaining = null;
        if (processedCount > 0) {
          const elapsedTime = Date.now() - startTime;
          const avgTimePerChunk = elapsedTime / processedCount;
          const remainingChunksThisBatch = chunksToProcess - processedCount;
          estimatedTimeRemaining = Math.ceil((avgTimePerChunk * remainingChunksThisBatch) / 1000); // in seconds
        }

        // Send progress update
        if (onProgress) {
          onProgress({
            type: 'progress',
            totalChunks,
            currentChunk: chunkIndex,
            percentage: Math.round((processedCount / chunksToProcess) * 100),
            status: `Analyzing chunk ${chunkIndex}/${totalChunks}`,
            estimatedTimeRemaining
          });
        }

        try {
          const chunkResult = await this.analyzeContentChunk(
            chunk.trim(),
            userCefrLevel,
            itemsPerChunk,
            { timeout: chunkTimeout }
          );
          results.push(chunkResult);

          // Add small delay between chunks to avoid rate limiting
          if (processedCount < chunksToProcess - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (chunkError) {
          console.error(`⚠️  Failed to analyze chunk ${chunkIndex}:`, chunkError.message);
          // Continue with other chunks even if one fails
        }

        // Move start position with overlap
        start += CHUNK_SIZE - OVERLAP;
        processedCount++;

        // Explicitly clear chunk reference for GC
        chunk = null;
      }

      console.log(`✅ Batch complete: processed ${processedCount} chunks`);

      // Merge all results
      let allVocabulary = results.flat();
      console.log(`📋 Found ${allVocabulary.length} total items before deduplication`);

      // Deduplicate based on word
      allVocabulary = this.deduplicateVocabulary(allVocabulary);
      console.log(`🎯 ${allVocabulary.length} unique items after deduplication`);

      // Don't slice by limit for incremental loading - return all found vocabulary
      const finalVocabulary = allVocabulary;
      console.log(`✨ Returning ${finalVocabulary.length} vocabulary items`);

      // Calculate next offset and hasMore
      const nextOffset = offset + processedCount;
      const hasMore = nextOffset < totalChunks;

      console.log(`📊 Pagination: offset=${offset}, nextOffset=${nextOffset}, hasMore=${hasMore}, total=${totalChunks}`);

      // Send completion progress
      if (onProgress) {
        onProgress({
          type: 'complete',
          totalChunks,
          currentChunk: nextOffset,
          percentage: 100,
          vocabularyCount: finalVocabulary.length
        });
      }

      return {
        vocabulary: finalVocabulary,
        hasMore,
        nextOffset,
        totalChunks,
        processedChunks: processedCount
      };
    } catch (error) {
      console.error('AI website content analysis error:', error);
      throw new Error(`Website analysis failed: ${error.message}`);
    }
  }

  async analyzeSentence(sentence) {
    if (!sentence || typeof sentence !== 'string') {
      throw new Error('Sentence must be a non-empty string');
    }

    const prompt = `Analyze and score the following English sentence: "${sentence}"

Provide a comprehensive analysis in JSON format:

{
  "sentence": "${sentence}",
  "overallScore": 85,
  "grammar": {
    "score": 90,
    "issues": ["List any grammar issues"],
    "suggestions": ["Suggestions for improvement"]
  },
  "vocabulary": {
    "score": 80,
    "level": "B2",
    "complexWords": ["word1", "word2"],
    "suggestions": ["Vocabulary improvement suggestions"]
  },
  "style": {
    "score": 85,
    "clarity": "Good/Fair/Poor",
    "formality": "Formal/Informal/Neutral",
    "suggestions": ["Style improvement suggestions"]
  },
  "corrections": [
    {
      "original": "original phrase",
      "corrected": "corrected phrase",
      "reason": "explanation"
    }
  ],
  "feedback": "Overall feedback and encouragement"
}

Provide only valid JSON without additional text.`;

    try {
      const response = await this.makeRequest('chat/completions', {
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      });

      if (response.choices && response.choices[0]) {
        let content = response.choices[0].message.content;

        // Clean up the response - remove markdown code blocks if present
        content = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

        try {
          return JSON.parse(content);
        } catch (parseError) {
          console.error('Failed to parse AI response:', content);
          throw new Error('Invalid AI response format');
        }
      }

      throw new Error('No response from AI service');
    } catch (error) {
      console.error('AI sentence analysis error:', error);
      throw new Error('AI service unavailable');
    }
  }

  async chat(message, options = {}) {
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string');
    }

    const systemPrompt = `You are an AI assistant specialized in English language learning. Help users with vocabulary, grammar, pronunciation, and general English language questions. Be encouraging, informative, and provide practical examples.`;

    try {
      const response = await this.makeRequest('chat/completions', {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      });

      if (response.choices && response.choices[0]) {
        return {
          message: response.choices[0].message.content,
          conversationId: options.conversationId || this.generateId(),
          timestamp: new Date().toISOString(),
        };
      }

      throw new Error('No response from AI service');
    } catch (error) {
      console.error('AI chat error:', error);
      throw new Error('AI service unavailable');
    }
  }

  async chatStream(message, options = {}) {
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string');
    }

    const systemPrompt = `You are an AI assistant specialized in English language learning. Help users with vocabulary, grammar, pronunciation, and general English language questions. Be encouraging, informative, and provide practical examples.`;

    const responseId = this.generateId();
    const conversationId = options.conversationId || this.generateId();

    if (options.onChunk) {
      options.onChunk({
        type: 'start',
        responseId,
        conversationId,
      });
    }

    try {
      // Note: This is a simplified streaming implementation
      // In a real implementation, you'd use the streaming endpoints of your AI provider
      const response = await this.makeRequest('chat/completions', {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.8,
        max_tokens: 2000,
        stream: false, // For now, simulate streaming
      });

      if (response.choices && response.choices[0]) {
        const content = response.choices[0].message.content;

        // Simulate streaming by breaking content into chunks
        const words = content.split(' ');
        for (let i = 0; i < words.length; i += 5) {
          const chunk = words.slice(i, i + 5).join(' ');
          if (options.onChunk) {
            options.onChunk({
              type: 'chunk',
              content: chunk + (i + 5 < words.length ? ' ' : ''),
              responseId,
            });
          }
          // Add small delay to simulate real streaming
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      return {
        responseId,
        conversationId,
      };
    } catch (error) {
      console.error('AI chat stream error:', error);
      throw new Error('AI service unavailable');
    }
  }

  async makeRequest(endpoint, data, options = {}) {
    const provider = this.providers[this.config.provider];
    if (!provider) {
      throw new Error(`Unknown AI provider: ${this.config.provider}`);
    }

    const payload = withThinkingDisabled(data);
    const url = `${provider.baseUrl}/${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
    };

    // Add authentication based on provider
    if (
      this.config.provider === 'ollama-cloud' ||
      this.config.provider === 'openai' ||
      this.config.provider === 'opencode' ||
      this.config.provider === 'opencode-go'
    ) {
      if (!this.config.apiKey) {
        throw createPublicAiError(new Error('API key is required for this provider'));
      }
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // Use extended timeout for complex operations like website analysis
    const timeout = options.timeout || 30000;

    const response = await this.httpRequest(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeout,
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`AI service error: ${response.status} ${errorData}`);
    }

    return await response.json();
  }

  async testConnection() {
    try {
      const provider = this.providers[this.config.provider];
      if (!provider) {
        return {
          success: false,
          message: `Unknown provider: ${this.config.provider}`,
        };
      }

      let testEndpoint;
      const headers = {};

      if (this.config.provider === 'ollama-local') {
        testEndpoint = `${provider.baseUrl}/api/tags`;
      } else {
        testEndpoint = `${provider.baseUrl}/models`;
        if (!this.config.apiKey) {
          return {
            success: false,
            message: 'API key is required',
          };
        }
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await this.httpRequest(testEndpoint, {
        headers,
        timeout: 10000,
      });

      if (response.ok) {
        return {
          success: true,
          message: 'Connection successful',
          provider: this.config.provider,
          model: this.config.model,
        };
      } else {
        return {
          success: false,
          message: `Connection failed: ${response.status}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  getConfig() {
    return {
      provider: this.config.provider,
      model: this.config.model,
      available: !!this.config.apiKey || this.config.provider === 'ollama-local',
    };
  }

  async generateBatchQuizQuestions(words) {
    if (!words || !Array.isArray(words) || words.length === 0) {
      throw new Error('Words array must be a non-empty array');
    }

    const prompt = `Generate quiz questions for the following English words. For each word, create exactly ONE quiz question of a randomly chosen type from: fill_blank, definition_choice, synonym_choice, or context_choice.

Words to generate questions for:
${words.map((word, index) => `${index + 1}. "${word.word}"
   - Definition: ${word.definition}
   - Type: ${word.word_type || 'unknown'}
   - Level: ${word.cefr_level || 'B2'}
   - Example: ${word.example_sentence || ''}
   - Vietnamese: ${word.vietnamese_translation || ''}
   - Synonyms: ${word.synonyms || ''}`).join('\n\n')}

For each word, create one quiz question following these guidelines:
- fill_blank: Create a sentence with a blank where the word should go
- definition_choice: Ask "What does [word] mean?" with 4 definition options
- synonym_choice: Ask "Which word is closest in meaning to [word]?" with 4 word options
- context_choice: Ask "In which sentence is [word] used correctly?" with 2 sentence options
- All multiple choice questions should have exactly 4 options (except context_choice which has 2)
- Difficulty should match the word's CEFR level
- Options should be plausible distractors

Return a JSON array with one question per word:
[
  {
    "word_id": "${words[0]?.id || 'word1'}",
    "question_type": "fill_blank|definition_choice|synonym_choice|context_choice",
    "question_text": "Question text here",
    "correct_answer": "Correct answer",
    "options": ["option1", "option2", "option3", "option4"],
    "explanation": "Brief explanation of the correct answer"
  }
]

For fill_blank questions, use empty array for options: "options": []
For context_choice questions, use exactly 2 sentence options: "options": ["correct sentence", "incorrect sentence"]

Provide only valid JSON array without additional text.`;

    try {
      const response = await this.makeRequest('chat/completions', {
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }, {
        timeout: 60000, // 60 seconds timeout for batch processing
      });

      if (response.choices && response.choices[0]) {
        let content = response.choices[0].message.content;

        // Clean up the response - remove markdown code blocks if present
        content = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

        try {
          const questions = JSON.parse(content);

          // Validate that it's an array
          if (!Array.isArray(questions)) {
            throw new Error('Response is not an array');
          }

          // Create a map of word IDs for quick lookup
          const wordMap = new Map(words.map(word => [word.id, word]));

          // Validate and clean up each question
          const validatedQuestions = questions.map((question, index) => {
            // Use word_id from question if provided, otherwise fall back to index mapping
            let word;
            if (question.word_id && wordMap.has(question.word_id)) {
              word = wordMap.get(question.word_id);
            } else {
              word = words[index];
            }

            if (!word) {
              console.warn(`No word found for question at index ${index}, word_id: ${question.word_id}`);
              return null;
            }

            // Map AI response question types to database types
            let questionType = question.question_type || 'definition_choice';
            if (questionType === 'multiple_choice') {
              questionType = 'definition_choice'; // Default fallback
            }

            // Ensure question type is valid
            const validTypes = ['fill_blank', 'definition_choice', 'synonym_choice', 'context_choice'];
            if (!validTypes.includes(questionType)) {
              questionType = 'definition_choice'; // Safe fallback
            }

            return {
              word_id: word.id,
              question_type: questionType,
              question_text: question.question_text || '',
              correct_answer: question.correct_answer || '',
              options: Array.isArray(question.options) ? question.options : [],
              explanation: question.explanation || '',
            };
          }).filter(q => q && q.question_text && q.correct_answer);

          return validatedQuestions;
        } catch (parseError) {
          console.error('Failed to parse AI batch quiz response:', content);
          throw new Error('Invalid AI response format for batch quiz questions');
        }
      }

      throw new Error('No response from AI service');
    } catch (error) {
      console.error('AI batch quiz generation error:', error);
      throw new Error(`Batch quiz generation failed: ${error.message}`);
    }
  }

  /**
   * One AI pass for lesson highlights (and optional chapters).
   */
  async requestLessonHighlights({
    transcript,
    title = '',
    durationSeconds = null,
    needChapters = false,
    timeout = 45000,
  } = {}) {
    const chapterInstructions = needChapters
      ? `Also split the video into 3–8 logical chapters.
Each chapter: { "start": <seconds number>, "title": "<short title>" }
- start must be approximate seconds from the beginning
- cover the whole video in order; first chapter usually starts at 0`
      : `Do NOT invent chapters. Return "chapters": [].`;

    const titleLine = title ? `Video title: ${title}\n` : '';
    const prompt = `${titleLine}Duration (seconds): ${durationSeconds ?? 'unknown'}

Write 5–8 HIGHLIGHT bullets of the video's CONTENT: topics discussed, claims, numbers, decisions, and takeaways.

Hard rules:
- summary must be a single string of markdown bullets, each line starting with "- "
- paraphrase in clear English; NEVER copy captions, greetings, filler (um/uh), or speaker-turn markers (>>)
- do not quote long dialogue
- cover ideas from the whole transcript sample (start, middle, and end), not only the intro
- skip chit-chat about sitting down / introducing the guest unless that is the whole video

${chapterInstructions}

Return ONLY valid JSON:
{
  "summary": "- first highlight\\n- second highlight\\n- third highlight",
  "chapters": [ { "start": 0, "title": "Introduction" } ]
}

Transcript:
"""
${transcript}
"""`;

    const response = await this.makeRequest(
      'chat/completions',
      {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content:
              'You write study notes for English learners. Output valid JSON only. Summaries are paraphrased bullet highlights, never a transcript.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 900,
      },
      { timeout }
    );

    if (!response.choices?.[0]) {
      throw new Error('No response from AI service for summary');
    }

    const content = response.choices[0].message.content;
    try {
      return parseAiJsonObject(content);
    } catch {
      console.error('Failed to parse summary response:', content);
      throw new Error('Invalid AI response format for summary');
    }
  }

  /**
   * Summarize a video transcript and optionally produce chapters.
   * Retries without chapters when the first pass is empty, a dump, or fails.
   */
  async summarizeAndChapter({
    transcript,
    title = '',
    durationSeconds = null,
    existingChapters = null,
    needChapters = true,
    firstTimeout,
    retryTimeout,
    allowRetry = true,
  } = {}) {
    if (!transcript || typeof transcript !== 'string') {
      throw new Error('Transcript must be a non-empty string');
    }

    const maxChars = 14000;
    const truncatedTranscript =
      transcript.length > maxChars
        ? transcript.substring(0, maxChars) + '\n[... transcript continues ...]'
        : transcript;

    const hasExisting =
      Array.isArray(existingChapters) && existingChapters.length > 0;
    const shouldChapter = needChapters && !hasExisting;

    const mapExisting = () =>
      hasExisting
        ? existingChapters.map((ch) => ({
            start: Number(ch.start) || 0,
            end: ch.end != null ? Number(ch.end) : null,
            title: ch.title || 'Chapter',
            source: ch.source || 'youtube',
          }))
        : [];

    const mapAiChapters = (parsed) => {
      if (!shouldChapter || !Array.isArray(parsed?.chapters)) return [];
      return parsed.chapters
        .filter((ch) => ch && (ch.title || ch.start != null))
        .map((ch) => ({
          start: Number(ch.start) || 0,
          end: ch.end != null ? Number(ch.end) : null,
          title: String(ch.title || 'Chapter').trim(),
          source: 'ai',
        }))
        .sort((a, b) => a.start - b.start);
    };

    const pass1Ms = Number(firstTimeout) > 0 ? Number(firstTimeout) : 45000;
    const pass2Ms = Number(retryTimeout) > 0 ? Number(retryTimeout) : 60000;

    let parsed = null;
    let summary = '';
    try {
      parsed = await withTimeout(
        this.requestLessonHighlights({
          transcript: truncatedTranscript,
          title,
          durationSeconds,
          needChapters: shouldChapter,
          timeout: pass1Ms,
        }),
        pass1Ms,
        'highlights-pass-1'
      );
      summary = normalizeLessonSummary(
        extractLessonSummaryRaw(parsed),
        truncatedTranscript
      );
    } catch (err) {
      console.warn('First highlights pass failed:', err.message);
    }

    if (!summary && allowRetry) {
      const retryTranscript =
        truncatedTranscript.length > 8000
          ? truncatedTranscript.slice(0, 8000) + '\n[... transcript continues ...]'
          : truncatedTranscript;
      console.warn('Retrying lesson highlights without chapters');
      try {
        parsed = await withTimeout(
          this.requestLessonHighlights({
            transcript: retryTranscript,
            title,
            durationSeconds,
            needChapters: false,
            timeout: pass2Ms,
          }),
          pass2Ms,
          'highlights-pass-2'
        );
        summary = normalizeLessonSummary(
          extractLessonSummaryRaw(parsed),
          retryTranscript
        );
      } catch (retryErr) {
        console.warn('Retry highlights pass failed:', retryErr.message);
      }
    }

    if (!summary) {
      console.warn('Rejected transcript-like or empty lesson summary');
    }

    const chapters = hasExisting ? mapExisting() : mapAiChapters(parsed);
    return { summary, chapters };
  }

  /**
   * Mixed video quiz: comprehension + vocab-in-context.
   */
  async generateVideoMixedQuiz({
    transcript,
    userCefrLevel = 'B2',
    questionCount = 8,
    vocabularyWords = [],
  } = {}) {
    const maxChars = 15000;
    const truncatedContent =
      transcript.length > maxChars
        ? transcript.substring(0, maxChars) + '\n[... transcript continues ...]'
        : transcript;

    const vocabCount = Math.max(1, Math.floor(questionCount / 2));
    const compCount = Math.max(1, questionCount - vocabCount);
    const vocabList =
      Array.isArray(vocabularyWords) && vocabularyWords.length
        ? vocabularyWords.slice(0, 20).join(', ')
        : '(no specific word list — pick useful words from the transcript)';

    const prompt = `You are an English teacher creating a post-listening quiz.
Student CEFR level: ${userCefrLevel}.

Create exactly ${questionCount} multiple-choice questions from the video transcript:
- ${compCount} of type "comprehension" — main ideas, details, sequence, speaker opinion (NOT dictionary definitions)
- ${vocabCount} of type "vocab" — cloze or meaning-in-context for words from this list when possible: ${vocabList}

Rules:
- Each question: exactly 4 options, one correct
- Include rough timestamp hint when possible
- For vocab items set "targetWord"
- English at ${userCefrLevel} level

Return ONLY a JSON array:
[
  {
    "type": "comprehension" | "vocab",
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctIndex": 0,
    "timestamp": "approx 1:45",
    "explanation": "...",
    "targetWord": "optional-for-vocab"
  }
]

Transcript:
"""
${truncatedContent}
"""`;

    const response = await this.makeRequest('chat/completions', {
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 4000,
    });

    if (!response.choices?.[0]) {
      throw new Error('No response from AI service for video quiz');
    }

    let content_response = response.choices[0].message.content;
    content_response = content_response
      .replace(/```json\s*/g, '')
      .replace(/```\s*$/g, '')
      .trim();

    let questions;
    try {
      questions = JSON.parse(content_response);
    } catch {
      console.error('Failed to parse video quiz response:', content_response);
      throw new Error('Invalid AI response format for quiz');
    }

    if (!Array.isArray(questions)) {
      throw new Error('Quiz response is not an array');
    }

    return questions
      .filter((q) => q.question && Array.isArray(q.options) && q.options.length === 4)
      .map((q, idx) => ({
        id: idx,
        type: q.type === 'vocab' ? 'vocab' : 'comprehension',
        question: q.question,
        options: q.options,
        correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
        timestamp: q.timestamp || null,
        explanation: q.explanation || '',
        targetWord: q.targetWord || null,
      }));
  }

  generateId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

export const aiService = new AIService();