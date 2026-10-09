// @vitest-environment jsdom

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FolderWordGoalStats, IpcApi, MarkdownInfo } from "@shared/ipc";

import { FolderGoalPopover } from "./folder-goal-popover";
import {
  MarkdownEditor,
  MarkdownPane,
  MarkdownPaneProvider,
  useMarkdownPane,
} from "./markdown-pane";
import { formatNoteStats, formatWordCount } from "./note-stats";

beforeAll(() => {
  Range.prototype.getClientRects = () => document.createElement("div").getClientRects();
  Range.prototype.getBoundingClientRect = () => new DOMRect();
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
});

const NOTE_ID = "note-1";
const FOLDER_ID = "folder-1";

function markdownNote(markdown = "hello world"): MarkdownInfo {
  return {
    type: "markdown",
    id: NOTE_ID,
    workspaceId: "ws",
    folderId: FOLDER_ID,
    title: "Note",
    data: { markdown },
    metadata: {},
    extensions: {},
    createdAt: 0,
    updatedAt: 0,
  };
}

function goalStats(overrides: Partial<FolderWordGoalStats> = {}): FolderWordGoalStats {
  return {
    folderId: FOLDER_ID,
    folderName: "Manuscript",
    targetWords: 50_000,
    startedAt: 1,
    baselineWords: 0,
    sinceStart: 18_240,
    today: 1_667,
    met: false,
    ...overrides,
  };
}

function installApi(overrides: Partial<IpcApi> = {}) {
  const api = {
    getItem: vi.fn(async () => markdownNote()),
    getSumiSettings: vi.fn(async () => ({
      promptActions: { enabled: false, model: null },
      titleGeneration: { enabled: false, autoGenerate: false, model: null },
    })),
    listNoteBacklinks: vi.fn(async () => []),
    getNearestWordGoal: vi.fn(async () => null),
    queueMarkdownContent: vi.fn(async () => undefined),
    flushMarkdownContent: vi.fn(async () => markdownNote()),
    getFolderWordGoal: vi.fn(async () => null),
    setFolderWordGoal: vi.fn(async () => goalStats({ sinceStart: 0, today: 0 })),
    clearFolderWordGoal: vi.fn(async () => undefined),
    ...overrides,
  };
  window.electronAPI = api as IpcApi;
  return api;
}

function renderWithQuery(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function ModeHarness() {
  const { setMode } = useMarkdownPane();
  return (
    <>
      <button type="button" onClick={() => setMode("rich-text")}>
        Use rich text
      </button>
      <button type="button" onClick={() => setMode("source")}>
        Use source
      </button>
      <button type="button" onClick={() => setMode("preview")}>
        Use preview
      </button>
      <MarkdownPane itemId={NOTE_ID} />
    </>
  );
}

describe("note word count footer", () => {
  it("formats a singular count", () => {
    expect(formatWordCount(1)).toBe("1 word");
    expect(formatNoteStats(1204, null)).toBe(formatWordCount(1204));
    expect(formatNoteStats(1204, 12)).toBe(
      `${new Intl.NumberFormat().format(12)} of ${formatWordCount(1204)}`,
    );
  });

  it("shows the live count in rich text, source, and preview", async () => {
    installApi();
    renderWithQuery(
      <MarkdownPaneProvider>
        <ModeHarness />
      </MarkdownPaneProvider>,
    );

    const total = formatWordCount(2);
    await waitFor(() => {
      expect(screen.getByText(total)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Use source" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Markdown source")).toBeTruthy();
      expect(screen.getByText(total)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Use preview" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Markdown preview")).toBeTruthy();
      expect(screen.getByText(total)).toBeTruthy();
    });
  });

  it("reports the selected source slice as part of the note", async () => {
    installApi();
    renderWithQuery(
      <MarkdownPaneProvider>
        <ModeHarness />
      </MarkdownPaneProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use source" }));
    const source = await screen.findByLabelText("Markdown source");
    (source as HTMLTextAreaElement).setSelectionRange(0, 5);
    fireEvent.select(source);
    await waitFor(() => {
      expect(screen.getByText(formatNoteStats(2, 1))).toBeTruthy();
    });
  });

  it("shows the goal ring, and a tick once the goal is met", async () => {
    const format = new Intl.NumberFormat();
    const nearest = vi.fn(async () => goalStats());
    installApi({ getNearestWordGoal: nearest });
    const view = renderWithQuery(
      <MarkdownPaneProvider>
        <ModeHarness />
      </MarkdownPaneProvider>,
    );

    const label = `Word goal for Manuscript: ${format.format(18240)} of ${format.format(50000)} words since start`;
    await waitFor(() => {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    });
    expect(view.container.querySelector("circle")).toBeTruthy();
    view.unmount();

    nearest.mockResolvedValue(goalStats({ met: true, sinceStart: 50_000 }));
    const met = renderWithQuery(
      <MarkdownPaneProvider>
        <ModeHarness />
      </MarkdownPaneProvider>,
    );
    const metLabel = `Word goal for Manuscript: ${format.format(50000)} of ${format.format(50000)} words since start`;
    await waitFor(() => {
      expect(screen.getByRole("button", { name: metLabel })).toBeTruthy();
    });
    expect(met.container.querySelector("circle")).toBeNull();
  });
});

describe("folder goal popover", () => {
  it("sets the default target on Enter and closes on Escape", async () => {
    const api = installApi();
    const onOpenChange = vi.fn();
    renderWithQuery(
      <FolderGoalPopover
        folderId={FOLDER_ID}
        folderName="Manuscript"
        open
        onOpenChange={onOpenChange}
      >
        <span>Goal</span>
      </FolderGoalPopover>,
    );

    expect(await screen.findByText("Word goal · Manuscript")).toBeTruthy();
    expect(screen.getByText("Since start")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear goal" })).toBeNull();

    fireEvent.keyDown(screen.getByLabelText("Word goal target"), { key: "Enter" });
    await waitFor(() => {
      expect(api.setFolderWordGoal).toHaveBeenCalledWith(FOLDER_ID, 50_000);
    });

    fireEvent.keyDown(screen.getByLabelText("Word goal target"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("copies today's raw count", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    installApi({ getFolderWordGoal: vi.fn(async () => goalStats({ today: 1667 })) });
    renderWithQuery(
      <FolderGoalPopover folderId={FOLDER_ID} folderName="Manuscript" open>
        <span>Goal</span>
      </FolderGoalPopover>,
    );

    expect(await screen.findByRole("button", { name: "Clear goal" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy today's word count" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("1667");
    });
  });
});
