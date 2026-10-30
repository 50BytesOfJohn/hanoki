/**
 * Forgiving search for short names like model ids: "deepseek 4" finds
 * "DeepSeek V4 Pro", "sonet" finds "Claude Sonnet", and "gpt4o" finds
 * "GPT-4o". Exact and prefix matches rank above loose and misspelled ones.
 *
 * Built for lists of tens of thousands of models: `createSearchIndex` does
 * the string work once per list, and word-level matching (including typos)
 * runs over the distinct words rather than over every item.
 */

export interface SearchField {
  text: string | null | undefined;
  /** How much a match here counts; the name is 1, secondary fields less. */
  weight?: number;
}

export interface SearchSummary {
  score: number;
  /** Every word of the query matched; partial matches rank below these. */
  isComplete: boolean;
}

interface IndexedField {
  text: string;
  weight: number;
  /** Ids into the index's vocabulary; the first is the field's first word. */
  wordIds: Uint32Array;
}

interface IndexedItem {
  fields: IndexedField[];
  compact: string;
}

export interface SearchIndex<T> {
  items: readonly T[];
  /** Scores one query word against every item, aligned with `items`. */
  scoreToken: (token: string, options?: { allowTypos?: boolean }) => Float32Array;
  /**
   * Filters and orders the items by how well they match the query. Ties keep
   * the order from `compareTies`, or the input order without one.
   */
  search: (query: string, compareTies?: (a: T, b: T) => number) => T[];
}

