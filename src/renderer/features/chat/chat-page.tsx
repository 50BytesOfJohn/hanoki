import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Cancel01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Key } from "@heroui/react";
import { Button, InputGroup, ListBox, Select, TextField, Tooltip } from "@heroui/react";

import {
  useChatCanStop,
  ChatContextProvider,
  useChatRegenerateMessage,
  useChatIsInteractionLocked,
  useChatIsStreaming,
  useChatMessages,
  useChatModelId,
  useChatSendMessage,
  useChatStop,
  useSetChatModelId,
  resolveModelId,
} from "@/features/chat/chat-context";
import { getChatQueryOptions } from "@/queries/chats";
import { ChatScrollToBottomProvider } from "@/features/chat/chat-scroll-context";
import { useChatScrollActions } from "@/features/chat/chat-scroll-actions-context";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { getProviderIconById } from "@/lib/provider-icons";
import { cn } from "@/lib/utils";
import { listEnabledModelsQueryOptions } from "@/queries/models";
import { listProvidersQueryOptions } from "@/queries/providers";
import { globalChatSettingsQueryOptions } from "@/queries/settings";
import { useSystemStore, selectAiServerPort, selectAiServerReady } from "@/stores/system-store";
import { ChatMessageHotkeys } from "./chat-message-hotkeys";
import { useWorkspaceStore } from "../workspace/store";
import { Conversation } from "./conversation";

const STOP_GENERATION_HOTKEY = { key: ".", mod: true } as const;
const STOP_GENERATION_SHORTCUT_LABEL = "Cmd/Ctrl + .";
const MESSAGE_NAVIGATION_TOP_OFFSET = 24;
const MESSAGE_NAVIGATION_VISIBILITY_PADDING = 8;

export function ChatPage() {
  const currentChatId = useWorkspaceStore((s) => s.currentChatId);

  if (currentChatId) {
    return <ActiveChatView chatId={currentChatId} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6">
      <p className="text-muted-foreground">No chat selected. Open a chat from the sidebar.</p>
    </div>
  );
}

function ActiveChatView({ chatId }: { chatId: string }) {
  const serverStatus = useSystemStore((s) => s.aiServer.status);
  const serverError = useSystemStore((s) => s.aiServer.error);
  const port = useSystemStore(selectAiServerPort);
  const isReady = useSystemStore(selectAiServerReady);

  const { data: enabledModels = [] } = useQuery(listEnabledModelsQueryOptions);
  const enabledModelIds = React.useMemo(
    () => enabledModels.map((model) => model.id),
    [enabledModels],
  );
  const apiUrl = port ? `http://127.0.0.1:${port}/api/chat` : "";

  const { data: chat, error: chatError } = useQuery(getChatQueryOptions(chatId));
  const initialModelId = React.useMemo(
    () => resolveModelId(enabledModelIds, chat?.settings.modelId ?? null),
    [chat?.settings.modelId, enabledModelIds],
  );
  const chatErrorMessage =
    chatError instanceof Error && chatError.message.trim() ? chatError.message : null;

  if (serverStatus === "starting" || serverStatus === "idle") {
    return (
      <div className="flex-1 mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
        <p className="text-sm text-muted-foreground">AI server starting…</p>
      </div>
    );
  }

  if (serverStatus === "error") {
    return (
      <div className="flex-1 mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
        <p className="text-sm text-destructive">AI server failed to start: {serverError}</p>
      </div>
    );
  }

  if (!isReady || enabledModels.length === 0) {
    return (
      <div className="flex-1 mx-auto flex w-full max-w-4xl flex-col px-6 py-6">
        <p className="text-sm text-muted-foreground">
          {enabledModels.length === 0 ? "Enable a model in Settings to start chatting." : ""}
        </p>
      </div>
    );
  }

  if (chatErrorMessage) {
    return (
      <div className="flex-1 mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
        <p className="text-sm text-destructive">{chatErrorMessage}</p>
      </div>
    );
  }

  return (
    <ChatContextProvider
      key={chatId}
      chatId={chatId}
      apiUrl={apiUrl}
      initialModelId={initialModelId}
      enabledModelIds={enabledModelIds}
    >
      <ActiveChatContent />
    </ChatContextProvider>
  );
}

