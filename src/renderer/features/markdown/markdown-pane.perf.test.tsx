// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./markdown-pane";
import { inspectRichText } from "./rich-text-safety";
import { registeredMarkdownEditor } from "./markdown-session";

beforeAll(() => {
  Range.prototype.getClientRects = () => document.createElement("div").getClientRects();
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

describe("rich text inspection", () => {
  it("inspects once per load and not on later keystrokes", async () => {
    const inspect = vi.fn(inspectRichText);
    const markdown = `${"Hello world. ".repeat(3_500)}\n`;
    render(
      <MarkdownEditor
        itemId="perf-note"
        workspaceId="workspace"
        folderId={null}
        markdown={markdown}
        editable
        onChange={vi.fn()}
        onBlur={vi.fn()}
        inspect={inspect}
      />,
    );
    await screen.findByLabelText("Markdown rich text editor");
    const callsAfterLoad = inspect.mock.calls.length;
    expect(callsAfterLoad).toBeGreaterThan(0);

    const editor = registeredMarkdownEditor("perf-note");
    expect(editor?.isEditable).toBe(true);
    const started = performance.now();
    for (const mark of ["!", "?", ".", "x", "y"]) {
      editor?.commands.insertContent(mark);
    }

    expect(inspect.mock.calls.length).toBe(callsAfterLoad);
    expect(performance.now() - started).toBeLessThan(1_500);
  });
});
