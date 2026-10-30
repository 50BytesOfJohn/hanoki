import { endsMidSentence } from "@shared/sumi/grammar-fix";

export type TextControlElement = HTMLInputElement | HTMLTextAreaElement;

const FENCE_PATTERN = /^\s*(?:```|~~~)/;
const HIGH_SURROGATE = /[\uD800-\uDBFF]$/;
const LOW_SURROGATE = /^[\uDC00-\uDFFF]/;

/** Fields like passwords, URLs, and searches aren't prose, and may hold secrets. */
export function isGrammarFixableTextControl(control: TextControlElement): boolean {
  if (control.readOnly || control.disabled || !control.spellcheck) {
    return false;
  }
  if (control instanceof HTMLTextAreaElement) {
    return true;
  }
  return control.type === "text" && control.getAttribute("role") !== "combobox";
}

/** The indexes of lines worth correcting: not blank, and not inside a code fence. */
export function findFixableLines(lines: readonly string[]): number[] {
  const fixable: number[] = [];
  let insideFence = false;
  for (const [index, line] of lines.entries()) {
    if (FENCE_PATTERN.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (!insideFence && line.trim().length > 0) {
      fixable.push(index);
    }
  }
  return fixable;
}

/** The smallest range that differs, without splitting a surrogate pair. */
export function findChangedRange(
  source: string,
  next: string,
): { start: number; sourceEnd: number; nextEnd: number } {
  const maxShared = Math.min(source.length, next.length);
  let start = 0;
  while (start < maxShared && source[start] === next[start]) {
    start += 1;
  }
  if (HIGH_SURROGATE.test(source.slice(0, start))) {
    start -= 1;
  }

  let suffix = 0;
  while (
    suffix < maxShared - start &&
    source[source.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  if (LOW_SURROGATE.test(source.slice(source.length - suffix))) {
    suffix -= 1;
  }

  return { start, sourceEnd: source.length - suffix, nextEnd: next.length - suffix };
}

function moveOffset(
  offset: number,
  range: { sourceEnd: number; nextEnd: number; start: number },
): number {
  if (offset <= range.start) {
    return offset;
  }
  return offset >= range.sourceEnd ? offset + range.nextEnd - range.sourceEnd : range.nextEnd;
}

/**
 * Edits through the browser's own editing command, which is what keeps the
 * change on the field's native undo stack and fires a normal input event for
 * React. Assigning `value` would wipe that stack, and no non-deprecated API can
 * replace this. Cursor and selection are set after, leaving undo unaffected.
 */
function replaceTextUndoably(control: TextControlElement, from: number, to: number, text: string) {
  const previousFocus = document.activeElement;
  control.focus({ preventScroll: true });
  control.setSelectionRange(from, to);
  const didEdit =
    text.length > 0
      ? document.execCommand("insertText", false, text)
      : document.execCommand("delete");
  if (previousFocus instanceof HTMLElement && previousFocus !== control) {
    previousFocus.focus({ preventScroll: true });
  }
  return didEdit;
}

export function createTextControlGrammarTarget(
  control: TextControlElement,
  selectionOnly: boolean,
) {
  const initialValue = control.value;
  const start = selectionOnly ? (control.selectionStart ?? 0) : 0;
  const end = selectionOnly ? (control.selectionEnd ?? initialValue.length) : initialValue.length;
  const lines = initialValue.slice(start, end).split("\n");
  const fixableLines = findFixableLines(lines);

  return {
    segments: fixableLines.flatMap((index) => lines[index] ?? []),
    startsMidSentence:
      fixableLines[0] === 0 &&
      endsMidSentence(initialValue.slice(0, start).split("\n").at(-1) ?? ""),
    apply(corrected: readonly string[]) {
      if (
        !control.isConnected ||
        !isGrammarFixableTextControl(control) ||
        control.value !== initialValue
      ) {
        return "stale" as const;
      }

      const nextLines = [...lines];
      for (const [position, index] of fixableLines.entries()) {
        nextLines[index] = corrected[position] ?? "";
      }
      const source = lines.join("\n");
      const next = nextLines.join("\n");
      if (next === source) {
        return "unchanged" as const;
      }

      const caretStart = control.selectionStart;
      const caretEnd = control.selectionEnd;
      const range = findChangedRange(source, next);
      const inserted = next.slice(range.start, range.nextEnd);
      if (!replaceTextUndoably(control, start + range.start, start + range.sourceEnd, inserted)) {
        return "failed" as const;
      }

      if (selectionOnly) {
        control.setSelectionRange(start, start + next.length);
      } else if (caretStart !== null && caretEnd !== null) {
        control.setSelectionRange(moveOffset(caretStart, range), moveOffset(caretEnd, range));
      }
      return "applied" as const;
    },
  };
}
