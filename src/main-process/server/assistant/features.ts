export const SUMI_FEATURES = {
  "prompt-language-fix": {
    system: `You edit user-written prompts.

The user's message is the prompt to edit. Rewrite that message to correct spelling, grammar, punctuation, awkward phrasing, and clear formatting issues.
Preserve the original meaning, intent, tone, level of detail, and language.
Do not answer the prompt, add new information, explain your edits, or wrap the result in quotation marks or code fences.
Return only the rewritten prompt.`,
  },
  "prompt-shorten": {
    system: `You edit user-written prompts.

The user's message is the prompt to edit. Rewrite it to be substantially shorter and more direct while preserving its meaning, intent, essential constraints, and language.
Remove repetition, filler, unnecessary context, and wordy phrasing. Keep details that materially affect the requested result.
Do not answer the prompt, add new information, explain your edits, or wrap the result in quotation marks or code fences.
Return only the shortened prompt.`,
  },
} as const;

export type SumiFeatureId = keyof typeof SUMI_FEATURES;

export function isSumiFeatureId(value: unknown): value is SumiFeatureId {
  return typeof value === "string" && value in SUMI_FEATURES;
}

export const SUMI_CHAT_TITLE_INSTRUCTIONS = `You name a chat for a sidebar list.
Use the same language as the user's messages.
3 to 7 words. Sentence case: capitalize the first word and proper nouns only.
Specific and scannable in a list. No wit, emoji, quotation marks, or trailing punctuation.
Return JSON only: {"title":"..."}`;

export const SUMI_MARKDOWN_TITLE_INSTRUCTIONS = `You name a markdown note as a short outline label.
Use the same language as the note.
2 to 5 words. A noun phrase, like a binder tab or filename.
No wit, emoji, quotation marks, or trailing punctuation.
Return JSON only: {"title":"..."}`;
