import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { Add01Icon, AiWebBrowsingIcon, Cancel01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useChatCanStop,
  ChatContextProvider,
  useChatRegenerateMessage,
  useChatIsInteractionLocked,
  useChatIsStreaming,
  useChatId,
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
import { useUpdateChatSettings } from "@/mutations/chats";
import { cn } from "@/lib/utils";
import { listEnabledModelsQueryOptions } from "@/queries/models";
import { listProvidersQueryOptions } from "@/queries/providers";
import { globalChatSettingsQueryOptions } from "@/queries/settings";
import { useSystemStore, selectAiServerPort, selectAiServerReady } from "@/stores/system-store";
import type { ProviderModelInfo } from "@shared/ipc";
import { ChatMessageHotkeys } from "./chat-message-hotkeys";
import { useWorkspaceStore } from "../workspace/store";
import { Conversation } from "./conversation";
import { SumiPromptAction } from "./sumi-prompt-action";

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
      <p className="text-sm text-muted-foreground">
        No chat selected. Open a chat from the sidebar.
      </p>
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
  const chatId = useChatId();
  const [input, setInput] = React.useState(
    () => useWorkspaceStore.getState().chatDrafts[chatId] ?? "",
  );
  const inputRef = React.useRef(input);
  const saveDraft = useDebouncedCallback(
    (text: string) => useWorkspaceStore.getState().setChatDraft(chatId, text),
    { wait: 500 },
  );
  const updateInput = React.useCallback(
    (text: string) => {
      inputRef.current = text;
      setInput(text);
      saveDraft(text);
    },
    [saveDraft],
  );

  // Flush the draft on unmount so fast chat switches don't lose it to the debounce.
  React.useEffect(
    () => () => useWorkspaceStore.getState().setChatDraft(chatId, inputRef.current),
    [chatId],
  );
  const modelId = useChatModelId();
  const messages = useChatMessages();
  const sendMessage = useChatSendMessage();
  const regenerateMessage = useChatRegenerateMessage();
  const stopChat = useChatStop();
  const canStop = useChatCanStop();
  const isInteractionLocked = useChatIsInteractionLocked();
  const isStreaming = useChatIsStreaming();
  const { containerRef, anchorRef, scrollToBottom } = useScrollToBottom(chatId, isStreaming);
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
    updateInput("");
    return true;
  }, [input, isInteractionLocked, messages, modelId, scrollToBottom, sendMessage, updateInput]);

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
              "mt-12 mx-auto w-full max-w-3xl px-6 mb-3",
              promptStickyPosition ? "sticky bottom-3" : null,
            )}
          >
            {lastUserMessageId && !canStop ? (
              <div className="mb-3 flex justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!modelId || isInteractionLocked}
                  onClick={() => {
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
              {/* has-disabled overrides: InputGroup dims itself when ANY child is
                  disabled, and the Send button is disabled whenever the prompt is
                  empty — which made the sticky composer translucent over messages. */}
              <InputGroup className="flex-col gap-1.5 rounded-xl border-border bg-surface-secondary dark:bg-surface-secondary has-disabled:opacity-100 has-disabled:bg-surface-secondary dark:has-disabled:bg-surface-secondary py-2 shadow-lg shadow-black/20 transition-colors duration-100 has-[[data-slot=input-group-control]:focus-visible]:border-focus/50 has-[[data-slot=input-group-control]:focus-visible]:ring-0">
                <InputGroupTextarea
                  data-chat-composer-input="true"
                  aria-label="Chat message"
                  placeholder="Ask anything…"
                  rows={1}
                  value={input}
                  onChange={(event) => updateInput(event.target.value)}
                  className="w-full resize-none overflow-y-auto px-3 py-1 max-h-[24rem] min-h-0 text-[0.9375rem] [field-sizing:content]"
                />
                <InputGroupAddon
                  align="block-end"
                  className="flex w-full items-center gap-1.5 px-2 py-0"
                >
                  <WebToolsMenu />
                  <ModelSelector />
                  <div className="ml-auto flex items-center gap-1.5">
                    <SumiPromptAction
                      prompt={input}
                      isDisabled={isInteractionLocked}
                      onReplace={updateInput}
                    />
                    {canStop ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              aria-label="Stop"
                              size="icon-sm"
                              type="button"
                              onClick={stopGeneration}
                            />
                          }
                        >
                          <HugeiconsIcon icon={Cancel01Icon} />
                        </TooltipTrigger>
                        <TooltipContent>Stop {STOP_GENERATION_SHORTCUT_LABEL}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="submit"
                              aria-label="Send"
                              size="sm"
                              disabled={!modelId || !input.trim() || isInteractionLocked}
                            />
                          }
                        >
                          <HugeiconsIcon icon={SentIcon} data-icon="inline-start" />
                          Send
                        </TooltipTrigger>
                        <TooltipContent>Send</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </div>

          <div ref={anchorRef} aria-hidden="true" />
        </div>
      </div>
    </ChatScrollToBottomProvider>
  );
}

function WebToolsMenu() {
  const chatId = useChatId();
  const isInteractionLocked = useChatIsInteractionLocked();
  const { data: chat } = useQuery(getChatQueryOptions(chatId));
  const updateChatSettings = useUpdateChatSettings();
  const webEnabled = chat?.settings.webEnabled ?? false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-foreground"
            aria-label="Chat tools"
            aria-pressed={webEnabled}
            disabled={isInteractionLocked}
          />
        }
      >
        <HugeiconsIcon icon={Add01Icon} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            variant="switch"
            checked={webEnabled}
            disabled={updateChatSettings.isPending}
            onCheckedChange={(checked) => {
              updateChatSettings.mutate({
                id: chatId,
                input: { webEnabled: checked },
              });
            }}
          >
            <span className="flex items-center gap-2">
              <HugeiconsIcon icon={AiWebBrowsingIcon} />
              Web
            </span>
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isComposerInputEvent(event: KeyboardEvent): boolean {
  if (!(event.target instanceof HTMLElement)) {
    return false;
  }

  return event.target.closest("[data-chat-composer-input='true']") !== null;
}

function ModelSelector() {
  const chatId = useChatId();
  const { data: enabledModels = [] } = useQuery(listEnabledModelsQueryOptions);
  const { data: providers = [] } = useQuery(listProvidersQueryOptions);
  const isInteractionLocked = useChatIsInteractionLocked();
  const modelId = useChatModelId();
  const setModelId = useSetChatModelId();
  const updateChatSettings = useUpdateChatSettings();

  const selected = enabledModels.find((m) => m.id === modelId) ?? null;

  return (
    <Combobox
      items={enabledModels}
      value={selected}
      onValueChange={(model) => {
        const nextModelId = model?.id ?? null;
        setModelId(nextModelId);
        // Persist per chat so the selection survives tab switches (the
        // chat store is recreated from chat.settings.modelId on remount).
        updateChatSettings.mutate({ id: chatId, input: { modelId: nextModelId } });
      }}
      itemToStringValue={(model) => model.displayName ?? model.providerModelId}
      isItemEqualToValue={(item, value) => item.id === value.id}
      disabled={isInteractionLocked}
    >
      <ComboboxTrigger
        aria-label="Select model"
        className="inline-flex h-7 max-w-48 min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-[13px] text-foreground shadow-none transition-colors duration-100 hover:bg-hover dark:bg-transparent dark:hover:bg-hover [&_svg]:text-foreground"
      >
        <ComboboxValue>
          {(value: ProviderModelInfo | null) => {
            if (!value) {
              return <span>Select model</span>;
            }

            const provider = providers.find((p) => p.id === value.providerId);
            const ProviderIcon = provider ? getProviderIconById(provider.catalogId) : null;

            return (
              <span className="flex min-w-0 items-center gap-2">
                {ProviderIcon ? <ProviderIcon className="size-4 shrink-0" /> : null}
                <span className="truncate">{value.displayName ?? value.providerModelId}</span>
              </span>
            );
          }}
        </ComboboxValue>
      </ComboboxTrigger>
      <ComboboxContent side="top" align="start" className="w-72 min-w-72">
        <ComboboxInput placeholder="Search models…" showTrigger={false} />
        <ComboboxEmpty>No models found.</ComboboxEmpty>
        <ComboboxList>
          {(model: ProviderModelInfo) => {
            const provider = providers.find((p) => p.id === model.providerId);
            const ProviderIcon = provider ? getProviderIconById(provider.catalogId) : null;

            return (
              <ComboboxItem key={model.id} value={model}>
                {ProviderIcon ? <ProviderIcon className="size-4 shrink-0" /> : null}
                <span className="min-w-0 flex-1 truncate">
                  {model.displayName ?? model.providerModelId}
                </span>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
