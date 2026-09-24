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

const TITLE_SHAPE = `Use the same language as the content.
Prefer 4 to 8 words and stay under 60 characters.
Specific and scannable, not clever or poetic.
Do not use quotation marks, markdown, labels, emojis, or ending punctuation.
Return only the title.`;

export const SUMI_CHAT_TITLE_INSTRUCTIONS = `You name a writing chat for a sidebar.
The title answers what the conversation is for: intent plus a distinctive name.
Examples: "Ch3 ending — bridge collapse", "RP: Kael meets the archivist", "Tone pass on prologue".
Never start with Chat, Discussion, Help, Hello, or Notes.
${TITLE_SHAPE}`;

export const SUMI_MARKDOWN_TITLE_INSTRUCTIONS = `You name a markdown note in a writer's outline.
The title is a place in the work, like a binder label.
Examples: "Ch 03 — The Bridge", "Kael — voice and tells", "World — magic costs".
If a heading is present, prefer it unless it is generic.
When sibling titles are listed, match their naming pattern.
${TITLE_SHAPE}`;
