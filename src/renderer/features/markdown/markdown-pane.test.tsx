// @vitest-environment jsdom

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { IpcApi, MarkdownInfo } from "@shared/ipc";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { notifyMarkdownBodiesRewritten } from "../items/item-title-events";
import { MarkdownEditor } from "./markdown-pane";
import { registeredMarkdownEditor } from "./markdown-session";
import { inspectRichText } from "./rich-text-safety";

const LOSSY_NOTES = {
  frontmatter: "---\ntitle: x\ntags: [a, b]\n---\nBody text",
  "gfm table": "Intro\n\n| a | b |\n| --- | --- |\n| one | two |\n\nOutro",
  "task list": "- [ ] todo\n- [x] done",
  footnote: "Text with note[^1].\n\n[^1]: The footnote.",
  "inline html": "Hello <span>hi</span> world",
  "html block": "<details>\n<summary>More</summary>\n\nHidden\n\n</details>",
  "html comment": "Before\n\n<!-- private -->\n\nAfter",
  callout: "> [!note] Title\n> Body",
  "image relative": '![alt](img/a.png "t")',
  "image remote": "![alt](https://cdn.example.com/a.png)",
  "image attachment": "![cover](Attachments/cover.png)",
  "reference link": "See [docs][1].\n\n[1]: https://example.com",
  escapes: "1\\. not a list and \\*not em\\*",
} as const;

