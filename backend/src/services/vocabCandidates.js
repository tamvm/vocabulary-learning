/**
 * Local Learn vocab discovery: scan the full transcript, drop function /
 * below-CEFR lemmas, keep topic words + common phrasal verbs, rank, attach
 * one cue sentence. AI only fills definitions afterwards.
 *
 * commonLemmas.json ranks: first 2500 of google-10000-english (MIT,
 * first20hours). Rank 1–800 ≈ A1, 801–1600 ≈ A2, 1601–2500 ≈ B1.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../data');
const COMMON_RANKS = JSON.parse(readFileSync(join(dataDir, 'commonLemmas.json'), 'utf8'));
const PHRASAL_LIST = JSON.parse(readFileSync(join(dataDir, 'phrasalVerbs.json'), 'utf8'));

const LEVEL_RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'so', 'as', 'at', 'by', 'for',
  'from', 'in', 'into', 'of', 'off', 'on', 'onto', 'out', 'over', 'to', 'up',
  'with', 'without', 'about', 'above', 'after', 'again', 'against', 'along',
  'among', 'around', 'before', 'behind', 'below', 'beneath', 'beside',
  'between', 'beyond', 'during', 'except', 'inside', 'near', 'since',
  'through', 'throughout', 'toward', 'towards', 'under', 'until', 'upon',
  'via', 'within', 'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our',
  'ours', 'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
  'it', 'its', 'they', 'them', 'their', 'theirs', 'this', 'that', 'these',
  'those', 'who', 'whom', 'whose', 'which', 'what', 'where', 'when', 'why',
  'how', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'do',
  'does', 'did', 'done', 'have', 'has', 'had', 'having', 'will', 'would',
  'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'need',
  'not', 'no', 'nor', 'yes', 'ok', 'okay', 'oh', 'ah', 'um', 'uh', 'erm',
  'yeah', 'yep', 'yup', 'nah', 'mm', 'hmm', 'huh', 'just', 'also', 'too',
  'very', 'really', 'quite', 'rather', 'such', 'than', 'then', 'there',
  'here', 'once', 'twice', 'all', 'any', 'each', 'every', 'few', 'more',
  'most', 'other', 'some', 'both', 'either', 'neither', 'own', 'same',
  'several', 'lot', 'lots', 'one', 'two', 'three', 'four', 'five',
  'mr', 'mrs', 'ms', 'dr',
]);

const IRREGULAR = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', having: 'have',
  does: 'do', did: 'do', done: 'do', doing: 'do',
  goes: 'go', went: 'go', gone: 'go', going: 'go',
  says: 'say', said: 'say',
  makes: 'make', made: 'make',
  takes: 'take', took: 'take', taken: 'take',
  comes: 'come', came: 'come',
  knows: 'know', knew: 'know', known: 'know',
  thinks: 'think', thought: 'think',
  sees: 'see', saw: 'see', seen: 'see',
  gets: 'get', got: 'get', gotten: 'get',
  gives: 'give', gave: 'give', given: 'give',
  finds: 'find', found: 'find',
  tells: 'tell', told: 'tell',
  becomes: 'become', became: 'become',
  leaves: 'leave', left: 'leave',
  feels: 'feel', felt: 'feel',
  puts: 'put',
  means: 'mean', meant: 'mean',
  keeps: 'keep', kept: 'keep',
  lets: 'let',
  begins: 'begin', began: 'begin', begun: 'begin',
  shows: 'show', showed: 'show', shown: 'show',
  hears: 'hear', heard: 'hear',
  plays: 'play', played: 'play',
  runs: 'run', ran: 'run',
  moves: 'move', moved: 'move',
  lives: 'live', lived: 'live',
  believes: 'believe', believed: 'believe',
  brings: 'bring', brought: 'bring',
  happens: 'happen', happened: 'happen',
  writes: 'write', wrote: 'write', written: 'write',
  sits: 'sit', sat: 'sit',
  stands: 'stand', stood: 'stand',
  loses: 'lose', lost: 'lose',
  pays: 'pay', paid: 'pay',
  meets: 'meet', met: 'meet',
  includes: 'include', included: 'include',
  continues: 'continue', continued: 'continue',
  sets: 'set',
  learns: 'learn', learned: 'learn', learnt: 'learn',
  changes: 'change', changed: 'change',
  leads: 'lead', led: 'lead',
  understands: 'understand', understood: 'understand',
  watches: 'watch', watched: 'watch',
  follows: 'follow', followed: 'follow',
  stops: 'stop', stopped: 'stop',
  creates: 'create', created: 'create',
  speaks: 'speak', spoke: 'speak', spoken: 'speak',
  reads: 'read',
  spends: 'spend', spent: 'spend',
  grows: 'grow', grew: 'grow', grown: 'grow',
  opens: 'open', opened: 'open',
  walks: 'walk', walked: 'walk',
  wins: 'win', won: 'win',
  teaches: 'teach', taught: 'teach',
  offers: 'offer', offered: 'offer',
  remembers: 'remember', remembered: 'remember',
  considers: 'consider', considered: 'consider',
  appears: 'appear', appeared: 'appear',
  buys: 'buy', bought: 'buy',
  serves: 'serve', served: 'serve',
  dies: 'die', died: 'die',
  sends: 'send', sent: 'send',
  builds: 'build', built: 'build',
  stays: 'stay', stayed: 'stay',
  falls: 'fall', fell: 'fall', fallen: 'fall',
  cuts: 'cut',
  reaches: 'reach', reached: 'reach',
  kills: 'kill', killed: 'kill',
  remains: 'remain', remained: 'remain',
};

const PHRASAL_BY_LENGTH = [...PHRASAL_LIST]
  .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);

export function lemmaFromToken(raw) {
  let w = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z'-]/g, '')
    .replace(/'/g, '');
  if (!w) return '';
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ing') && w.length > 5) {
    const stem = w.slice(0, -3);
    if (stem.length >= 3 && stem.at(-1) === stem.at(-2)) return stem.slice(0, -1);
    return stem;
  }
  if (w.endsWith('ed') && w.length > 4) {
    const stem = w.slice(0, -2);
    if (stem.endsWith('i')) return `${stem.slice(0, -1)}y`;
    return stem;
  }
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function commonRank(lemma) {
  return COMMON_RANKS[lemma] || 0;
}

export function rankToLevel(rank) {
  if (!rank) return null;
  if (rank <= 800) return 'A1';
  if (rank <= 1600) return 'A2';
  if (rank <= 2500) return 'B1';
  return null;
}

function userLevelRank(cefr) {
  return LEVEL_RANK[String(cefr || 'B2').toUpperCase()] || 4;
}

function tokenize(text) {
  return String(text || '')
    .replace(/>>/g, ' ')
    .split(/[^A-Za-z']+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function contextFor(term, cues, text) {
  const needle = String(term || '').toLowerCase();
  if (!needle) return '';
  for (const cue of cues || []) {
    const line = String(cue.text || '').replace(/\s+/g, ' ').trim();
    if (line.toLowerCase().includes(needle)) {
      return line.length > 180 ? `${line.slice(0, 177)}…` : line;
    }
  }
  const hay = String(text || '');
  const idx = hay.toLowerCase().indexOf(needle);
  if (idx < 0) return '';
  const start = Math.max(0, idx - 60);
  const end = Math.min(hay.length, idx + needle.length + 80);
  return hay.slice(start, end).replace(/\s+/g, ' ').trim();
}

function shouldDropLemma(lemma, cefr, exclude) {
  if (!lemma || lemma.length < 3) return true;
  if (FUNCTION_WORDS.has(lemma)) return true;
  if (exclude.has(lemma)) return true;
  const level = rankToLevel(commonRank(lemma));
  if (!level) return false;
  return LEVEL_RANK[level] < userLevelRank(cefr);
}

/**
 * @param {string} text
 * @param {{ cues?: Array<{text?: string}>, cefr?: string, excludeWords?: string[], limit?: number }} [options]
 */
