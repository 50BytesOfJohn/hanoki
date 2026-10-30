import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { HanokiMention } from "@shared/tiptap/extensions";
import { addGrammarCorrections, collectTextblockSegments } from "./grammar-fix-tiptap";

const schema = getSchema([StarterKit, HanokiMention]);
const verbatim = "￼";

function stateFrom(content: unknown[]) {
  return EditorState.create({ doc: schema.nodeFromJSON({ type: "doc", content }) });
}

function paragraph(...content: unknown[]) {
  return { type: "paragraph", content };
}

function text(value: string, ...marks: string[]) {
  return marks.length > 0
    ? { type: "text", text: value, marks: marks.map((type) => ({ type })) }
    : { type: "text", text: value };
}

function applyCorrections(state: EditorState, from: number, to: number, corrected: string[]) {
  const tr = state.tr;
  const changed = addGrammarCorrections(
    tr,
    collectTextblockSegments(state.doc, from, to),
    corrected,
  );
  return { changed, doc: tr.doc, tr };
}

describe("collectTextblockSegments", () => {
  const state = stateFrom([
    paragraph(
      text("teh "),
      { type: "mention", attrs: { id: "web", label: "Web" } },
      text(" and "),
      text("code", "code"),
    ),
    { type: "codeBlock", content: [text("teh code")] },
    { type: "paragraph" },
    { type: "heading", attrs: { level: 1 }, content: [text("teh title")] },
  ]);

  it("reads text blocks, marking atoms and code verbatim and skipping code blocks", () => {
    const segments = collectTextblockSegments(state.doc, 0, state.doc.content.size);

    expect(segments.map((segment) => segment.text)).toEqual([
      `teh ${verbatim} and ${verbatim.repeat(4)}`,
      "teh title",
    ]);
  });

  it("maps every character to one document position", () => {
    const [segment] = collectTextblockSegments(state.doc, 0, state.doc.content.size);

    expect(segment?.from).toBe(1);
    expect(state.doc.textBetween(1, 4)).toBe("teh");
  });

  it("splits a block at hard breaks, tracking each line's position", () => {
    const withBreak = stateFrom([
      paragraph(text("teh one"), { type: "hardBreak" }, text("teh two")),
    ]);

    expect(collectTextblockSegments(withBreak.doc, 0, withBreak.doc.content.size)).toEqual([
      { from: 1, text: "teh one" },
      { from: 9, text: "teh two" },
    ]);
  });

  it("clips to a selection inside a block", () => {
    const segments = collectTextblockSegments(state.doc, 1, 4);

    expect(segments).toEqual([{ from: 1, text: "teh" }]);
  });
});

describe("addGrammarCorrections", () => {
  it("keeps marks, atoms, and neighbouring text when fixing around them", () => {
    const state = stateFrom([
      paragraph(
        text("teh "),
        text("bold wrod", "bold"),
        text(" and "),
        { type: "mention", attrs: { id: "web", label: "Web" } },
        text(" dont"),
      ),
    ]);
    const { changed, doc } = applyCorrections(state, 0, state.doc.content.size, [
      `The bold word and ${verbatim} don't`,
    ]);

    expect(changed).toBe(true);
    expect(doc.toJSON().content[0].content).toEqual([
      { type: "text", text: "The " },
      { type: "text", text: "bold word", marks: [{ type: "bold" }] },
      { type: "text", text: " and " },
      { type: "mention", attrs: expect.objectContaining({ id: "web" }) },
      { type: "text", text: " don't" },
    ]);
  });

  it("keeps a link on a word fixed at the link's end", () => {
    const link = { type: "link", attrs: { href: "https://example.com" } };
    const state = stateFrom([
      paragraph({ type: "text", text: "good lnik", marks: [link] }, text(" next")),
    ]);
    const { doc } = applyCorrections(state, 0, state.doc.content.size, ["good link next"]);
    const [linked, plain] = doc.toJSON().content[0].content;

    expect(linked.text).toBe("good link");
    expect(linked.marks[0].type).toBe("link");
    expect(plain.text).toBe(" next");
  });

  it("only touches the selected part of a block", () => {
    const state = stateFrom([paragraph(text("teh and teh"))]);
    const { doc } = applyCorrections(state, 1, 4, ["the"]);

    expect(doc.textContent).toBe("the and teh");
  });

  it("applies corrections across blocks with one undoable transaction", () => {
    const state = stateFrom([paragraph(text("teh one")), paragraph(text("teh two"))]);
    const { doc, tr } = applyCorrections(state, 0, state.doc.content.size, ["the one", "the two"]);

    expect(doc.textContent).toBe("the onethe two");
    expect(tr.steps.length).toBe(2);
    expect(doc.childCount).toBe(2);
  });

  it("fixes both sides of a hard break and keeps the break", () => {
    const state = stateFrom([paragraph(text("teh one"), { type: "hardBreak" }, text("teh two"))]);
    const { doc } = applyCorrections(state, 0, state.doc.content.size, ["the one", "the two"]);

    expect(doc.toJSON().content[0].content).toEqual([
      { type: "text", text: "the one" },
      { type: "hardBreak" },
      { type: "text", text: "the two" },
    ]);
  });

  it("deletes extra words without leaving empty nodes", () => {
    const state = stateFrom([paragraph(text("the the end"))]);
    const { doc } = applyCorrections(state, 0, state.doc.content.size, ["the end"]);

    expect(doc.textContent).toBe("the end");
  });

  it("reports no change for an identical correction", () => {
    const state = stateFrom([paragraph(text("all good"))]);
    const { changed, tr } = applyCorrections(state, 0, state.doc.content.size, ["all good"]);

    expect(changed).toBe(false);
    expect(tr.docChanged).toBe(false);
  });

  it.each([
    ["lost an atom", `teh ${verbatim}${verbatim}`, "teh mention"],
    ["resized a verbatim run", `teh ${verbatim}${verbatim}`, `the ${verbatim}`],
  ])("refuses a correction that %s", (_label, source, corrected) => {
    const state = stateFrom([paragraph(text("placeholder"))]);
    const tr = state.tr;

    expect(addGrammarCorrections(tr, [{ from: 1, text: source }], [corrected])).toBe(false);
    expect(tr.docChanged).toBe(false);
  });
});
