// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "@/lib/query-client";
import { QueryProvider } from "@/providers/query-provider";
import { queryKeys } from "@/queries/keys";

import { MarkdownEditor } from "./markdown-pane";

const { flushContent, listOutgoing, openTab } = vi.hoisted(() => ({
  flushContent: vi.fn(async () => ({ id: "doc" })),
  listOutgoing: vi.fn(
    async () =>
      [] as { targetText: string; alias: string; toItemId: string | null; title: string | null }[],
  ),
  openTab: vi.fn(),
}));

vi.mock("@/api/markdown", () => ({
  markdownApi: {
    flushContent,
    listOutgoing,
    queueContent: vi.fn(async () => undefined),
    listBacklinks: vi.fn(async () => []),
  },
}));

vi.mock("@/features/workspace/store", () => ({
  useWorkspaceStore: {
    getState: () => ({ tabs: [], activeTabId: null, openTab, splitPane: vi.fn() }),
  },
}));

beforeAll(() => {
  Range.prototype.getClientRects = () => document.createElement("div").getClientRects();
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

beforeEach(() => {
  queryClient.clear();
  flushContent.mockClear();
  listOutgoing.mockReset();
  openTab.mockClear();
});

afterEach(() => {
  cleanup();
  queryClient.clear();
});

function renderLink(): void {
  queryClient.setQueryData(queryKeys.notes.outgoing("doc"), []);
  render(
    <QueryProvider>
      <MarkdownEditor
        itemId="doc"
        workspaceId="workspace"
        folderId={null}
        markdown="[[Target]]"
        editable={false}
        onChange={() => {}}
        onBlur={() => {}}
      />
    </QueryProvider>,
  );
}

describe("pending wikilink", () => {
  it("opens the note resolved after the flush", async () => {
    listOutgoing.mockResolvedValue([
      { targetText: "Target", alias: "", toItemId: "note-2", title: "Target" },
    ]);
    renderLink();

    fireEvent.click(await screen.findByRole("button", { name: "Open Target" }));

    await waitFor(() => {
      expect(openTab).toHaveBeenCalledWith({ type: "markdown", itemId: "note-2" });
    });
    expect(flushContent).toHaveBeenCalledWith("doc");
    expect(listOutgoing).toHaveBeenCalled();
  });

  it("marks the link unresolved when the flush still has no target", async () => {
    listOutgoing.mockResolvedValue([]);
    renderLink();

    fireEvent.click(await screen.findByRole("button", { name: "Open Target" }));

    expect(await screen.findByRole("button", { name: "Unresolved link Target" })).toBeTruthy();
    expect(openTab).not.toHaveBeenCalled();
  });

  it("clears the unresolved mark once the link resolves", async () => {
    listOutgoing.mockResolvedValue([]);
    renderLink();

    fireEvent.click(await screen.findByRole("button", { name: "Open Target" }));
    expect(await screen.findByRole("button", { name: "Unresolved link Target" })).toBeTruthy();

    const resolved = [{ targetText: "Target", alias: "", toItemId: "note-2", title: "Target" }];
    listOutgoing.mockResolvedValue(resolved);
    queryClient.setQueryData(queryKeys.notes.outgoing("doc"), resolved);

    expect(await screen.findByRole("button", { name: "Open Target" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Unresolved link Target" })).toBeNull();
  });
});
