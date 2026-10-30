// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat } from "@ai-sdk/react";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";

const listMessages = vi.fn<() => Promise<HanokiUiMessage[]>>();

vi.mock("@/api/messages", () => ({ messagesApi: { listMessages } }));

const { loadChatHistory, useChatStatus, useChatStore } = await import("./chat-store");

function message(id: string): HanokiUiMessage {
  return { id, role: "user", parts: [{ type: "text", text: id }] };
}

function fakeChat(messages: HanokiUiMessage[] = []) {
  const listeners = new Set<() => void>();
  const chat = {
    id: "chat-1",
    status: "ready" as Chat<HanokiUiMessage>["status"],
    messages,
    "~registerStatusCallback": (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    chat: chat as unknown as Chat<HanokiUiMessage>,
    setStatus(status: Chat<HanokiUiMessage>["status"]) {
      chat.status = status;
      for (const listener of listeners) listener();
    },
  };
}

beforeEach(() => {
  listMessages.mockReset();
  useChatStore.setState({ chatEntries: new Map() });
});

afterEach(cleanup);

describe("loadChatHistory", () => {
  it("shares one read between a preload and the chat that opens mid-load", async () => {
    listMessages.mockResolvedValue([message("a")]);
    const { chat } = fakeChat();

    await Promise.all([loadChatHistory(chat), loadChatHistory(chat)]);

    expect(listMessages).toHaveBeenCalledTimes(1);
    expect(chat.messages.map(({ id }) => id)).toEqual(["a"]);
  });

  it("leaves a loaded chat alone", async () => {
    const { chat } = fakeChat([message("a")]);

    await loadChatHistory(chat);

    expect(listMessages).not.toHaveBeenCalled();
  });

  it("doesn't overwrite a message sent while the history was loading", async () => {
    let finish!: (messages: HanokiUiMessage[]) => void;
    listMessages.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { chat } = fakeChat();

    const load = loadChatHistory(chat);
    chat.messages = [message("sent")];
    finish([]);
    await load;

    expect(chat.messages.map(({ id }) => id)).toEqual(["sent"]);
  });

  it("retries after a failed read", async () => {
    listMessages.mockRejectedValueOnce(new Error("busy"));
    listMessages.mockResolvedValueOnce([message("a")]);
    const { chat } = fakeChat();

    await expect(loadChatHistory(chat)).rejects.toThrow("busy");
    await loadChatHistory(chat);

    expect(chat.messages.map(({ id }) => id)).toEqual(["a"]);
  });
});

describe("useChatStatus", () => {
  function Status() {
    return <span>{useChatStatus("chat-1") ?? "none"}</span>;
  }

  it("is right on the first render, without a frame of the old value", () => {
    const { chat, setStatus } = fakeChat();
    setStatus("streaming");
    useChatStore.setState({ chatEntries: new Map([["chat-1", chat]]) });

    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ""));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    render(<Status />);
    observer.disconnect();

    expect(seen).not.toContain("ready");
    expect(screen.getByText("streaming")).toBeDefined();
  });

  it("follows status changes and reports null for a chat that was never opened", () => {
    render(<Status />);
    expect(screen.getByText("none")).toBeDefined();

    const { chat, setStatus } = fakeChat();
    act(() => useChatStore.setState({ chatEntries: new Map([["chat-1", chat]]) }));
    expect(screen.getByText("ready")).toBeDefined();

    act(() => setStatus("submitted"));
    expect(screen.getByText("submitted")).toBeDefined();
  });
});
