import { GRAMMAR_FIX_VERBATIM_CHAR } from "@shared/sumi/grammar-fix";

const MAX_ATTEMPTS = 2;
const MIN_LENGTH_FOR_SIMILARITY_CHECK = 8;
const MIN_SIMILARITY = 0.45;
const MIN_LENGTH_RATIO = 0.4;
const MAX_LENGTH_RATIO = 2;
const LENGTH_RATIO_SLACK = 20;

const TOKEN_PATTERN = /⟦(\d+)⟧/g;
const HAS_WORDS_PATTERN = /\p{L}/u;

// Everything a grammar pass has no business changing. The model only ever sees
// a token in its place, so these come back byte for byte. Anything shaped like
// a token or a segment tag is masked too, so text can't forge either.
const VERBATIM_PATTERN = new RegExp(
  [
    `${GRAMMAR_FIX_VERBATIM_CHAR}+`,
    "⟦\\d+⟧",
    "^(?:(?:#{1,6}|[-*+]|\\d+[.)]|>)\\s+)+",
    "`+[^`]*`+",
    "\\[\\[[^\\]]*\\]\\]",
    "\\]\\([^)\\s]*\\)",
    "</?[a-z!][^>]*>",
    "\\{\\{.*?\\}\\}",
    "\\$\\{[^}]*\\}",
    "(?:https?://|www\\.)[^\\s<>)\\]]*[^\\s<>)\\].,;:!?'\"]",
    "[\\w.+-]+@[\\w-]+\\.[\\w.-]*\\w",
    "(?<![\\w@])@[\\w./-]*\\w",
    "(?<![\\w/])(?:\\.{0,2}/)?[\\w.-]+(?:/[\\w.-]+)+",
  ].join("|"),
  "gi",
);

interface MaskedSegment {
  leading: string;
  masked: string;
  trailing: string;
  verbatim: string[];
}

export interface GrammarFixGeneration {
  text: string;
  finishReason: string;
}

export class GrammarFixRejectedError extends Error {
  constructor() {
    super("Sumi couldn't safely fix this text, so nothing was changed.");
    this.name = "GrammarFixRejectedError";
  }
}

export function maskSegment(source: string): MaskedSegment {
  const leading = /^\s*/.exec(source)?.[0] ?? "";
  const trailing = source.length > leading.length ? (/\s*$/.exec(source)?.[0] ?? "") : "";
  const core = source.slice(leading.length, source.length - trailing.length);
  const verbatim: string[] = [];
  const masked = core.replace(VERBATIM_PATTERN, (match) => {
    verbatim.push(match);
    return `⟦${verbatim.length}⟧`;
  });

  return { leading, masked, trailing, verbatim };
}

function unmaskSegment(segment: MaskedSegment, corrected: string): string {
  const core = corrected.replace(
    TOKEN_PATTERN,
    (_match, id: string) => segment.verbatim[Number(id) - 1] ?? "",
  );
  return `${segment.leading}${core}${segment.trailing}`;
}

function hasFixableWords(segment: MaskedSegment): boolean {
  return HAS_WORDS_PATTERN.test(segment.masked.replace(TOKEN_PATTERN, ""));
}

export function buildGrammarFixPrompt(masked: readonly string[]): string {
  return masked.map((text, index) => `<segment id="${index + 1}">${text}</segment>`).join("\n");
}

export function parseGrammarFixResponse(response: string): Map<number, string> | null {
  const corrected = new Map<number, string>();
  const withoutThinking = response.replace(/<think>[\s\S]*?<\/think>/gi, "");
  for (const match of withoutThinking.matchAll(/<segment id="(\d+)">([\s\S]*?)<\/segment>/g)) {
    const id = Number(match[1]);
    if (corrected.has(id)) {
      return null;
    }
    corrected.set(id, match[2] ?? "");
  }
  return corrected;
}

/** Sørensen–Dice over character bigrams: typos score high, an unrelated reply scores low. */
export function textSimilarity(first: string, second: string): number {
  const firstBigrams = countBigrams(first);
  const secondBigrams = countBigrams(second);
  let total = 0;
  let shared = 0;
  for (const count of secondBigrams.values()) {
    total += count;
  }
  for (const [bigram, count] of firstBigrams) {
    total += count;
    shared += Math.min(count, secondBigrams.get(bigram) ?? 0);
  }
  return total === 0 ? 1 : (2 * shared) / total;
}

