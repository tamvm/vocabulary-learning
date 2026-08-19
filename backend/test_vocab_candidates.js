/**
 * Local Learn vocab candidate ranking (no network).
 * Run: node test_vocab_candidates.js
 */
import {
  lemmaFromToken,
  extractVocabCandidates,
  candidatesToStubVocabulary,
  rankToLevel,
  commonRank,
} from './src/services/vocabCandidates.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(lemmaFromToken('Going') === 'go', 'going → go');
assert(lemmaFromToken("world's") === 'world', 'possessive');
assert(lemmaFromToken('found') === 'find', 'found → find');
assert(commonRank('the') === 1, 'the is rank 1');
assert(rankToLevel(1) === 'A1', 'top ranks are A1');
assert(rankToLevel(0) === null, 'unknown has no CEFR');

const transcript = `
Hello and thank you so much for joining me today. I think this is really very nice.
We need to figure out the payload to orbit and the heat shield ablation.
Starship will do a rapid reuse after the booster catch. Regulatory approval is a bottleneck.
We figure out the payload again because the payload matters for Mars colonization.
`;

const cues = [
  { text: 'We need to figure out the payload to orbit' },
  { text: 'Starship will do a rapid reuse after the booster catch' },
];

const found = extractVocabCandidates(transcript, { cefr: 'B1', cues, limit: 20 });
const words = found.map((item) => item.word);

assert(words.includes('figure out'), 'keeps phrasal verb');
assert(words.includes('payload'), 'keeps off-list topic word');
assert(!words.includes('the'), 'drops function words');
assert(!words.includes('thank'), 'drops below-level common verbs');
assert(
  found.find((item) => item.word === 'payload')?.context.includes('payload'),
  'attaches cue context'
);

const excluded = extractVocabCandidates(transcript, {
  cefr: 'B1',
  excludeWords: ['payload'],
  limit: 20,
});
assert(!excluded.some((item) => item.word === 'payload'), 'excludeWords drops known lemma');

const stubs = candidatesToStubVocabulary(found);
assert(stubs[0].definition.includes('video') || stubs[0].definition.includes('From'), 'stub definition');
assert(stubs.length === found.length, 'stub count matches');

const easy = extractVocabCandidates(
  'The cat sat on the mat and the dog sat on the mat too.',
  { cefr: 'B2', limit: 20 }
);
assert(easy.length < 5, 'simple A1 text yields few B2 candidates');

console.log('test_vocab_candidates: OK');