beforeAll(() => {
  Range.prototype.getClientRects = () => document.createElement("div").getClientRects();
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

describe("MarkdownEditor", () => {
  it("hydrates the selected document without emitting a content update", async () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const view = render(
      <MarkdownEditor
        key="document-a"
        itemId="document-a"
        workspaceId="workspace"
        folderId={null}
        markdown="Alpha persisted content"
        editable
        onChange={onChange}
        onBlur={onBlur}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Markdown rich text editor").textContent).toContain(
        "Alpha persisted content",
      );
    });

    view.rerender(
      <MarkdownEditor
        key="document-b"
        itemId="document-b"
        workspaceId="workspace"
        folderId={null}
        markdown="Beta persisted content"
        editable
        onChange={onChange}
        onBlur={onBlur}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Markdown rich text editor").textContent).toContain(
        "Beta persisted content",
      );
    });

    view.rerender(
      <MarkdownEditor
        key="document-a"
        itemId="document-a"
        workspaceId="workspace"
        folderId={null}
        markdown="Alpha persisted content"
        editable
        onChange={onChange}
        onBlur={onBlur}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Markdown rich text editor").textContent).toContain(
        "Alpha persisted content",
      );
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(Object.entries(LOSSY_NOTES))(
    "opens %s read-only and does not save",
    async (_name, markdown) => {
      const onChange = vi.fn();
      render(
        <MarkdownEditor
          itemId="lossy"
          workspaceId="workspace"
          folderId={null}
          markdown={markdown}
          editable
          onChange={onChange}
          onBlur={vi.fn()}
          onEditInMarkdown={vi.fn()}
        />,
      );

      const surface = await screen.findByLabelText("Markdown rich text, read only");
      expect(surface.getAttribute("contenteditable")).toBe("false");
      expect(screen.getByRole("button", { name: "Edit in Markdown" })).toBeTruthy();
      expect(
        screen.getByText("Read-only in Rich text, so none of this note's formatting is lost."),
      ).toBeTruthy();
      fireEvent.paste(surface, { clipboardData: { getData: () => "pasted" } });
      fireEvent.keyDown(surface, { key: "a" });
      const editor = registeredMarkdownEditor("lossy");
      expect(editor?.isEditable).toBe(false);
      await Promise.resolve();
      expect(onChange).not.toHaveBeenCalled();
      expect(surface.textContent ?? "").not.toContain("pasted");
    },
  );

  it("keeps unedited safe notes byte-identical across open, focus, and mode switches", async () => {
    const onChange = vi.fn();
    const notes = [
      "Hello world",
      "- one\n- two",
      "# Title",
      "```\ncode\n```",
      "| a | b |\n| --- | --- |\n| one | two |",
    ];
    for (const markdown of notes) {
      const view = render(
        <MarkdownEditor
          itemId={`safe-${markdown.length}`}
          workspaceId="workspace"
          folderId={null}
          markdown={markdown}
          editable
          onChange={onChange}
          onBlur={vi.fn()}
        />,
      );
      await screen.findByLabelText(/Markdown rich text/);
      view.rerender(
        <MarkdownEditor
          itemId={`safe-${markdown.length}`}
          workspaceId="workspace"
          folderId={null}
          markdown={markdown}
          editable={false}
          onChange={onChange}
          onBlur={vi.fn()}
        />,
      );
      view.rerender(
        <MarkdownEditor
          itemId={`safe-${markdown.length}`}
          workspaceId="workspace"
          folderId={null}
          markdown={markdown}
          editable
          onChange={onChange}
          onBlur={vi.fn()}
        />,
      );
      await screen.findByLabelText(/Markdown rich text/);
      cleanup();
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it("saves a real edit on a safe note", async () => {
    const onChange = vi.fn();
    render(
      <MarkdownEditor
        itemId="editable-note"
        workspaceId="workspace"
        folderId={null}
        markdown="Hello"
        editable
        onChange={onChange}
        onBlur={vi.fn()}
      />,
    );
    await screen.findByLabelText("Markdown rich text editor");
    const editor = registeredMarkdownEditor("editable-note");
    expect(editor?.isEditable).toBe(true);
    editor?.commands.insertContent("!");
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(String(onChange.mock.calls.at(-1)?.[0])).toContain("!");
  });

  it("resets the baseline when the note is reloaded externally", async () => {
    const onChange = vi.fn();
    const inspect = vi.fn(inspectRichText);
    const itemId = "reloaded-note";
    const reloaded = "- alpha\n- beta";
    const view = render(
      <MarkdownEditor
        itemId={itemId}
        workspaceId="workspace"
        folderId={null}
        markdown="Hello"
        editable
        onChange={onChange}
        onBlur={vi.fn()}
        inspect={inspect}
      />,
    );
    await screen.findByLabelText("Markdown rich text editor");
    // SAFETY: the reload path only calls getItem, which this double implements.
    window.electronAPI = {
      getItem: async () => markdownInfo(itemId, reloaded),
    } as unknown as IpcApi;
    notifyMarkdownBodiesRewritten([itemId]);
    await waitFor(() => {
      expect(screen.getByLabelText("Markdown rich text editor").textContent).toContain("alpha");
    });
    const callsAfterLoad = inspect.mock.calls.length;
    view.rerender(
      <MarkdownEditor
        itemId={itemId}
        workspaceId="workspace"
        folderId={null}
        markdown={reloaded}
        editable
        onChange={onChange}
        onBlur={vi.fn()}
        inspect={inspect}
      />,
    );
    expect(inspect.mock.calls.length).toBe(callsAfterLoad + 1);
    expect(onChange).not.toHaveBeenCalled();

    const editor = registeredMarkdownEditor(itemId);
    editor?.commands.focus("end");
    editor?.commands.insertContent("!");
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });
    editor?.commands.undo();
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(2);
    });
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(reloaded);
  });

  it("does not undo a title rewrite back to the old wikilink", async () => {
    const onChange = vi.fn();
    const itemId = "rewritten-wikilink";
    const rewritten = "See [[New]] here";
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function editor(markdown: string) {
      return (
        <QueryClientProvider client={queryClient}>
          <MarkdownEditor
            itemId={itemId}
            workspaceId="workspace"
            folderId={null}
            markdown={markdown}
            editable
            onChange={onChange}
            onBlur={vi.fn()}
          />
        </QueryClientProvider>
      );
    }
    const view = render(editor("See [[Old]] here"));
    await screen.findByLabelText("Markdown rich text editor");
    // SAFETY: the reload path only calls getItem, which this double implements.
    window.electronAPI = {
      getItem: async () => markdownInfo(itemId, rewritten),
    } as unknown as IpcApi;
    notifyMarkdownBodiesRewritten([itemId]);
    await waitFor(() => {
      expect(screen.getByLabelText("Markdown rich text editor").textContent).toContain("New");
    });
    view.rerender(editor(rewritten));

    const richText = registeredMarkdownEditor(itemId);
    richText?.commands.undo();
    expect(richText?.getMarkdown() ?? "").not.toContain("Old");
    expect(screen.getByLabelText("Markdown rich text editor").textContent).toContain("New");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("writes the original bytes when an edit is undone to the baseline", async () => {
    const onChange = vi.fn();
    const original = "Hello\n";
    render(
      <MarkdownEditor
        itemId="undo-note"
        workspaceId="workspace"
        folderId={null}
        markdown={original}
        editable
        onChange={onChange}
        onBlur={vi.fn()}
      />,
    );
    await screen.findByLabelText("Markdown rich text editor");
    const editor = registeredMarkdownEditor("undo-note");
    editor?.commands.insertContent("!");
    await waitFor(() => {
      expect(String(onChange.mock.calls.at(-1)?.[0])).toContain("!");
    });
    editor?.commands.undo();
    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0]).toBe(original);
    });
  });

  it("exposes the Markdown button to the keyboard with a focus ring", async () => {
    const onEditInMarkdown = vi.fn();
    render(
      <MarkdownEditor
        itemId="banner-note"
        workspaceId="workspace"
        folderId={null}
        markdown={LOSSY_NOTES.frontmatter}
        editable
        onChange={vi.fn()}
        onBlur={vi.fn()}
        onEditInMarkdown={onEditInMarkdown}
      />,
    );
    const button = await screen.findByRole("button", { name: "Edit in Markdown" });
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    expect(button.className).toContain("focus-visible:ring");
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onEditInMarkdown).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Edit in Markdown" })).toBeTruthy();
  });

  it("does not show the banner in preview", async () => {
    render(
      <MarkdownEditor
        itemId="preview-note"
        workspaceId="workspace"
        folderId={null}
        markdown={LOSSY_NOTES.frontmatter}
        editable={false}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );
    await screen.findByLabelText("Markdown preview");
    expect(screen.queryByRole("button", { name: "Edit in Markdown" })).toBeNull();
  });
});

function markdownInfo(id: string, markdown: string): MarkdownInfo {
  return {
    type: "markdown",
    id,
    workspaceId: "workspace",
    folderId: null,
    title: "Note",
    data: { markdown },
    metadata: {},
    extensions: {},
    createdAt: 1,
    updatedAt: 1,
  };
}