function ActiveChatContent() {
  const [input, setInput] = React.useState("");
  const modelId = useChatModelId();
  const messages = useChatMessages();
  const sendMessage = useChatSendMessage();
  const regenerateMessage = useChatRegenerateMessage();
  const stopChat = useChatStop();
  const canStop = useChatCanStop();
  const isInteractionLocked = useChatIsInteractionLocked();
  const isStreaming = useChatIsStreaming();
  const { containerRef, anchorRef, scrollToBottom } = useScrollToBottom(isStreaming);
  const jumpToMessage = React.useCallback(
    (direction: "next" | "previous") => {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      const messageElements = Array.from(
        container.querySelectorAll<HTMLElement>("[data-chat-message-id]"),
      );

      if (messageElements.length === 0) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const composer = container.querySelector<HTMLElement>("[data-chat-composer-shell='true']");
      const composerRect = composer?.getBoundingClientRect();
      const viewportTop = containerRect.top + MESSAGE_NAVIGATION_VISIBILITY_PADDING;
      const viewportBottom =
        composerRect &&
        composerRect.top < containerRect.bottom &&
        composerRect.bottom > containerRect.top
          ? Math.min(containerRect.bottom, composerRect.top) - MESSAGE_NAVIGATION_VISIBILITY_PADDING
          : containerRect.bottom - MESSAGE_NAVIGATION_VISIBILITY_PADDING;

      const visibleMessageIndexes: number[] = [];
      let lastMessageBeforeViewportIndex = -1;
      let firstMessageAfterViewportIndex = messageElements.length;

      for (let index = 0; index < messageElements.length; index += 1) {
        const rect = messageElements[index].getBoundingClientRect();

        if (rect.bottom > viewportTop && rect.top < viewportBottom) {
          visibleMessageIndexes.push(index);
        } else if (rect.bottom <= viewportTop) {
          lastMessageBeforeViewportIndex = index;
        } else if (
          firstMessageAfterViewportIndex === messageElements.length &&
          rect.top >= viewportBottom
        ) {
          firstMessageAfterViewportIndex = index;
        }
      }

      const currentIndex =
        direction === "next"
          ? (visibleMessageIndexes.at(-1) ?? lastMessageBeforeViewportIndex)
          : (visibleMessageIndexes.at(0) ?? firstMessageAfterViewportIndex);
      const targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
      const target = messageElements[targetIndex];

      if (!target) {
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const top =
        container.scrollTop + targetRect.top - containerRect.top - MESSAGE_NAVIGATION_TOP_OFFSET;

      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    },
    [containerRef],
  );
  const scrollToTop = React.useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [containerRef]);
  const { registerScrollActions } = useChatScrollActions();

  React.useEffect(() => {
    registerScrollActions({ scrollToTop, scrollToBottom });
    return () => registerScrollActions(null);
  }, [registerScrollActions, scrollToTop, scrollToBottom]);
  const { data: globalChatSettings } = useQuery(globalChatSettingsQueryOptions);
  const lastMessage = messages.at(-1) ?? null;
  const lastUserMessageId = lastMessage?.role === "user" ? lastMessage.id : null;

  const promptStickyPosition = globalChatSettings?.promptStickyPosition ?? true;
  const submitBehavior = globalChatSettings?.formSubmitBehavior ?? "enter";

  const stopGeneration = React.useCallback(() => {
    if (!canStop) {
      return;
    }

    void stopChat();
  }, [canStop, stopChat]);

  const submitMessage = React.useCallback(() => {
    if (!modelId || !input.trim() || isInteractionLocked) {
      return false;
    }

    scrollToBottom();
    void sendMessage({
      text: input,
      metadata: {
        parentId: messages.at(-1)?.id ?? null,
      },
    });
    setInput("");
    return true;
  }, [input, isInteractionLocked, messages, modelId, scrollToBottom, sendMessage]);

  useHotkey(
    "Enter",
    (event) => {
      if (!isComposerInputEvent(event)) {
        return;
      }

      if (submitBehavior !== "enter" || event.isComposing) {
        return;
      }

      if (submitMessage()) {
        event.preventDefault();
      }
    },
    {
      enabled: !isInteractionLocked,
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
    },
  );

  useHotkey(
    {
      key: "Enter",
      mod: true,
    },
    (event) => {
      if (!isComposerInputEvent(event)) {
        return;
      }

      if (submitBehavior !== "mod-enter" || event.isComposing) {
        return;
      }

      if (submitMessage()) {
        event.preventDefault();
      }
    },
    {
      enabled: !isInteractionLocked,
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
    },
  );

  useHotkey(
    STOP_GENERATION_HOTKEY,
    (event) => {
      event.preventDefault();
      stopGeneration();
    },
    {
      enabled: canStop,
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
    },
  );

  useHotkey(
    "Alt+ArrowUp",
    (event) => {
      event.preventDefault();
      jumpToMessage("previous");
    },
    {
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
    },
  );

  useHotkey(
    "Alt+ArrowDown",
    (event) => {
      event.preventDefault();
      jumpToMessage("next");
    },
    {
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
    },
  );

  return (
    <ChatScrollToBottomProvider scrollToBottom={scrollToBottom}>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto scrollbar">
        <ChatMessageHotkeys />

        <div className="flex flex-col min-h-full justify-end">
          <Conversation />

          <div
            data-chat-composer-shell="true"
            className={cn(
              "mt-24 mx-auto w-4xl max-w-[calc(100%-4rem)] mb-4",
              promptStickyPosition ? "sticky bottom-4" : null,
            )}
          >
            {lastUserMessageId && !canStop ? (
              <div className="mb-3 flex justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={!modelId || isInteractionLocked}
                  onPress={() => {
                    scrollToBottom();
                    void regenerateMessage({ messageId: lastUserMessageId });
                  }}
                >
                  Generate
                </Button>
              </div>
            ) : null}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitMessage();
              }}
            >
              <TextField aria-label="Chat message" value={input} onChange={setInput} fullWidth>
                <InputGroup
                  variant="secondary"
                  fullWidth
                  className="flex flex-col gap-2 rounded-3xl py-2"
                >
                  <InputGroup.TextArea
                    data-chat-composer-input="true"
                    placeholder="Ask, Search or Chat…"
                    rows={1}
                    className="resize-none w-full px-3.5 py-1 max-h-[24rem] overflow-y-auto [field-sizing:content]"
                  />
                  <InputGroup.Suffix className="flex w-full items-center gap-1.5 px-2 py-0">
                    <ModelSelector />
                    <div className="ml-auto">
                      {canStop ? (
                        <Tooltip delay={0}>
                          <Button
                            isIconOnly
                            aria-label="Stop"
                            variant="primary"
                            size="sm"
                            type="button"
                            onPress={stopGeneration}
                          >
                            <HugeiconsIcon icon={Cancel01Icon} />
                          </Button>
                          <Tooltip.Content>Stop {STOP_GENERATION_SHORTCUT_LABEL}</Tooltip.Content>
                        </Tooltip>
                      ) : (
                        <Tooltip delay={0}>
                          <Button
                            type="submit"
                            aria-label="Send"
                            size="sm"
                            isDisabled={!modelId || !input.trim() || isInteractionLocked}
                          >
                            <HugeiconsIcon icon={SentIcon} />
                            Send
                          </Button>
                          <Tooltip.Content>Send</Tooltip.Content>
                        </Tooltip>
                      )}
                    </div>
                  </InputGroup.Suffix>
                </InputGroup>
              </TextField>
            </form>
          </div>

          <div ref={anchorRef} aria-hidden="true" />
        </div>
      </div>
    </ChatScrollToBottomProvider>
  );
}

