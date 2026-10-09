// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isRemoteImageUrl } from "@shared/chat/assistant-images";
import { JSDOM } from "jsdom";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost",
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.DocumentFragment = window.DocumentFragment;
globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
const animationFrames = new Map<number, ReturnType<typeof setTimeout>>();
let animationFrameId = 0;
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
  animationFrameId += 1;
  const id = animationFrameId;
  animationFrames.set(
    id,
    setTimeout(() => callback(0), 0),
  );
  return id;
};
globalThis.cancelAnimationFrame = (handle: number) => {
  const timer = animationFrames.get(handle);
  if (timer !== undefined) clearTimeout(timer);
};
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
window.HTMLElement.prototype.scrollIntoView = () => {};
window.Range.prototype.getClientRects = () => window.document.createElement("div").getClientRects();
window.Range.prototype.getBoundingClientRect = () => new window.DOMRect();

const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { MARKDOWN_MODE_IDS, MarkdownPane, MarkdownPaneProvider, useMarkdownPane } =
  await import("./markdown-pane");
const { registeredMarkdownEditor } = await import("./markdown-session");

const LOSSY = "Hello <span>hi</span> world";
const TABLE = "Intro\n\n| a | b |\n| --- | --- |\n| one | two |\n\nOutro";
const GUARDED_TABLE = "Before\n\n<!-- private -->\n\n| a | b |\n| --- | --- |\n| one | two |";
const FRONTMATTER = "---\ntitle: x\ntags: [a, b]\n---\n";