export function extractVocabCandidates(text, options = {}) {
  const cefr = options.cefr || 'B2';
  const limit = Math.max(8, Math.min(Number(options.limit) || 36, 48));
  const exclude = new Set(
    (options.excludeWords || []).map((w) => lemmaFromToken(w)).filter(Boolean)
  );
  const cues = Array.isArray(options.cues) ? options.cues : [];
  const tokens = tokenize(text);
  const lemmas = tokens.map((t) => lemmaFromToken(t));

  const counts = new Map();
  const kinds = new Map();

  const bump = (key, kind) => {
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!kinds.has(key)) kinds.set(key, kind);
  };

  for (let i = 0; i < lemmas.length; i++) {
    let matchedPhrase = '';
    for (const phrase of PHRASAL_BY_LENGTH) {
      const parts = phrase.split(/\s+/);
      const slice = lemmas.slice(i, i + parts.length);
      if (slice.length === parts.length && slice.every((part, idx) => part === parts[idx])) {
        matchedPhrase = phrase;
        break;
      }
    }
    if (matchedPhrase) {
      bump(matchedPhrase, 'phrase');
      continue;
    }
    const lemma = lemmas[i];
    if (shouldDropLemma(lemma, cefr, exclude)) continue;
    bump(lemma, 'word');
  }

  const scored = [];
  for (const [word, count] of counts) {
    if (kinds.get(word) === 'word' && count === 1 && word.length <= 4) continue;
    const rank = word.includes(' ') ? 0 : commonRank(word);
    const level = rankToLevel(rank);
    const rarity = word.includes(' ') ? 4 : level ? Math.max(1, userLevelRank(cefr) - LEVEL_RANK[level] + 1) : 3;
    const lengthBonus = word.length >= 8 ? 1.2 : 1;
    scored.push({
      word,
      count,
      level: level || '',
      score: count * rarity * lengthBonus,
      context: contextFor(word, cues, text),
    });
  }

  scored.sort((a, b) => b.score - a.score || b.count - a.count || a.word.localeCompare(b.word));
  return scored.slice(0, limit);
}

export function candidatesToStubVocabulary(candidates) {
  return (candidates || []).map((item) => ({
    word: item.word,
    definition: item.context
      ? `From the video: “${item.context}”`
      : `Used in this video: "${item.word}"`,
    wordType: item.word.includes(' ') ? 'phrase' : 'unknown',
    cefrLevel: item.level || '',
    ipaPronunciation: '',
    exampleSentence: item.context || '',
    vietnameseTranslation: '',
    synonyms: '',
    notes: 'Auto-picked from the transcript; definition pending polish',
    tags: ['candidate'],
  }));
}
