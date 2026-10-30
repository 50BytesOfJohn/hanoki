import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { diffWordsWithSpace } from "diff";
import { GRAMMAR_FIX_VERBATIM_CHAR, endsMidSentence } from "@shared/sumi/grammar-fix";

interface TextblockSegment {
  from: number;
  text: string;
}

interface TextHunk {
  from: number;
  to: number;
  text: string;
}

const HARD_BREAK_NODE = "hardBreak";
const VERBATIM_RUN_PATTERN = new RegExp(`(${GRAMMAR_FIX_VERBATIM_CHAR}+)`);
const FIXABLE_CONTENT_PATTERN = new RegExp(`[^\\s${GRAMMAR_FIX_VERBATIM_CHAR}]`);

export function getTiptapEditorFromElement(element: HTMLElement): Editor | null {
  return (element as HTMLElement & { editor?: Editor }).editor ?? null;
}

/**
 * Each character maps to exactly one document position, with atoms and inline
 * code as verbatim characters, so a corrected string converts straight back
 * to positions. Text is read block by block and code blocks are left out.
 */
export function collectTextblockSegments(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): TextblockSegment[] {
  const segments: TextblockSegment[] = [];
  doc.nodesBetween(from, to, (node, position) => {
    if (node.type.spec.code) {
      return false;
    }
    if (!node.isTextblock) {
      return true;
    }

    const contentStart = position + 1;
    const blockFrom = Math.max(from, contentStart);
    const blockTo = Math.min(to, contentStart + node.content.size);
    let segmentFrom = blockFrom;
    let text = "";
    const finishSegment = () => {
      if (FIXABLE_CONTENT_PATTERN.test(text)) {
        segments.push({ from: segmentFrom, text });
      }
      text = "";
    };

    node.forEach((child, offset) => {
      const childFrom = contentStart + offset;
      const start = Math.max(blockFrom, childFrom);
      const end = Math.min(blockTo, childFrom + child.nodeSize);
      if (start >= end) {
        return;
      }
      // A hard break ends a line, so the words on either side aren't connected.
      if (child.type.name === HARD_BREAK_NODE) {
        finishSegment();
        segmentFrom = end;
        return;
      }
      const isVerbatim = !child.isText || child.marks.some((mark) => mark.type.spec.code);
      text += isVerbatim
        ? GRAMMAR_FIX_VERBATIM_CHAR.repeat(end - start)
        : (child.text ?? "").slice(start - childFrom, end - childFrom);
    });
    finishSegment();
    return false;
  });
  return segments;
}

function diffToHunks(source: string, corrected: string, baseOffset: number): TextHunk[] {
  const hunks: TextHunk[] = [];
  let offset = baseOffset;
  let current: TextHunk | null = null;
  for (const change of diffWordsWithSpace(source, corrected)) {
    if (!change.added && !change.removed) {
      offset += change.value.length;
      current = null;
      continue;
    }
    if (!current) {
      current = { from: offset, to: offset, text: "" };
      hunks.push(current);
    }
    if (change.added) {
      current.text += change.value;
    } else {
      offset += change.value.length;
      current.to = offset;
    }
  }
  return hunks;
}

/** Null if a verbatim run moved or changed, which diffing can't represent safely. */
function segmentToHunks(segment: TextblockSegment, corrected: string): TextHunk[] | null {
  const sourceParts = segment.text.split(VERBATIM_RUN_PATTERN);
  const correctedParts = corrected.split(VERBATIM_RUN_PATTERN);
  if (sourceParts.length !== correctedParts.length) {
    return null;
  }

  const hunks: TextHunk[] = [];
  let offset = segment.from;
  for (const [index, sourcePart] of sourceParts.entries()) {
    const correctedPart = correctedParts[index] ?? "";
    if (index % 2 === 1) {
      if (sourcePart !== correctedPart) {
        return null;
      }
    } else {
      hunks.push(...diffToHunks(sourcePart, correctedPart, offset));
    }
    offset += sourcePart.length;
  }
  return hunks;
}

/**
 * Only changed words are replaced, each taking the marks of what it replaces,
 * so bold, links, and neighbouring atoms stay where they are. Returns false
 * when there's nothing to apply, or when a correction can't be mapped safely.
 */
export function addGrammarCorrections(
  transaction: Transaction,
  segments: readonly TextblockSegment[],
  corrected: readonly string[],
): boolean {
  if (corrected.length !== segments.length) {
    return false;
  }

  const hunks: TextHunk[] = [];
  for (const [index, segment] of segments.entries()) {
    const segmentHunks = segmentToHunks(segment, corrected[index] ?? "");
    if (!segmentHunks) {
      return false;
    }
    hunks.push(...segmentHunks);
  }

  // Back to front, so positions earlier in the document stay valid.
  for (const hunk of hunks.reverse()) {
    if (hunk.text.length === 0) {
      transaction.delete(hunk.from, hunk.to);
      continue;
    }
    const position = transaction.doc.resolve(hunk.from);
    const marks = hunk.from === hunk.to ? position.marks() : (position.nodeAfter?.marks ?? []);
    transaction.replaceWith(hunk.from, hunk.to, transaction.doc.type.schema.text(hunk.text, marks));
  }
  return hunks.length > 0;
}

export function createTiptapGrammarTarget(editor: Editor, selectionOnly: boolean) {
  const initialDoc = editor.state.doc;
  const { from, to } = selectionOnly
    ? editor.state.selection
    : { from: 0, to: initialDoc.content.size };
  const segments = collectTextblockSegments(initialDoc, from, to);
  const start = initialDoc.resolve(segments[0]?.from ?? from);

  return {
    segments: segments.map((segment) => segment.text),
    startsMidSentence: endsMidSentence(
      start.parent
        .textBetween(0, start.parentOffset, undefined, (leaf) =>
          leaf.type.name === HARD_BREAK_NODE ? "\n" : GRAMMAR_FIX_VERBATIM_CHAR,
        )
        .split("\n")
        .at(-1) ?? "",
    ),
    apply(corrected: readonly string[]) {
      if (editor.isDestroyed || !editor.isEditable || !editor.state.doc.eq(initialDoc)) {
        return "stale" as const;
      }

      const transaction = editor.state.tr;
      if (!addGrammarCorrections(transaction, segments, corrected)) {
        return corrected.every((text, index) => text === segments[index]?.text)
          ? ("unchanged" as const)
          : ("failed" as const);
      }

      // Its own undo step, even straight after typing that would otherwise merge with it.
      editor.view.dispatch(closeHistory(transaction));
      return "applied" as const;
    },
  };
}