describe("guarded rich text saves", () => {
  const directory = mkdtempSync(join(tmpdir(), "hanoki-rich-text-guard-"));
  const database = new DatabaseSync(join(directory, "notes.sqlite"));
  const pending = new Map<string, string>();
  let queues = 0;
  let nextId = 0;

  beforeAll(() => {
    database.exec(`
      create table items (
        id text primary key,
        markdown text not null,
        updated_at integer not null
      )
    `);
  });

  afterAll(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  afterEach(() => {
    cleanup();
    queues = 0;
    pending.clear();
  });

  function readItem(id: string) {
    // SAFETY: the query selects markdown text and an integer updated_at from the items table.
    const row = database.prepare("select markdown, updated_at from items where id = ?").get(id) as
      | { markdown: string; updated_at: number }
      | undefined;
    if (!row) throw new Error(`Missing item ${id}`);
    return {
      type: "markdown" as const,
      id,
      workspaceId: "guard-workspace",
      folderId: null,
      title: "Note",
      data: { markdown: row.markdown },
      metadata: {},
      extensions: {},
      createdAt: 1,
      updatedAt: row.updated_at,
    };
  }

  function installApi() {
    const api = {
      getItem: (id: string) => readItem(id),
      queueMarkdownContent: (id: string, markdown: string) => {
        queues += 1;
        pending.set(id, markdown);
        return Promise.resolve();
      },
      flushMarkdownContent: (id: string) => {
        const next = pending.get(id);
        if (next !== undefined) {
          database
            .prepare("update items set markdown = ?, updated_at = ? where id = ?")
            .run(next, Date.now(), id);
          pending.delete(id);
        }
        return Promise.resolve(readItem(id));
      },
      listNoteBacklinks: async () => [],
      getSumiSettings: async () => ({
        promptActions: { enabled: false, model: null },
        titleGeneration: { enabled: false, autoGenerate: false, model: null },
      }),
    };
    // SAFETY: MarkdownPane only calls the methods this double implements.
    window.electronAPI = api as unknown as Window["electronAPI"];
  }

  function seed(markdown: string) {
    nextId += 1;
    const id = `note-${nextId}`;
    const updatedAt = 1_000 + nextId;
    database
      .prepare("insert into items (id, markdown, updated_at) values (?, ?, ?)")
      .run(id, markdown, updatedAt);
    return readItem(id);
  }

  function renderPane(itemId: string) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <MarkdownPaneProvider>
          <ModeButtons />
          <MarkdownPane itemId={itemId} />
        </MarkdownPaneProvider>
      </QueryClientProvider>,
    );
  }

  it("does not write or touch updated_at when a guarded note is opened, viewed, or scrolled", async () => {
    installApi();
    const stored = seed(LOSSY);
    renderPane(stored.id);

    const surface = await screen.findByLabelText("Markdown rich text, read only");
    expect(surface.getAttribute("contenteditable")).toBe("false");
    const scroller = document.querySelector("[data-markdown-scroller]");
    if (!(scroller instanceof HTMLElement)) throw new Error("Missing scroller");
    scroller.scrollTop = 80;
    fireEvent.scroll(scroller);
    fireEvent.wheel(surface, { deltaY: 40 });
    expect(document.activeElement).not.toBe(surface);
    await new Promise((resolve) => setTimeout(resolve, 600));
    cleanup();

    const fresh = readItem(stored.id);
    expect(fresh.updatedAt).toBe(stored.updatedAt);
    expect(fresh.data.markdown).toBe(LOSSY);
    expect(queues).toBe(0);
  });

  it("keeps unedited safe notes unchanged across mode switches", async () => {
    installApi();
    for (const markdown of ["Hello world", "- one\n- two", "# Title", "```\ncode\n```", TABLE]) {
      const stored = seed(markdown);
      renderPane(stored.id);
      await screen.findByLabelText("Markdown rich text editor");
      fireEvent.click(screen.getByRole("button", { name: "mode-preview" }));
      await screen.findByLabelText("Markdown preview");
      expect(screen.queryByRole("button", { name: "Edit in Markdown" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "mode-rich-text" }));
      await screen.findByLabelText("Markdown rich text editor");
      fireEvent.click(screen.getByRole("button", { name: "mode-source" }));
      await screen.findByLabelText("Markdown source");
      cleanup();
      const fresh = readItem(stored.id);
      expect(fresh.updatedAt).toBe(stored.updatedAt);
      expect(fresh.data.markdown).toBe(markdown);
      expect(queues).toBe(0);
    }
  });

  it("still saves a real edit on an unguarded note", async () => {
    installApi();
    const stored = seed("Hello");
    renderPane(stored.id);
    await screen.findByLabelText("Markdown rich text editor");
    registeredMarkdownEditor(stored.id)?.commands.insertContent("!");
    fireEvent.click(screen.getByRole("button", { name: "mode-source" }));
    await waitFor(() => {
      expect(readItem(stored.id).data.markdown).toContain("!");
    });
    expect(readItem(stored.id).updatedAt).not.toBe(stored.updatedAt);
  });

  it("reattaches frontmatter after a body edit", async () => {
    installApi();
    const stored = seed(`${FRONTMATTER}Body text`);
    renderPane(stored.id);
    await screen.findByLabelText("Markdown rich text editor");
    expect(screen.getByLabelText("Note properties").textContent).toContain("title: x");
    registeredMarkdownEditor(stored.id)?.commands.insertContent("!");
    fireEvent.click(screen.getByRole("button", { name: "mode-source" }));
    await waitFor(() => {
      expect(readItem(stored.id).data.markdown).toContain("!");
    });
    expect(readItem(stored.id).data.markdown.startsWith(FRONTMATTER)).toBe(true);
  });

  it("does not insert a remote image src when leaving rich text", async () => {
    installApi();
    const images = [
      "![one](https://cdn.example.com/one.png)",
      "",
      "![two](//cdn.example.com/two.png)",
      "",
      "![three](file://host/three.png)",
    ].join("\n");
    const first = seed(images);
    const second = seed(images);
    const seen: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const nodes = record.type === "attributes" ? [record.target] : [...record.addedNodes];
        for (const node of nodes) noteRemoteImage(node, seen);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pane = (itemId: string) => (
      <QueryClientProvider client={client}>
        <MarkdownPaneProvider key={itemId}>
          <ModeButtons />
          <MarkdownPane itemId={itemId} />
        </MarkdownPaneProvider>
      </QueryClientProvider>
    );
    const view = render(pane(first.id));
    await screen.findByLabelText("Markdown rich text editor");
    expect(document.querySelectorAll("[data-remote-image]")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "mode-source" }));
    await screen.findByLabelText("Markdown source");
    await flushMutations();

    fireEvent.click(screen.getByRole("button", { name: "mode-rich-text" }));
    await screen.findByLabelText("Markdown rich text editor");
    expect(document.querySelectorAll("[data-remote-image]")).toHaveLength(3);

    view.rerender(pane(second.id));
    await screen.findByLabelText("Markdown rich text editor");
    expect(document.querySelectorAll("[data-remote-image]")).toHaveLength(3);
    await flushMutations();

    view.unmount();
    await flushMutations();
    observer.disconnect();
    expect(seen).toEqual([]);
  });

  it("keeps Markdown mode editable and restores scroll from the banner", async () => {
    installApi();
    const stored = seed(GUARDED_TABLE);
    renderPane(stored.id);
    await screen.findByRole("button", { name: "Edit in Markdown" });
    const scroller = document.querySelector("[data-markdown-scroller]");
    if (!(scroller instanceof HTMLElement)) throw new Error("Missing scroller");
    scroller.scrollTop = 140;
    fireEvent.click(screen.getByRole("button", { name: "Edit in Markdown" }));
    const source = await screen.findByLabelText("Markdown source");
    expect(source.hasAttribute("readonly")).toBe(false);
    expect(scroller.scrollTop).toBe(140);
    expect(
      screen.queryByText("Read-only in Rich text, so none of this note's formatting is lost."),
    ).toBeNull();
    fireEvent.change(source, { target: { value: `${GUARDED_TABLE}\nedited` } });
    await waitFor(() => {
      expect(readItem(stored.id).data.markdown).toContain("edited");
    });
  });
});

function noteRemoteImage(node: Node, seen: string[]) {
  if (!(node instanceof Element)) return;
  const images = node.matches("img") ? [node] : [...node.querySelectorAll("img")];
  for (const image of images) {
    const src = image.getAttribute("src");
    if (src && isRemoteImageUrl(src)) seen.push(src);
  }
}

function flushMutations() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

function ModeButtons() {
  const { setMode } = useMarkdownPane();
  return (
    <>
      {MARKDOWN_MODE_IDS.map((mode) => (
        <button key={mode} type="button" onClick={() => setMode(mode)}>
          {`mode-${mode}`}
        </button>
      ))}
    </>
  );
}
