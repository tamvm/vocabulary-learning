/**
 * Unit tests for PostgREST search-filter escaping (TOM-95).
 * Run: node test_postgrest_filter.js
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  escapeIlikePattern,
  quotePostgrestFilterValue,
  buildIlikeOrFilter,
  buildWordSearchOrFilter,
  WORD_SEARCH_COLUMNS,
} from './src/utils/postgrestFilter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let failed = 0;

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
    return;
  }
  console.log(`PASS: ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    return;
  }
  console.log(`PASS: ${message}`);
}

/**
 * Split a PostgREST `.or()` string on commas that are not inside quotes.
 * Backslash escapes inside quotes are respected.
 */
function splitOrClauses(filter) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;

  for (const ch of filter) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (inQuotes && ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

console.log('Testing PostgREST word-search filter escaping\n');

assertEqual(escapeIlikePattern('hello'), 'hello', 'plain text is unchanged');
assertEqual(escapeIlikePattern('100%'), '100\\%', 'percent wildcard is escaped');
assertEqual(escapeIlikePattern('a_b'), 'a\\_b', 'underscore wildcard is escaped');
assertEqual(escapeIlikePattern('a\\b'), 'a\\\\b', 'backslash is escaped first');
assertEqual(escapeIlikePattern('%_\\'), '\\%\\_\\\\', 'combined LIKE specials are escaped');

assertEqual(
  quotePostgrestFilterValue('hello'),
  '"hello"',
  'plain values are quoted'
);
assertEqual(
  quotePostgrestFilterValue('foo,bar'),
  '"foo,bar"',
  'commas stay inside quotes'
);
assertEqual(
  quotePostgrestFilterValue('say "hi"'),
  '"say \\"hi\\""',
  'double quotes are backslash-escaped'
);
assertEqual(
  quotePostgrestFilterValue('a\\b'),
  '"a\\\\b"',
  'backslashes are doubled inside quotes'
);

const plain = buildWordSearchOrFilter('serendipity');
assertEqual(
  plain,
  'word.ilike."%serendipity%",definition.ilike."%serendipity%",example_sentence.ilike."%serendipity%",vietnamese_translation.ilike."%serendipity%",synonyms.ilike."%serendipity%"',
  'plain search quotes the contains pattern on every column'
);
assertEqual(
  splitOrClauses(plain).length,
  WORD_SEARCH_COLUMNS.length,
  'plain search has one clause per column'
);

const commaQ = 'foo,bar';
const commaFilter = buildWordSearchOrFilter(commaQ);
assert(
  commaFilter.includes('ilike."%foo,bar%"'),
  'comma in q stays inside the quoted ILIKE pattern'
);
assertEqual(
  splitOrClauses(commaFilter).length,
  WORD_SEARCH_COLUMNS.length,
  'comma in q does not add extra OR clauses'
);
assert(
  !commaFilter.includes('ilike.%foo,bar%'),
  'comma in q is not interpolated unquoted'
);

const injection = 'x),id.neq.0,word.ilike.%';
const injectionFilter = buildWordSearchOrFilter(injection);
const injectionPattern = quotePostgrestFilterValue(`%${escapeIlikePattern(injection)}%`);
assertEqual(
  splitOrClauses(injectionFilter).length,
  WORD_SEARCH_COLUMNS.length,
  'parens/commas in q cannot close or reshape .or()'
);
assertEqual(
  injectionPattern,
  '"%x),id.neq.0,word.ilike.\\\\%%"',
  'injection payload is quoted and LIKE-escaped as a single pattern'
);
assert(
  injectionFilter.startsWith(`word.ilike.${injectionPattern},`),
  'injection pattern is used as the ILIKE value, not extra OR clauses'
);

const dotFilter = buildWordSearchOrFilter('hello.world');
assert(
  dotFilter.includes('ilike."%hello.world%"'),
  'dots in q stay inside the quoted pattern'
);
assertEqual(
  splitOrClauses(dotFilter).length,
  WORD_SEARCH_COLUMNS.length,
  'dots in q do not split column.op.value'
);

const wildcardFilter = buildWordSearchOrFilter('100%_off');
assert(
  wildcardFilter.includes('ilike."%100\\%\\_off%"') ||
    wildcardFilter.includes('ilike."%100\\\\%\\\\_off%"'),
  'user % and _ are escaped before quoting'
);
assert(
  !wildcardFilter.includes('ilike."%100%_off%"'),
  'user % and _ are not left as ILIKE wildcards'
);

const starFilter = buildWordSearchOrFilter('a*b');
assert(
  starFilter.includes('ilike."%a*b%"'),
  'asterisk is quoted so it cannot act as a PostgREST reserved token'
);

const custom = buildIlikeOrFilter(['title', 'body'], 'a,b');
assertEqual(
  custom,
  'title.ilike."%a,b%",body.ilike."%a,b%"',
  'buildIlikeOrFilter works for arbitrary columns'
);

const wordsSrc = readFileSync(join(__dirname, 'src/routes/words.js'), 'utf8');
const helperUses = wordsSrc.split('buildWordSearchOrFilter(q)').length - 1;
assertEqual(
  helperUses,
  2,
  'words.js applies the helper to both list and count queries'
);
assert(
  !wordsSrc.includes('word.ilike.%${q}%'),
  'words.js no longer interpolates raw q into .or()'
);

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log('\nAll postgrest filter tests passed');