// Dots stay inside a token so "4.5" reads as one version, not "4" and "5".
const QUERY_SEPARATOR = /[\s/\-_:,]+/;
const WORD_SEPARATOR = /[\s/\-_:,.()[\]]+/;
const LETTER_DIGIT_BOUNDARY = /(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/;
const NON_ALPHANUMERIC = /[^a-z0-9]/g;
const NUMERIC = /^[\d.]+$/;
/** Typing a query re-asks for the same words; keep the last few per index. */
const TOKEN_CACHE_SIZE = 32;

export function tokenizeSearchQuery(query: string): string[] {
  return query.toLowerCase().split(QUERY_SEPARATOR).filter(Boolean);
}

export function createSearchIndex<T>(
  items: readonly T[],
  getFields: (item: T) => readonly SearchField[],
): SearchIndex<T> {
  const vocabulary = new Map<string, number>();
  const words: string[] = [];
  const indexed: IndexedItem[] = items.map((item) => {
    const fields: IndexedField[] = [];
    let compactText = "";
    for (const { text, weight = 1 } of getFields(item)) {
      const normalized = text?.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      const fieldWords = normalized.split(WORD_SEPARATOR).filter(Boolean);
      const wordIds = new Uint32Array(fieldWords.length);
      for (const [index, word] of fieldWords.entries()) {
        let id = vocabulary.get(word);
        if (id === undefined) {
          id = words.length;
          vocabulary.set(word, id);
          words.push(word);
        }
        wordIds[index] = id;
      }
      fields.push({ text: normalized, weight, wordIds });
      compactText += normalized.replace(NON_ALPHANUMERIC, "");
    }
    return { fields, compact: compactText };
  });
  // Words further split where letters meet digits: "v4" → "v", "4".
  const wordParts = words.map((word) => word.split(LETTER_DIGIT_BOUNDARY));
  const cache = new Map<string, Float32Array>();

  function scoreToken(token: string, { allowTypos = true } = {}) {
    const cacheKey = `${allowTypos ? "~" : "="}${token}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const { exact, typo } = scoreWords(token, words, wordParts, allowTypos);
    const compactToken = token.replace(NON_ALPHANUMERIC, "");
    const scores = new Float32Array(indexed.length);
    for (let index = 0; index < indexed.length; index += 1) {
      scores[index] = scoreItem(token, compactToken, indexed[index]!, exact, typo);
    }

    if (cache.size >= TOKEN_CACHE_SIZE) {
      cache.delete(cache.keys().next().value!);
    }
    cache.set(cacheKey, scores);
    return scores;
  }

  const index: SearchIndex<T> = {
    items,
    scoreToken,
    search: (query, compareTies) => rankItems(index, query, compareTies),
  };
  return index;
}

/**
 * Folds per-word scores into one. A model missing some query words still
 * shows, below the complete matches, as long as most of the query matched:
 * "deepseek 4" lists DeepSeek V3 after the V4 models, but not GPT-4o.
 */
export function summarizeSearchTokens(
  tokens: readonly string[],
  scores: readonly number[],
): SearchSummary | null {
  let score = 0;
  let matchedLength = 0;
  let totalLength = 0;
  for (const [index, token] of tokens.entries()) {
    const tokenScore = scores[index] ?? 0;
    totalLength += token.length;
    if (tokenScore > 0) {
      score += tokenScore;
      matchedLength += token.length;
    }
  }

  if (score === 0) {
    return null;
  }

  const isComplete = matchedLength === totalLength;
  if (!isComplete && (tokens.length < 2 || matchedLength / totalLength < 0.5)) {
    return null;
  }

  return { score, isComplete };
}

export function compareSearchSummaries(a: SearchSummary, b: SearchSummary): number {
  return Number(b.isComplete) - Number(a.isComplete) || b.score - a.score;
}

function rankItems<T>(
  index: SearchIndex<T>,
  query: string,
  compareTies?: (a: T, b: T) => number,
): T[] {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) {
    return compareTies ? [...index.items].sort(compareTies) : [...index.items];
  }

  const tokenScores = tokens.map((token) => index.scoreToken(token));
  const scores: number[] = Array.from({ length: tokens.length }, () => 0);
  const results: { item: T; summary: SearchSummary; position: number }[] = [];
  for (let position = 0; position < index.items.length; position += 1) {
    for (let token = 0; token < tokens.length; token += 1) {
      scores[token] = tokenScores[token]![position]!;
    }
    const summary = summarizeSearchTokens(tokens, scores);
    if (summary) {
      results.push({ item: index.items[position]!, summary, position });
    }
  }

  return results
    .sort(
      (a, b) =>
        compareSearchSummaries(a.summary, b.summary) ||
        (compareTies?.(a.item, b.item) ?? 0) ||
        a.position - b.position,
    )
    .map((result) => result.item);
}

/** One-off search; build an index instead when the list outlives a keystroke. */
export function fuzzySearch<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => readonly SearchField[],
  compareTies?: (a: T, b: T) => number,
): T[] {
  return createSearchIndex(items, getFields).search(query, compareTies);
}

/**
 * Word-level scores for every distinct word, so 20k models sharing a few
 * thousand words cost a few thousand comparisons, not one per model word.
 */
function scoreWords(
  token: string,
  words: readonly string[],
  wordParts: readonly string[][],
  allowTypos: boolean,
) {
  const exact = new Uint8Array(words.length);
  // Numbers are versions; "4" must never stand in for "5".
  const typoLimit =
    allowTypos && token.length >= 4 && !NUMERIC.test(token) ? (token.length >= 7 ? 2 : 1) : 0;
  const typo = typoLimit > 0 ? new Uint8Array(words.length) : null;

  for (let id = 0; id < words.length; id += 1) {
    const word = words[id]!;
    if (word === token) {
      exact[id] = 10;
    } else if (word.startsWith(token)) {
      exact[id] = 7;
    } else if (wordParts[id]!.some((part) => part.startsWith(token))) {
      // "4" against "v4", "pro" against "4pro".
      exact[id] = 6;
    } else if (typo) {
      typo[id] = scoreTypo(token, word, typoLimit);
    }
  }
  return { exact, typo };
}

function scoreItem(
  token: string,
  compactToken: string,
  item: IndexedItem,
  exact: Uint8Array,
  typo: Uint8Array | null,
): number {
  let best = 0;
  for (const field of item.fields) {
    const { text, wordIds } = field;
    let fieldScore = 0;
    if (text.startsWith(token)) {
      fieldScore = exact[wordIds[0]!] === 10 ? 11 : 9;
    } else {
      for (let index = 0; index < wordIds.length; index += 1) {
        fieldScore = Math.max(fieldScore, exact[wordIds[index]!]!);
      }
      if (fieldScore === 0 && text.includes(token)) {
        fieldScore = 4;
      }
    }
    best = Math.max(best, fieldScore * field.weight);
  }
  if (best > 0) {
    return best;
  }

  // "claude45" against "claude-4.5", "gpt4o" against "GPT-4o".
  if (compactToken.length > 1 && item.compact.includes(compactToken)) {
    return 3;
  }

  if (typo) {
    for (const field of item.fields) {
      for (let index = 0; index < field.wordIds.length; index += 1) {
        best = Math.max(best, typo[field.wordIds[index]!]! * field.weight);
      }
    }
  }
  return best;
}

/** Misspellings of a word, or of the start of one while still typing. */
function scoreTypo(token: string, word: string, limit: number): number {
  if (word.length < token.length - limit) {
    return 0;
  }

  // Compare against the word cut to the token's length (±1 for a dropped or
  // doubled letter), so a half-typed word still counts.
  let best = limit + 1;
  for (let delta = -1; delta <= 1; delta += 1) {
    const length = token.length + delta;
    if (length >= 1 && length <= word.length) {
      best = Math.min(best, editDistance(token, word, length, limit));
    }
  }

  if (best > limit) return 0;
  return best <= 1 ? 2 : 1;
}

// Reused rows for editDistance; tokens and words are short.
let rowA = new Int32Array(64);
let rowB = new Int32Array(64);
let rowC = new Int32Array(64);

/**
 * Edit distance between `a` and the first `bLength` letters of `b`, counting
 * a swap of neighbours as one edit. Gives up past `limit`.
 */
function editDistance(a: string, b: string, bLength: number, limit: number): number {
  if (Math.abs(a.length - bLength) > limit) {
    return limit + 1;
  }
  if (bLength + 1 > rowA.length) {
    rowA = new Int32Array(bLength + 1);
    rowB = new Int32Array(bLength + 1);
    rowC = new Int32Array(bLength + 1);
  }

  let previousPrevious = rowA;
  let previous = rowB;
  let current = rowC;
  for (let j = 0; j <= bLength; j += 1) {
    previous[j] = j;
  }
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= bLength; j += 1) {
      const bj = b.charCodeAt(j - 1);
      let value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (ai === bj ? 0 : 1),
      );
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
        value = Math.min(value, previousPrevious[j - 2]! + 1);
      }
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) {
      return limit + 1;
    }
    const recycled = previousPrevious;
    previousPrevious = previous;
    previous = current;
    current = recycled;
  }
  return previous[bLength]!;
}
