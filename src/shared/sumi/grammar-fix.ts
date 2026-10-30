/** Stands in for text that must survive verbatim, such as a mention or inline code. */
export const GRAMMAR_FIX_VERBATIM_CHAR = "￼";

export const GRAMMAR_FIX_MAX_CHARS = 20_000;

/** Every entry is one line of text, and the response returns them in the same order. */
export interface GrammarFixSegments {
  segments: string[];
}

export interface GrammarFixRequest extends GrammarFixSegments {
  /** The first segment continues a sentence the model can't see, as a selection often does. */
  startsMidSentence?: boolean;
}

/** Whether a selection placed after this text on the same line begins partway through a sentence. */
export function endsMidSentence(textBefore: string): boolean {
  const trimmed = textBefore.trimEnd();
  return trimmed.length > 0 && !/[.!?:…]$/.test(trimmed);
}
