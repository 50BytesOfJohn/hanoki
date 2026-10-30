// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat } from "@ai-sdk/react";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";

vi.mock("@/api/workspaces", () => ({
  workspaceApi: { getActive: async () => ({}), updateSettings: async () => {} },
}));
vi.mock("@/api/items", () => ({ itemsApi: { get: async () => ({}) } }));

const { useWorkspaceStore } = await import("@/features/workspace/store");
const { useChatStore } = await import("./chat-store");
await import("./preview-tab-retention");

function addFakeChat(chatId: string, initialStatus: Chat<HanokiUiMessage>["status"] = "ready") {
  const listeners = new Set<() => void>();
  const chat = {
    status: initialStatus,
    "~registerStatusCallback": (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  useChatStore.setState((state) => ({
    chatEntries: new Map(state.chatEntries).set(chatId, chat as unknown as Chat<HanokiUiMessage>),
  }));
  return {
    setStatus: (status: Chat<HanokiUiMessage>["status"]) => {
      chat.status = status;
      for (const listener of listeners) listener();
    },
  };
}

const previewTab = () => useWorkspaceStore.getState().tabs.find((tab) => tab.preview);

describe("preview tab retention", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().closeAllTabs();
  });

  it("keeps a preview tab once its chat starts generating", () => {
    const chat = addFakeChat("idle-then-busy");
    useWorkspaceStore.getState().openItem("idle-then-busy", "chat");
    expect(previewTab()).toBeDefined();

    chat.setStatus("submitted");
    expect(previewTab()).toBeUndefined();

    useWorkspaceStore.getState().openItem("next", "chat");
    expect(useWorkspaceStore.getState().tabs).toHaveLength(2);
  });

  it("keeps a chat that was already generating when previewed", () => {
    addFakeChat("already-busy", "streaming");
    useWorkspaceStore.getState().openItem("already-busy", "chat");
    expect(previewTab()).toBeUndefined();
  });

  it("leaves idle previews replaceable", () => {
    addFakeChat("idle-a");
    addFakeChat("idle-b");
    useWorkspaceStore.getState().openItem("idle-a", "chat");
    useWorkspaceStore.getState().openItem("idle-b", "chat");
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
  });
});
