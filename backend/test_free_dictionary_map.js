/**
 * Unit tests for Free Dictionary → word-analysis mapping.
 * Run: node backend/test_free_dictionary_map.js
 */
import { mapFreeDictionaryEntry } from './src/services/aiService.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const sample = {
  word: 'prosaic',
  phonetic: '/prəˈzeɪ.ɪk/',
  phonetics: [{ text: '/prəˈzeɪ.ɪk/' }],
  meanings: [
    {
      partOfSpeech: 'adjective',
      synonyms: ['ordinary', 'mundane'],
      definitions: [
        {
          definition: 'Having the style or diction of prose; lacking poetic beauty.',
          example: 'Prosaic language can still be powerful.',
          synonyms: ['dull'],
        },
      ],
    },
  ],
};

const mapped = mapFreeDictionaryEntry(sample, 'prosaic');
assert(mapped, 'maps sample entry');
assert(mapped.word === 'prosaic', 'word');
assert(mapped.wordType === 'adjective', 'wordType');
assert(mapped.definition.includes('prose'), 'definition');
assert(mapped.exampleSentence.includes('Prosaic'), 'example');
assert(mapped.ipaPronunciation === 'prəˈzeɪ.ɪk', 'ipa strips slashes');
assert(mapped.synonyms.includes('ordinary'), 'synonyms');
assert(mapped.source === 'dictionary', 'source tag');
assert(mapFreeDictionaryEntry(null) === null, 'null entry');
assert(mapFreeDictionaryEntry({ meanings: [] }) === null, 'empty meanings');

console.log('All free dictionary map tests passed');
