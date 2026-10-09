// @vitest-environment jsdom

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { IpcApi, MarkdownInfo } from "@shared/ipc";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { notifyMarkdownBodiesRewritten } from "../items/item-title-events";
import { MarkdownEditor, MarkdownViewBoundary } from "./markdown-pane";
import { registeredMarkdownEditor } from "./markdown-session";
import { inspectRichText } from "./rich-text-safety";

function openedExternalLinks(): string[] {
  const opened: string[] = [];
  Object.assign(window, {
    electronAPI: {
      openExternal(url: string) {
        opened.push(url);
        return Promise.resolve();
      },
    },
  });
  return opened;
}

const LOSSY_NOTES = {
  footnote: "Text with note[^1].\n\n[^1]: The footnote.",
  "inline html": "Hello <span>hi</span> world",
  "html block": "<details>\n<summary>More</summary>\n\nHidden\n\n</details>",
  "html comment": "Before\n\n<!-- private -->\n\nAfter",
  callout: "> [!note] Title\n> Body",
  "reference link": "See [docs][1].\n\n[1]: https://example.com",
  escapes: "1\\. not a list and \\*not em\\*",
} as const;

const FRONTMATTER = "---\ntitle: x\ntags: [a, b]\n---\n";
const TABLE = "Intro\n\n| a | b |\n| --- | --- |\n| one | two |\n\nOutro";

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
        markdown={LOSSY_NOTES.footnote}
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

  it("keeps frontmatter byte-for-byte when the body is edited", async () => {
    const onChange = vi.fn();
    const original = `${FRONTMATTER}Body text`;
    render(
      <MarkdownEditor
        itemId="frontmatter-note"
        workspaceId="workspace"
        folderId={null}
        markdown={original}
        editable
        onChange={onChange}
        onBlur={vi.fn()}
      />,
    );
    await screen.findByLabelText("Markdown rich text editor");
    expect(screen.getByLabelText("Note properties").textContent).toContain("title: x");
    expect(screen.queryByRole("button", { name: "Edit in Markdown" })).toBeNull();
    registeredMarkdownEditor("frontmatter-note")?.commands.insertContent("!");
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const saved = String(onChange.mock.calls.at(-1)?.[0]);
    expect(saved.startsWith(FRONTMATTER)).toBe(true);
    expect(saved).toContain("!");
  });

  it("renders a guarded note through the preview with the banner", async () => {
    const note = `${FRONTMATTER}Hello <span>hi</span>\n\n| a | b |\n| --- | --- |\n| one | two |`;
    render(
      <MarkdownEditor
        itemId="guarded-preview"
        workspaceId="workspace"
        folderId={null}
        markdown={note}
        editable
        onChange={vi.fn()}
        onBlur={vi.fn()}
        onEditInMarkdown={vi.fn()}
      />,
    );
    const surface = await screen.findByLabelText("Markdown rich text, read only");
    expect(surface.querySelector("table")?.textContent).toContain("one");
    expect(surface.textContent).toContain("hi");
    expect(screen.getByLabelText("Note properties").textContent).toContain("title: x");
    expect(screen.getByRole("button", { name: "Edit in Markdown" })).toBeTruthy();
  });

  it("renders an editable table and task list", async () => {
    render(
      <MarkdownEditor
        itemId="table-tasks"
        workspaceId="workspace"
        folderId={null}
        markdown={`${TABLE}\n\n- [ ] todo\n- [x] done`}
        editable
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );
    const surface = await screen.findByLabelText("Markdown rich text editor");
    expect(surface.querySelector("table")?.textContent).toContain("one");
    expect(surface.querySelector('input[type="checkbox"]')).toBeTruthy();
  });

  it("renders wikilinks and tasks in preview", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MarkdownEditor
          itemId="preview-links"
          workspaceId="workspace"
          folderId={null}
          markdown={"See [[Note]]\n\n- [ ] task"}
          editable={false}
          onChange={vi.fn()}
          onBlur={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const surface = await screen.findByLabelText("Markdown preview");
    expect(surface.getAttribute("contenteditable")).toBe("false");
    expect(surface.textContent).toContain("Note");
    expect(surface.textContent).toContain("task");
  });

  it("keeps typed angle brackets as text", async () => {
    const onChange = vi.fn();
    const original = "x<y and z>w";
    render(
      <MarkdownEditor
        itemId="angle-note"
        workspaceId="workspace"
        folderId={null}
        markdown={original}
        editable
        onChange={onChange}
        onBlur={vi.fn()}
      />,
    );
    await screen.findByLabelText("Markdown rich text editor");
    registeredMarkdownEditor("angle-note")?.commands.insertContent({
      type: "text",
      text: "<b>bold</b>",
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const saved = String(onChange.mock.calls.at(-1)?.[0]);
    expect(saved).not.toContain("<b>bold</b>");
    expect(saved).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(inspectRichText(saved).losesContent).toBe(false);

    cleanup();
    render(
      <MarkdownEditor
        itemId="angle-reopen"
        workspaceId="workspace"
        folderId={null}
        markdown={saved}
        editable
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );
    const surface = await screen.findByLabelText("Markdown rich text editor");
    expect(surface.querySelector("b, strong")).toBeNull();
    expect(screen.queryByText("This note could not be displayed.")).toBeNull();
  });

  it("keeps typed entities inside a code block", async () => {
    const onChange = vi.fn();
    const typed = "a &amp;&amp; b";
    render(
      <MarkdownEditor
        itemId="code-entity"
        workspaceId="workspace"
        folderId={null}
        markdown={"x & y\n\n```\n\n```"}
        editable
        onChange={onChange}
        onBlur={vi.fn()}
      />,
    );
    await screen.findByLabelText("Markdown rich text editor");
    const editor = registeredMarkdownEditor("code-entity");
    let pos = 1;
    editor?.state.doc.descendants((node, position) => {
      if (node.type.name === "codeBlock") {
        pos = position + 1;
        return false;
      }
      return true;
    });
    editor?.commands.insertContentAt(pos, { type: "text", text: typed });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const saved = String(onChange.mock.calls.at(-1)?.[0]);
    expect(saved).toContain(typed);
    expect(saved).not.toContain("a && b");
  });

  it.each([
    ["img/a.png", "![alt](img/a.png)"],
    ["file:///tmp/a.png", "![alt](file:///tmp/a.png)"],
    ["data:image/png;base64,aaaa", "![alt](data:image/png;base64,aaaa)"],
    ["", "![]()"],
  ])("renders an image-only note (%s)", async (src, markdown) => {
    const onChange = vi.fn();
    for (const editable of [false, true]) {
      cleanup();
      render(
        <MarkdownEditor
          itemId={editable ? "image-rich" : "image-preview"}
          workspaceId="workspace"
          folderId={null}
          markdown={markdown}
          editable={editable}
          onChange={onChange}
          onBlur={vi.fn()}
        />,
      );
      const surface = await screen.findByLabelText(
        editable ? "Markdown rich text editor" : "Markdown preview",
      );
      const image =
        src === ""
          ? surface.querySelector("img:not(.ProseMirror-separator)")
          : surface.querySelector(`img[src="${src}"]`);
      expect(image).toBeTruthy();
      expect(screen.queryByText("This note could not be displayed.")).toBeNull();
      expect(inlineHandlers(surface)).toEqual([]);
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    [
      "block alt",
      "![Mountain at dawn](https://www.example.com/peaks.png)",
      "block",
      "Mountain at dawn · example.com",
      "Image not loaded: Mountain at dawn, from example.com",
    ],
    [
      "block no alt",
      "![](https://cdn.example.com/a.png)",
      "block",
      "Image not loaded · cdn.example.com",
      "Image not loaded, from cdn.example.com",
    ],
    [
      "inline alt",
      "See ![Mountain at dawn](https://www.example.com/peaks.png) today.",
      "inline",
      "Mountain at dawn",
      "Image not loaded: Mountain at dawn, from example.com",
    ],
    [
      "inline no alt",
      "See ![](https://www.example.com/a.png) today.",
      "inline",
      "Image not loaded",
      "Image not loaded, from example.com",
    ],
  ])(
    "shows a remote image placeholder and does not save (%s)",
    async (_name, markdown, layout, label, aria) => {
      const onChange = vi.fn();
      for (const editable of [false, true]) {
        cleanup();
        render(
          <MarkdownEditor
            itemId={editable ? "remote-rich" : "remote-preview"}
            workspaceId="workspace"
            folderId={null}
            markdown={markdown}
            editable={editable}
            onChange={onChange}
            onBlur={vi.fn()}
          />,
        );
        const surface = await screen.findByLabelText(
          editable ? "Markdown rich text editor" : "Markdown preview",
        );
        const row = surface.querySelector("[data-remote-image]");
        expect(row?.textContent).toBe(label);
        expect(row?.getAttribute("data-layout")).toBe(layout);
        expect(row?.getAttribute("role")).toBe("img");
        expect(row?.getAttribute("aria-label")).toBe(aria);
        expect(row?.getAttribute("tabindex")).not.toBe("0");
        expect(row?.className).toContain("text-[12px]");
        expect(row?.className).toContain("cursor-default");
        expect(row?.querySelector("svg")).toBeTruthy();
        expect(row?.querySelector("a, button")).toBeNull();
        expect(row?.querySelector("[tabindex='0']")).toBeNull();
        expect(surface.getAttribute("contenteditable")).toBe(editable ? "true" : "false");
        expect(surface.querySelector("img[src^='http'], img[src^='//']")).toBeNull();
        expect(surface.querySelector("script, style")).toBeNull();
        expect(inlineHandlers(surface)).toEqual([]);
        expect(screen.queryByText("This note could not be displayed.")).toBeNull();
      }
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("does not fetch a non-http remote image", async () => {
    const onChange = vi.fn();
    render(
      <MarkdownEditor
        itemId="remote-file"
        workspaceId="workspace"
        folderId={null}
        markdown={"![alt](//cdn.example.com/a.png)\n\n![alt](file://host/a.png)"}
        editable
        onChange={onChange}
        onBlur={vi.fn()}
      />,
    );
    const surface = await screen.findByLabelText("Markdown rich text editor");
    expect(surface.querySelector("[data-remote-image]")).toBeNull();
    expect(
      surface.querySelector("img[src^='//'], img[src^='file://'], img[src^='http']"),
    ).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the remote image markdown after an unrelated edit", async () => {
    const onChange = vi.fn();
    const image = "![cover](https://cdn.example.com/a.png)";
    render(
      <MarkdownEditor
        itemId="remote-edit"
        workspaceId="workspace"
        folderId={null}
        markdown={`Hello\n\n${image}`}
        editable
        onChange={onChange}
        onBlur={vi.fn()}
      />,
    );
    const surface = await screen.findByLabelText("Markdown rich text editor");
    expect(surface.querySelector("[data-remote-image]")?.textContent).toBe(
      "cover · cdn.example.com",
    );
    const editor = registeredMarkdownEditor("remote-edit");
    expect(editor?.getMarkdown()).toContain(image);
    editor?.commands.insertContent("!");
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const saved = String(onChange.mock.calls.at(-1)?.[0]);
    expect(saved).toContain(image);
    expect(editor?.getMarkdown()).toContain(image);
  });

  it("selects a remote image and removes it like any image", async () => {
    const onChange = vi.fn();
    const image = "![cover](https://cdn.example.com/a.png)";
    render(
      <MarkdownEditor
        itemId="remote-delete"
        workspaceId="workspace"
        folderId={null}
        markdown={`Hello\n\n${image}`}
        editable
        onChange={onChange}
        onBlur={vi.fn()}
      />,
    );
    const surface = await screen.findByLabelText("Markdown rich text editor");
    const editor = registeredMarkdownEditor("remote-delete");
    let pos = -1;
    editor?.state.doc.descendants((node, position) => {
      if (node.type.name === "image") {
        pos = position;
        return false;
      }
      return true;
    });
    editor?.commands.setNodeSelection(pos);
    expect(surface.querySelector(".ProseMirror-selectednode [data-remote-image]")).toBeTruthy();
    editor?.commands.deleteSelection();
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const saved = String(onChange.mock.calls.at(-1)?.[0]);
    expect(saved).toContain("Hello");
    expect(saved).not.toContain(image);
    expect(editor?.getMarkdown()).not.toContain("cdn.example.com");
  });

  it("shows a fallback when the note view throws", () => {
    function Broken(): React.ReactNode {
      throw new Error("display failed");
    }
    render(
      <MarkdownViewBoundary resetKey="note">
        <Broken />
      </MarkdownViewBoundary>,
    );
    expect(screen.getByText("This note could not be displayed.")).toBeTruthy();
  });

  it("does not show the banner in preview", async () => {
    render(
      <MarkdownEditor
        itemId="preview-note"
        workspaceId="workspace"
        folderId={null}
        markdown={LOSSY_NOTES.footnote}
        editable={false}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );
    await screen.findByLabelText("Markdown preview");
    expect(screen.queryByRole("button", { name: "Edit in Markdown" })).toBeNull();
  });

  it("opens an external note link outside the window", async () => {
    const opened = openedExternalLinks();
    render(
      <MarkdownEditor
        itemId="document-link"
        workspaceId="workspace"
        folderId={null}
        markdown="See [the docs](https://example.com/docs)."
        editable={false}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );

    const link = await screen.findByRole("link", { name: "the docs" });
    expect(link.getAttribute("target")).toBeNull();
    const surface = screen.getByLabelText("Markdown preview");
    expect(surface.querySelector("script, style")).toBeNull();
    expect(inlineHandlers(surface)).toEqual([]);
    link.click();
    expect(opened).toEqual(["https://example.com/docs"]);
  });

  it("opens a locked note link outside the window", async () => {
    const opened = openedExternalLinks();
    const onChange = vi.fn();
    render(
      <MarkdownEditor
        itemId="locked-link"
        workspaceId="workspace"
        folderId={null}
        markdown={
          "Hello <span>hi</span>\n\n![alt](https://cdn.example.com/a.png)\n\nSee [the docs](https://example.com/docs)."
        }
        editable
        onChange={onChange}
        onBlur={vi.fn()}
        onEditInMarkdown={vi.fn()}
      />,
    );

    const surface = await screen.findByLabelText("Markdown rich text, read only");
    const row = surface.querySelector("[data-remote-image]");
    expect(row?.textContent).toBe("alt · cdn.example.com");
    expect(row?.getAttribute("aria-label")).toBe("Image not loaded: alt, from cdn.example.com");
    expect(surface.getAttribute("contenteditable")).toBe("false");
    expect(row?.getAttribute("tabindex")).not.toBe("0");
    expect(surface.querySelector("img[src^='http']")).toBeNull();
    expect(surface.querySelector("script, style")).toBeNull();
    expect(inlineHandlers(surface)).toEqual([]);
    screen.getByRole("link", { name: "the docs" }).click();
    expect(opened).toEqual(["https://example.com/docs"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not open a javascript link from preview", async () => {
    const opened = openedExternalLinks();
    render(
      <MarkdownEditor
        itemId="script-link"
        workspaceId="workspace"
        folderId={null}
        markdown="[run](javascript:alert(1))"
        editable={false}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );

    const surface = await screen.findByLabelText("Markdown preview");
    const link = surface.querySelector("a");
    expect(link?.textContent).toBe("run");
    expect(link?.getAttribute("href")).toBe("");
    link?.click();
    expect(opened).toEqual([]);
  });

  it("keeps a wikilink inside the note", async () => {
    const opened = openedExternalLinks();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MarkdownEditor
          itemId="document-wiki"
          workspaceId="workspace"
          folderId={null}
          markdown="See [[Alpha]]."
          editable={false}
          onChange={vi.fn()}
          onBlur={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Alpha")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(opened).toEqual([]);
  });
});

function inlineHandlers(surface: HTMLElement): string[] {
  const names: string[] = [];
  for (const element of surface.querySelectorAll("*")) {
    for (const attr of element.attributes) {
      if (attr.name.toLowerCase().startsWith("on")) names.push(attr.name);
    }
  }
  return names;
}

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
