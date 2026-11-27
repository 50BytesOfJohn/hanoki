import { isToolUIPart, type ChatStatus } from "ai";
import type { Chat } from "@ai-sdk/react";
import { create } from "zustand";

import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { createTiptapMessageParts } from "@shared/tiptap/document";
import { useChatStore } from "./chat-store";
import {
  EMPTY_CHAT_QUEUE,
  nextSendable,
  type ChatQueue,
  type ChatQueuePauseReason,
} from "./chat-queue";

/**
 * Messages queued per chat while a reply generates. The queue lives outside the chat view so it
 * keeps draining when the user switches away: each chat's status is watched from here, and the
 * next message goes out once the reply has settled.
 */
interface ChatQueueStoreState {
  queues: Record<string, ChatQueue>;
  update: (chatId: string, fn: (queue: ChatQueue) => ChatQueue) => void;
}

export const useChatQueueStore = create<ChatQueueStoreState>((set) => ({
  queues: {},
  update: (chatId, fn) =>
    set((state) => {
      const current = state.queues[chatId] ?? EMPTY_CHAT_QUEUE;
      const next = fn(current);
      if (next === current) return state;
      const queues = { ...state.queues };
      if (next.items.length === 0 && next.editingId === null) delete queues[chatId];
      else queues[chatId] = next;
      return { queues };
    }),
}));

export function getChatQueue(chatId: string): ChatQueue {
  return useChatQueueStore.getState().queues[chatId] ?? EMPTY_CHAT_QUEUE;
}

export function updateChatQueue(chatId: string, fn: (queue: ChatQueue) => ChatQueue) {
  useChatQueueStore.getState().update(chatId, fn);
  scheduleQueueFlush(chatId);
}

export function useChatQueue(chatId: string): ChatQueue {
  return useChatQueueStore((state) => state.queues[chatId] ?? EMPTY_CHAT_QUEUE);
}

type QueueSender = (item: { document: ChatQueue["items"][number]["document"] }) => void;

/** The model each chat's queue sends with, kept current by the mounted chat. */
const modelIds = new Map<string, string>();
/** Reasons the mounted chat asks the queue to wait (history reload, inline edit, …). */
const holds = new Map<string, Set<string>>();
/** The mounted chat's own send, so queued messages get the same side effects as typed ones. */
const senders = new Map<string, QueueSender>();

export function setChatQueueModelId(chatId: string, modelId: string | null) {
  if (modelId) modelIds.set(chatId, modelId);
  else modelIds.delete(chatId);
}

export function setChatQueueHold(chatId: string, reason: string, isHeld: boolean) {
  const reasons = holds.get(chatId) ?? new Set<string>();
  if (isHeld) {
    reasons.add(reason);
    holds.set(chatId, reasons);
    return;
  }
  if (!reasons.delete(reason)) return;
  if (reasons.size === 0) holds.delete(chatId);
  scheduleQueueFlush(chatId);
}

export function registerChatQueueSender(chatId: string, sender: QueueSender) {
  senders.set(chatId, sender);
  return () => {
    if (senders.get(chatId) === sender) senders.delete(chatId);
  };
}

export function pauseChatQueue(chatId: string, reason: ChatQueuePauseReason) {
  useChatQueueStore
    .getState()
    .update(chatId, (queue) =>
      queue.items.length === 0 || queue.pausedBy === reason
        ? queue
        : { ...queue, pausedBy: reason },
    );
}

export function resumeChatQueue(chatId: string) {
  updateChatQueue(chatId, (queue) =>
    queue.pausedBy === null ? queue : { ...queue, pausedBy: null },
  );
}

/** True while the trailing reply waits on the user to approve a tool call. */
export function hasPendingApproval(messages: readonly HanokiUiMessage[]): boolean {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return false;
  return last.parts.some((part) => isToolUIPart(part) && part.state === "approval-requested");
}

const scheduledFlushes = new Set<string>();

/**
 * Deferred a tick: a status change notifies every listener synchronously, and the mounted chat
 * has to place its history-reload hold before the queue looks.
 */
export function scheduleQueueFlush(chatId: string) {
  if (scheduledFlushes.has(chatId)) return;
  scheduledFlushes.add(chatId);
  setTimeout(() => {
    scheduledFlushes.delete(chatId);
    flushChatQueue(chatId);
  }, 0);
}

function flushChatQueue(chatId: string) {
  const item = nextSendable(getChatQueue(chatId));
  if (!item || holds.has(chatId)) return;

  const chat = useChatStore.getState().chatEntries.get(chatId);
  // "error" counts as idle: the queue only gets here after the user resumed it.
  const isIdle = chat?.status === "ready" || chat?.status === "error";
  if (!chat || !isIdle || hasPendingApproval(chat.messages)) return;

  const sender = senders.get(chatId);
  const modelId = modelIds.get(chatId);
  if (!sender && !modelId) return;

  useChatQueueStore.getState().update(chatId, (queue) => ({
    ...queue,
    items: queue.items.filter((candidate) => candidate.id !== item.id),
  }));

  if (sender) {
    sender(item);
    return;
  }

  void chat.sendMessage(
    {
      parts: createTiptapMessageParts(item.document),
      metadata: { parentId: chat.messages.at(-1)?.id ?? null },
    },
    { body: { modelId } },
  );
}

const watchedChats = new WeakSet<Chat<HanokiUiMessage>>();

function watchChat(chatId: string, chat: Chat<HanokiUiMessage>) {
  if (watchedChats.has(chat)) return;
  watchedChats.add(chat);
  let prevStatus: ChatStatus = chat.status;
  chat["~registerStatusCallback"](() => {
    const status = chat.status;
    const wasBusy = prevStatus === "streaming" || prevStatus === "submitted";
    prevStatus = status;
    if (getChatQueue(chatId).items.length === 0) return;
    // A failed reply would likely fail the next one too: wait for the user.
    if (status === "error") {
      pauseChatQueue(chatId, "error");
      return;
    }
    if (wasBusy && status === "ready") scheduleQueueFlush(chatId);
  });
}

function watchAllChats(entries: Map<string, Chat<HanokiUiMessage>>) {
  for (const [chatId, chat] of entries) watchChat(chatId, chat);
}

watchAllChats(useChatStore.getState().chatEntries);
useChatStore.subscribe((state) => watchAllChats(state.chatEntries));
