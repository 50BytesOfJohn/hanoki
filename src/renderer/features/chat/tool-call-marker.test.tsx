// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DynamicToolUIPart } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolCallMarker } from "./tool-call-marker";

const { moveItem, updateTitle } = vi.hoisted(() => ({
  moveItem: vi.fn(),
  updateTitle: vi.fn(),
}));

vi.mock("@/api/items", () => ({ itemsApi: { move: moveItem, updateTitle } }));
vi.mock("@/features/markdown/markdown-session", () => ({
  flushOpenMarkdownEditors: () => Promise.resolve(),
}));

const base = { type: "dynamic-tool", toolName: "terminalRun", toolCallId: "call-1" } as const;
const input = { command: "pnpm test" };

function renderPart(part: DynamicToolUIPart, isAnimating = true) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToolCallMarker isAnimating={isAnimating} parts={[part]} toolName={part.toolName} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("ToolCallMarker", () => {
  it("marks a call in progress as a running line", () => {
    renderPart({ ...base, state: "input-available", input });

    const title = screen.getByText("Running pnpm test…");
    expect(title.closest("[data-slot=trace-line]")?.getAttribute("data-status")).toBe("running");
  });

  it("stops the running state when the stream ended before the call finished", () => {
    renderPart({ ...base, state: "input-available", input }, false);

    expect(screen.getByText("Stopped before finishing")).toBeDefined();
    expect(screen.queryByText("Running pnpm test…")).toBeNull();
  });

  it("keeps a command's raw output behind the technical details popover", async () => {
    renderPart({
      ...base,
      state: "output-available",
      input,
      output: { exitCode: 1, stdout: "1 test failed" },
    });

    expect(screen.getByText("Finished with a problem")).toBeDefined();
    expect(screen.queryByText("1 test failed")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));

    expect(await screen.findByText("1 test failed")).toBeDefined();
  });

  it("shows a rename as old and new name, and reverts to the old name", async () => {
    updateTitle.mockResolvedValue({});
    renderPart({
      ...base,
      toolName: "hanokiRenameItem",
      state: "output-available",
      input: { kind: "chat", id: "chat-1", newName: "New title" },
      output: {
        before: { kind: "chat", id: "chat-1", name: "Old title" },
        after: { kind: "chat", id: "chat-1", name: "New title" },
      },
    });

    expect(screen.queryByText("Old title")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Renamed to/ }));

    expect(screen.getByText("Old title")).toBeDefined();
    expect(screen.getByText("New title")).toBeDefined();
    expect(screen.getByRole("button", { name: "Open" })).toBeDefined();
    expect(screen.queryByText(/"id"/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));

    await waitFor(() => expect(updateTitle).toHaveBeenCalledWith("chat-1", "Old title"));
  });

  it("moves items back to the folders they came from", async () => {
    moveItem.mockResolvedValue({});
    renderPart({
      ...base,
      toolName: "hanokiMoveItems",
      state: "output-available",
      input: {},
      output: {
        destinationFolderId: "folder-2",
        moved: [{ kind: "chat", id: "chat-1", name: "Draft", previousFolderId: "folder-1" }],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /Moved/ }));
    fireEvent.click(screen.getByRole("button", { name: "Revert" }));

    await waitFor(() => expect(moveItem).toHaveBeenCalledWith("chat-1", "folder-1"));
  });

  it("offers no revert for a move made before origins were recorded", () => {
    renderPart({
      ...base,
      toolName: "hanokiMoveItems",
      state: "output-available",
      input: {},
      output: { destinationFolderId: null, moved: [{ kind: "chat", id: "c", name: "Draft" }] },
    });

    fireEvent.click(screen.getByRole("button", { name: /Moved/ }));

    expect(screen.getByText("to the top level")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Revert" })).toBeNull();
  });

  it("folds repeated calls into one counted row that lists each result", () => {
    const rename = (id: string, from: string, to: string): DynamicToolUIPart => ({
      ...base,
      toolName: "hanokiRenameItem",
      toolCallId: id,
      state: "output-available",
      input: { kind: "chat", id, newName: to },
      output: {
        before: { kind: "chat", id, name: from },
        after: { kind: "chat", id, name: to },
      },
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToolCallMarker
          isAnimating={false}
          parts={[rename("a", "One", "Uno"), rename("b", "Two", "Dos")]}
          toolName="hanokiRenameItem"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Renamed 2 chats/ }));

    expect(screen.getByText("Uno")).toBeDefined();
    expect(screen.getByText("Dos")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Revert" })).toHaveLength(2);
  });

  it("shows a failed call as an error with its message", () => {
    renderPart({ ...base, state: "output-error", input, errorText: "spawn ENOENT" });

    const trigger = screen.getByRole("button", { name: /Command failed/ });
    expect(trigger.querySelector("[data-slot=trace-line]")?.getAttribute("data-status")).toBe(
      "error",
    );

    fireEvent.click(trigger);

    expect(screen.getByText("spawn ENOENT")).toBeDefined();
  });
});
