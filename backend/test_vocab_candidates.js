/**
 * Local Learn vocab candidate ranking (no network).
 * Run: node test_vocab_candidates.js
 */
import {
  lemmaFromToken,
  extractVocabCandidates,
  candidatesToStubVocabulary,
  lemmaLevel,
  vocabWordInTranscript,
  vocabSnapshotGroundedInTranscript,
  vocabSnapshotLooksBroken,
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
assert(lemmaFromToken('pricking') === 'pricking', 'pricking stays pricking (not prick)');
assert(lemmaFromToken('tightening') === 'tightening', 'tightening stays tightening');
assert(lemmaFromToken("won't") !== 'win', "won't must not become win");
assert(
  !extractVocabCandidates("The bubble won't burst today.", { cefr: 'B2', limit: 20 })
    .some((item) => item.word === 'win'),
  "won't in captions must not surface win"
);
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
assert(dalioWords.includes('pricking'), 'Dalio clip keeps pricking');
assert(!dalioWords.includes('prick'), 'Dalio clip must not keep prick from pricking');
assert(!dalioWords.includes('ther'), "Dalio clip must not keep ther from there's");
assert(!dalioWords.includes('bubbl'), 'Dalio clip must not keep bubbl from bubbles');
assert(!dalioWords.includes('there'), 'there remains a function word drop');
assert(dalioWords.length > 0, 'Dalio clip yields candidates');

assert(vocabWordInTranscript('bubble', dalio), 'bubble is in transcript');
assert(!vocabWordInTranscript('ther', dalio), "ther is not a transcript token");
assert(!vocabWordInTranscript('prick', dalio), 'prick is not a transcript token');
assert(vocabWordInTranscript('pricking', dalio), 'pricking is a transcript token');
assert(
  vocabSnapshotLooksBroken(
    [{ word: 'ther' }, { word: 'bubbl' }, { word: 'prick' }],
    dalio
  ),
  'junk snapshot looks like broken stems'
);
assert(
  !vocabSnapshotLooksBroken([{ word: 'bubble' }, { word: 'sovereignty' }], dalio),
  'real snapshot is not broken'
);
assert(
  !vocabSnapshotLooksBroken([{ word: 'payload', definition: 'cargo' }], 'The a an of to and'),
  'AI recall words that are not stems of captions are not treated as broken'
);

const crowdingText = 'Are you concerned that there is a crowding out happening in this market?';
assert(
  extractVocabCandidates(crowdingText, { cefr: 'B2', limit: 20 }).some(
    (item) => item.word === 'crowd out' || item.word === 'crowding'
  ),
  'keeps crowding out / crowding'
);

console.log('test_vocab_candidates: OK');
