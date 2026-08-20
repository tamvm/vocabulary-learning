/**
 * Local Learn vocab candidate ranking (no network).
 * Run: node test_vocab_candidates.js
 */
import {
  lemmaFromToken,
  extractVocabCandidates,
  candidatesToStubVocabulary,
  lemmaLevel,
} from './src/services/vocabCandidates.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(lemmaFromToken('Going') === 'go', 'going → go');
assert(lemmaFromToken("world's") === 'world', 'possessive');
assert(lemmaFromToken('found') === 'find', 'found → find');
assert(lemmaFromToken("there's") === 'there', "there's → there");
assert(lemmaFromToken('bubbles') === 'bubble', 'bubbles → bubble');
assert(lemmaFromToken('always') === 'always', 'always stays always (not alway)');
assert(lemmaFromToken('boxes') === 'box', 'boxes → box');
assert(lemmaFromToken('watches') === 'watch', 'watches → watch');
assert(lemmaLevel('the') === 'A1', 'the is A1');
assert(lemmaLevel('television') === 'B1', 'television is B1');
assert(lemmaLevel('payload') === null, 'off-list has no CEFR');

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

// Bloomberg Ray Dalio / AI bubble short (WZ7mmTrSgxI) — must surface real lemmas, not ther/bubbl.
const dalio = `
there's AI and the desire for AI sovereignty. Debt markets are being flooded with AI.
All great technology changes produce bubbles. And the reason they produce bubbles is
because nobody can get it exactly right. There is a vulnerability and bubbles.
I think it is a bubble that will burst eventually. We can measure a bubble.
There is the pricking of the bubble when wealth must be sold to get the money.
`;
const dalioWords = extractVocabCandidates(dalio, { cefr: 'B2', limit: 36 }).map((item) => item.word);
assert(dalioWords.includes('bubble'), 'Dalio clip keeps bubble');
assert(dalioWords.includes('sovereignty') || dalioWords.includes('vulnerability'), 'Dalio clip keeps topic words');
assert(!dalioWords.includes('ther'), "Dalio clip must not keep ther from there's");
assert(!dalioWords.includes('bubbl'), 'Dalio clip must not keep bubbl from bubbles');
assert(!dalioWords.includes('there'), 'there remains a function word drop');
assert(dalioWords.length > 0, 'Dalio clip yields candidates');

console.log('test_vocab_candidates: OK');
