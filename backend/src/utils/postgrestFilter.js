/**
 * Helpers for interpolating user input into PostgREST `.or()` / filter strings.
 *
 * PostgREST parses filters with a custom grammar. Unquoted `,` `.` `:` `*`
 * `(` `)` reshape `.or(...)` clauses. PostgreSQL ILIKE also treats `%` and `_`
 * as wildcards. See:
 * https://docs.postgrest.org/en/stable/references/api/url_grammar.html
 */

/**
 * Escape PostgreSQL ILIKE wildcards so the term is matched literally.
 * Backslash is the default LIKE escape character, so it is escaped first.
 */
export function escapeIlikePattern(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Wrap a value in double quotes so PostgREST reserved characters stay literal.
 * Inside quotes, `"` → `\"` and `\` → `\\`.
 */
export function quotePostgrestFilterValue(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export const WORD_SEARCH_COLUMNS = [
  'word',
  'definition',
  'example_sentence',
  'vietnamese_translation',
  'synonyms',
];

/**
 * Build a PostgREST `.or()` string that ILIKE-matches `q` across `columns`.
 * Contains-wildcards (`%term%`) are added around escaped user input; the
 * whole pattern is always quoted so reserved characters cannot split clauses.
 */
export function buildIlikeOrFilter(columns, q) {
  const pattern = quotePostgrestFilterValue(`%${escapeIlikePattern(q)}%`);
  return columns.map((column) => `${column}.ilike.${pattern}`).join(',');
}

export function buildWordSearchOrFilter(q) {
  return buildIlikeOrFilter(WORD_SEARCH_COLUMNS, q);
}
