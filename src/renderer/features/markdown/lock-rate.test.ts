import { describe, expect, it } from "vitest";

import {
  han11Vault,
  ORDINARY_NOTE_COUNT,
  ORDINARY_TRIGGER_COUNT,
  ordinaryNotes,
  VAULT_NOTE_COUNT,
} from "./lock-rate-corpus";
import { inspectRichTextLegacy } from "./rich-text-safety.legacy";
import { inspectRichText } from "./rich-text-safety";

describe("rich text lock rate", () => {
  it("prints the #55 canonicalizer against the parsed check", () => {
    const vault = han11Vault();
    const ordinary = ordinaryNotes();
    expect(vault).toHaveLength(VAULT_NOTE_COUNT);
    expect(ordinary).toHaveLength(ORDINARY_NOTE_COUNT);

    const vaultBefore = lockedCount(vault, inspectRichTextLegacy);
    const vaultAfter = lockedCount(vault, inspectRichText);
    const ordinaryBefore = lockedCount(ordinary, inspectRichTextLegacy);
    const ordinaryAfter = lockedCount(ordinary, inspectRichText);

    console.log(
      `lock-rate vault before ${formatRate(vaultBefore, vault.length)} after ${formatRate(vaultAfter, vault.length)}`,
    );
    console.log(
      `lock-rate ordinary before ${formatRate(ordinaryBefore, ordinary.length)} after ${formatRate(ordinaryAfter, ordinary.length)}`,
    );
    if (ordinaryAfter > 0) {
      const sample = ordinary.find((note) => inspectRichText(note).losesContent);
      console.log("ordinary still locked sample:", sample?.slice(0, 240));
    }

    expect(vaultBefore).toBe(vault.length);
    expect(vaultAfter).toBe(0);
    expect(ordinaryBefore).toBe(ORDINARY_TRIGGER_COUNT);
    expect(ordinaryAfter).toBe(0);
  }, 120_000);
});

function lockedCount(
  notes: string[],
  inspect: (markdown: string) => { losesContent: boolean },
): number {
  let locked = 0;
  for (const note of notes) {
    if (inspect(note).losesContent) locked += 1;
  }
  return locked;
}

function formatRate(locked: number, total: number): string {
  const percent = ((locked / total) * 100).toFixed(1);
  return `${locked}/${total} (${percent}%)`;
}
