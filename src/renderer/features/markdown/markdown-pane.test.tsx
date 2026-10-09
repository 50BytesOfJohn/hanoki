// @vitest-environment jsdom

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FolderWordGoalStats, IpcApi, MarkdownInfo } from "@shared/ipc";

import { toastManager } from "@/components/ui/toast";

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
    installApi({ getNearestWordGoal: nearest, getFolderWordGoal: nearest });
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
    expect(screen.queryByText("Since start")).toBeNull();
    expect(screen.queryByText("Today")).toBeNull();
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

    const clearGoal = await screen.findByRole("button", { name: "Clear goal" });
    const setGoal = screen.getByRole("button", { name: "Set goal" });
    expect(clearGoal.className).toContain("h-7");
    expect(clearGoal.className).toContain("w-full");
    expect(setGoal.className).toContain("h-7");
    expect(setGoal.className).toContain("w-full");
    expect(screen.getByText("Since start").parentElement?.querySelector(".size-6")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy today's word count" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("1667");
    });
  });

  it("rejects an out-of-range goal inline and does not save", async () => {
    const api = installApi();
    renderWithQuery(
      <FolderGoalPopover folderId={FOLDER_ID} folderName="Manuscript" open>
        <span>Goal</span>
      </FolderGoalPopover>,
    );
    const input = await screen.findByLabelText("Word goal target");

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("Enter a goal of 1 or more")).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(api.setFolderWordGoal).not.toHaveBeenCalled();

    for (const value of ["-3", "", "10000001"]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByLabelText("Word goal target").getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByText(/Enter a goal of/)).toBeTruthy();
    }
    expect(api.setFolderWordGoal).not.toHaveBeenCalled();
  });

  it("toasts plain copy when saving a goal fails", async () => {
    const add = vi.spyOn(toastManager, "add");
    installApi({
      setFolderWordGoal: vi.fn(async () => {
        throw new Error('Error invoking remote method "folders:setWordGoal": denied');
      }),
    });
    renderWithQuery(
      <FolderGoalPopover folderId={FOLDER_ID} folderName="Manuscript" open>
        <span>Goal</span>
      </FolderGoalPopover>,
    );
    fireEvent.keyDown(await screen.findByLabelText("Word goal target"), { key: "Enter" });
    await waitFor(() => {
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Word goal could not be saved",
          description: "The goal was not saved.",
        }),
      );
    });
    expect(JSON.stringify(add.mock.calls)).not.toContain("Error invoking remote method");
    add.mockRestore();
  });

  it("shows the footer goal numbers in the popover", async () => {
    const nearest = vi.fn(async () => goalStats({ sinceStart: 5, today: 5, targetWords: 1000 }));
    const byFolder = vi.fn(async () => goalStats({ sinceStart: 6, today: 6, targetWords: 1000 }));
    installApi({ getNearestWordGoal: nearest, getFolderWordGoal: byFolder });
    renderWithQuery(
      <MarkdownPaneProvider>
        <ModeHarness />
      </MarkdownPaneProvider>,
    );
    const format = new Intl.NumberFormat();
    const label = `Word goal for Manuscript: ${format.format(5)} of ${format.format(1000)} words since start`;
    fireEvent.click(await screen.findByRole("button", { name: label }));
    expect(await screen.findByText("Since start")).toBeTruthy();
    expect(screen.getAllByText(format.format(5)).length).toBeGreaterThan(0);
    expect(screen.queryByText(format.format(6))).toBeNull();
    expect(byFolder).not.toHaveBeenCalled();
    expect(nearest).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["en-US", "1.000", "Enter a whole number, like 50,000"],
    ["en-US", "50.000", "Enter a whole number, like 50,000"],
    ["de-DE", "50,000", "Enter a whole number, like 50.000"],
    ["de-DE", "1,5", "Enter a whole number, like 50.000"],
    [
      "fr-FR",
      "50.000",
      `Enter a whole number, like ${new Intl.NumberFormat("fr-FR").format(50_000)}`,
    ],
  ] as const)(
    "rejects %s %s because it contains the decimal separator",
    async (locale, value, message) => {
      const api = installApi();
      renderWithQuery(
        <FolderGoalPopover folderId={FOLDER_ID} folderName="Manuscript" locale={locale} open>
          <span>Goal</span>
        </FolderGoalPopover>,
      );
      const input = await screen.findByLabelText("Word goal target");
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(document.getElementById("word-goal-error")?.textContent).toBe(message);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(api.setFolderWordGoal).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["en-US", "1.000", "1", "Enter a whole number, like 50,000"],
    ["en-US", "50.000", "50", "Enter a whole number, like 50,000"],
    ["de-DE", "50,000", "50", "Enter a whole number, like 50.000"],
  ] as const)(
    "rejects %s %s after blur reformats it",
    async (locale, value, reformatted, message) => {
      const api = installApi();
      renderWithQuery(
        <FolderGoalPopover folderId={FOLDER_ID} folderName="Manuscript" locale={locale} open>
          <span>Goal</span>
        </FolderGoalPopover>,
      );
      const input = (await screen.findByLabelText("Word goal target")) as HTMLInputElement;
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      expect(input.value).toBe(reformatted);
      fireEvent.click(screen.getByRole("button", { name: "Set goal" }));
      expect(await screen.findByText(message)).toBeTruthy();
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(api.setFolderWordGoal).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["de-DE", "50.000"],
    ["fr-FR", "50 000"],
    ["fr-FR", "50\u00a0000"],
    ["fr-FR", "50\u202f000"],
    ["pl-PL", "50 000"],
    ["pl-PL", "50\u00a0000"],
    ["pl-PL", "50\u202f000"],
    ["de-CH", "50'000"],
    ["de-CH", "50\u2019000"],
    ["en-US", "50,000"],
  ] as const)("saves %s grouping %j", async (locale, value) => {
    const api = installApi();
    renderWithQuery(
      <FolderGoalPopover folderId={FOLDER_ID} folderName="Manuscript" locale={locale} open>
        <span>Goal</span>
      </FolderGoalPopover>,
    );
    const input = (await screen.findByLabelText("Word goal target")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    input.focus();
    input.setSelectionRange(0, input.value.length);
    fireEvent.paste(input, { clipboardData: { getData: () => value } });
    expect(input.value).toBe(value);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(api.setFolderWordGoal).toHaveBeenCalledWith(FOLDER_ID, 50_000);
    });
  });

  it.each(["en-US", "de-DE", "fr-FR", "de-CH", "ru-RU"])(
    "saves a %s grouped goal from the parsed number",
    async (locale) => {
      const api = installApi();
      renderWithQuery(
        <FolderGoalPopover folderId={FOLDER_ID} folderName="Manuscript" locale={locale} open>
          <span>Goal</span>
        </FolderGoalPopover>,
      );
      const input = await screen.findByLabelText("Word goal target");
      fireEvent.change(input, { target: { value: new Intl.NumberFormat(locale).format(1_000) } });
      fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() => {
        expect(api.setFolderWordGoal).toHaveBeenCalledWith(FOLDER_ID, 1_000);
      });
    },
  );
});