function isComposerInputEvent(event: KeyboardEvent): boolean {
  if (!(event.target instanceof HTMLElement)) {
    return false;
  }

  return event.target.closest("[data-chat-composer-input='true']") !== null;
}

function ModelSelector() {
  const { data: enabledModels = [] } = useQuery(listEnabledModelsQueryOptions);
  const { data: providers = [] } = useQuery(listProvidersQueryOptions);
  const isInteractionLocked = useChatIsInteractionLocked();
  const modelId = useChatModelId();
  const setModelId = useSetChatModelId();

  return (
    <Select
      aria-label="Select model"
      placeholder="Select model"
      variant="secondary"
      value={modelId ?? ""}
      onChange={(value: Key | Key[] | null) => setModelId((value as string) || null)}
      isDisabled={isInteractionLocked}
    >
      <Select.Trigger>
        <Select.Value>
          {({ isPlaceholder, state }) => {
            if (isPlaceholder || state.selectedItems.length === 0) {
              return <span>Select model</span>;
            }
            const selected = enabledModels.find((m) => m.id === state.selectedItems[0]?.key);
            const provider = selected
              ? (providers.find((p) => p.id === selected.providerId) ?? null)
              : null;
            const ProviderIcon = provider ? getProviderIconById(provider.catalogId) : null;
            return (
              <span className="flex items-center gap-2">
                {ProviderIcon ? <ProviderIcon className="size-4" /> : null}
                <span>{selected?.displayName ?? selected?.providerModelId ?? "Select model"}</span>
              </span>
            );
          }}
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover placement="top start">
        <ListBox>
          {enabledModels.map((m) => {
            const provider = providers.find((p) => p.id === m.providerId);
            const ProviderIcon = provider ? getProviderIconById(provider.catalogId) : null;
            return (
              <ListBox.Item key={m.id} id={m.id} textValue={m.displayName ?? m.providerModelId}>
                <span className="flex items-center gap-2">
                  {ProviderIcon ? <ProviderIcon className="size-4" /> : null}
                  <span>{m.displayName ?? m.providerModelId}</span>
                </span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            );
          })}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