function countBigrams(text: string): Map<string, number> {
  const normalized = Array.from(text.toLowerCase());
  const bigrams = new Map<string, number>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const bigram = `${normalized[index]}${normalized[index + 1]}`;
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
  }
  return bigrams;
}

export function isPlausibleCorrection(source: MaskedSegment, corrected: string): boolean {
  if (corrected.length === 0) {
    return false;
  }

  const expectedTokens = source.masked.match(TOKEN_PATTERN) ?? [];
  const tokens = corrected.match(TOKEN_PATTERN) ?? [];
  if (
    tokens.length !== expectedTokens.length ||
    tokens.some((token, index) => token !== expectedTokens[index])
  ) {
    return false;
  }

  const sourceText = source.masked.replace(TOKEN_PATTERN, "");
  const correctedText = corrected.replace(TOKEN_PATTERN, "");
  if (Array.from(sourceText).length < MIN_LENGTH_FOR_SIMILARITY_CHECK) {
    return true;
  }

  return (
    correctedText.length >= sourceText.length * MIN_LENGTH_RATIO &&
    correctedText.length <= sourceText.length * MAX_LENGTH_RATIO + LENGTH_RATIO_SLACK &&
    textSimilarity(sourceText, correctedText) >= MIN_SIMILARITY
  );
}

/**
 * Models capitalize a selection as if it were a whole sentence, whatever they're
 * told. Mid-sentence, a word that started lowercase stays that way, except "I".
 */
function restoreLowercaseStart(source: string, corrected: string): string {
  const sourceStart = Array.from(source)[0] ?? "";
  const correctedStart = Array.from(corrected)[0] ?? "";
  const isCapitalizedCopy =
    sourceStart !== correctedStart && sourceStart === correctedStart.toLowerCase();
  if (!isCapitalizedCopy || /^I\b/.test(corrected)) {
    return corrected;
  }
  return `${sourceStart}${corrected.slice(correctedStart.length)}`;
}

function applyGeneration(
  sources: readonly MaskedSegment[],
  generation: GrammarFixGeneration,
  startsMidSentence: boolean,
): string[] | null {
  // A cut-off reply can look valid while missing the end of the last segment.
  if (generation.finishReason === "length") {
    return null;
  }

  const parsed = parseGrammarFixResponse(generation.text);
  if (!parsed || parsed.size !== sources.length) {
    return null;
  }

  const corrected: string[] = [];
  for (const [index, source] of sources.entries()) {
    const text = parsed
      .get(index + 1)
      ?.trim()
      .replace(/\s*\n\s*/g, " ");
    if (text === undefined || !isPlausibleCorrection(source, text)) {
      return null;
    }
    const cased =
      startsMidSentence && index === 0 ? restoreLowercaseStart(source.masked, text) : text;
    corrected.push(unmaskSegment(source, cased));
  }
  return corrected;
}

/**
 * Sends only what needs correcting, then accepts the reply only if it passes
 * validation. Replacing text happens without a preview, so a dubious reply has
 * to fail instead of reaching the user's input.
 */
export async function fixGrammarSegments(
  segments: readonly string[],
  generate: (prompt: string) => Promise<GrammarFixGeneration>,
  startsMidSentence = false,
): Promise<string[]> {
  const masked = segments.map(maskSegment);
  const fixableIndexes = masked.flatMap((segment, index) =>
    hasFixableWords(segment) ? [index] : [],
  );
  if (fixableIndexes.length === 0) {
    return [...segments];
  }

  const sources = fixableIndexes.flatMap((index) => masked[index] ?? []);
  const prompt = buildGrammarFixPrompt(sources.map((source) => source.masked));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const corrected = applyGeneration(sources, await generate(prompt), startsMidSentence);
    if (!corrected) {
      continue;
    }

    const result = [...segments];
    for (const [position, index] of fixableIndexes.entries()) {
      result[index] = corrected[position] ?? "";
    }
    return result;
  }

  throw new GrammarFixRejectedError();
}
