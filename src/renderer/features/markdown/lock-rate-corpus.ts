export const VAULT_NOTE_COUNT = 1000;
export const ORDINARY_NOTE_COUNT = 2000;
export const ORDINARY_TRIGGER_COUNT = 1128;

const TRIGGERS = [
  (index: number) => `## Q&A ${index}`,
  (index: number) => `Costs ~$${40 + (index % 7)}`,
  () => "a<b",
  () => "x<y and y>z",
  () => "5 -> 7",
];

export function han11Vault(): string[] {
  const notes: string[] = [];
  for (let index = 0; index < 900; index += 1) {
    notes.push(
      [
        `Note ${index} keeps the plan in [[Topic ${index % 40}]].`,
        "",
        "The rest of the page is ordinary prose, the way an imported vault reads.",
        "",
        "",
        "## Details",
        "",
        `Item ${index} belongs in this section.`,
      ].join("\n"),
    );
  }
  for (let index = 0; index < 100; index += 1) {
    notes.push(
      [
        "---",
        `title: Trip ${index}`,
        "tags: [vault, import]",
        "---",
        "",
        `Pack item ${index}.`,
      ].join("\n"),
    );
  }
  return notes;
}

export function ordinaryNotes(): string[] {
  const notes: string[] = [];
  for (let index = 0; index < ORDINARY_NOTE_COUNT; index += 1) {
    const blocks = [
      `Paragraph ${index} about ordinary writing and the notes beside it.`,
      index % 5 === 0 ? `# Heading ${index}` : `## Section ${index}`,
      index % 4 === 0 ? `- one\n- two\n- three` : `* alpha ${index}\n* beta`,
      index % 3 === 0 ? `+ left\n+ right` : `1. first\n2. second`,
      `- parent ${index}\n  - child\n    - leaf`,
      `> quoted line ${index}`,
      `See [[Note ${index % 20}]] for context.`,
      `Read [docs](https://example.com/${index}).`,
      "```\nconst value = 1;\n```",
      "This is **bold** and __also__.",
      "line one  \nline two",
      `Visit https://example.com/${index} today.`,
    ];
    if (index < ORDINARY_TRIGGER_COUNT) blocks.push(TRIGGERS[index % TRIGGERS.length]!(index));
    if (index % 11 === 0) blocks.push(`Crlf note ${index}\r\n\r\nNext line\r\n`);
    notes.push(blocks.join("\n\n"));
  }
  return notes;
}
