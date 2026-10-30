import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import {
  Add01Icon,
  AiWebBrowsingIcon,
  Cancel01Icon,
  ComputerTerminal01Icon,
  Database02Icon,
  FlashIcon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
  useChatGetMessages,
  useChatLastMessage,
  useChatModelId,
  useChatSendMessage,
  useChatStop,
  resolveModelId,
} from "@/features/chat/chat-context";
import { getChatQueryOptions } from "@/queries/chats";
import { useIsActiveChatPane, useIsActiveChatTab } from "@/features/chat/chat-pane-context";
import { ChatScrollToBottomProvider } from "@/features/chat/chat-scroll-context";
import { useChatScrollActions } from "@/features/chat/chat-scroll-actions-context";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { useUpdateChatSettings } from "@/mutations/chats";
import { cn } from "cn";
import { listEnabledModelsQueryOptions } from "@/queries/models";
import { globalChatSettingsQueryOptions } from "@/queries/settings";
import { useSystemStore, selectAiServerPort, selectAiServerReady } from "@/stores/system-store";
import {
  createEmptyTiptapDocument,
  createTiptapDocumentFromText,
  createTiptapMessageParts,
  parseTiptapDocument,
  type TiptapDocument,
} from "@shared/tiptap/document";
import { ChatContextUsage } from "./chat-context-usage";
import { ChatMessageHotkeys } from "./chat-message-hotkeys";
import { useWorkspaceStore } from "../workspace/store";
import { Conversation } from "./conversation";
import { SumiPromptAction } from "./sumi-prompt-action";
import { MentionItemsMenu } from "./mention-context";
import { ChatComposerEditor } from "./tiptap-editor";
import { ChatModelPicker } from "./model-picker/chat-model-picker";
import { useToolApprovalActions } from "./tool-approval-actions";
import { APPROVAL_TOOLS } from "@shared/chat/tool-approval";

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

export function ActiveChatView({ chatId }: { chatId: string }) {
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
    () => resolveModelId(enabledModelIds, chat?.data.settings.modelId ?? null),
    [chat?.data.settings.modelId, enabledModelIds],
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

  if (!chat) {
    return (
      <div className="flex-1 mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
        <p className="text-sm text-muted-foreground">Loading chat…</p>
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
  const [input, setInput] = React.useState<TiptapDocument>(() => {
    const draft = useWorkspaceStore.getState().chatDrafts[chatId];
    if (typeof draft === "string") {
      return createTiptapDocumentFromText(draft);
    }
    const parsed = parseTiptapDocument(draft);
    return parsed.ok ? parsed.value.document : createEmptyTiptapDocument();
  });
  const inputRef = React.useRef(input);
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  const saveDraft = useDebouncedCallback(
    (document: TiptapDocument) => useWorkspaceStore.getState().setChatDraft(chatId, document),
    { wait: 500 },
  );
  const updateInput = React.useCallback(
    (document: TiptapDocument) => {
      inputRef.current = document;
      setInput(document);
      saveDraft(document);
    },
    [saveDraft],
  );

  // Convert legacy string drafts on load and flush on unmount so fast chat switches keep edits.
  React.useEffect(() => {
    useWorkspaceStore.getState().setChatDraft(chatId, inputRef.current);
    return () => useWorkspaceStore.getState().setChatDraft(chatId, inputRef.current);
  }, [chatId]);
  const modelId = useChatModelId();
  const getMessages = useChatGetMessages();
  const sendMessage = useChatSendMessage();
  const regenerateMessage = useChatRegenerateMessage();
  const stopChat = useChatStop();
  const canStop = useChatCanStop();
  const isInteractionLocked = useChatIsInteractionLocked();
  const isStreaming = useChatIsStreaming();
  const isActiveTab = useIsActiveChatTab();
  const isActivePane = useIsActiveChatPane();
  const { containerRef, anchorRef, scrollToBottom } = useScrollToBottom(
    chatId,
    isStreaming,
    isActiveTab,
  );
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
  const lastMessage = useChatLastMessage();
  const lastUserMessageId = lastMessage?.role === "user" ? lastMessage.id : null;

  const promptStickyPosition = globalChatSettings?.promptStickyPosition ?? true;
  const submitBehavior = globalChatSettings?.formSubmitBehavior ?? "enter";
  const parsedInput = React.useMemo(() => parseTiptapDocument(input), [input]);
  const inputText = parsedInput.ok ? parsedInput.value.displayText : "";
  const inputIsTextOnly = parsedInput.ok && parsedInput.value.isTextOnly;

  const stopGeneration = React.useCallback(() => {
    if (!canStop) {
      return;
    }

    void stopChat();
  }, [canStop, stopChat]);

  const submitMessage = React.useCallback(() => {
    if (
      !modelId ||
      !parsedInput.ok ||
      !parsedInput.value.displayText.trim() ||
      isInteractionLocked
    ) {
      return false;
    }

    scrollToBottom();
    void sendMessage({
      parts: createTiptapMessageParts(parsedInput.value.document),
      metadata: {
        parentId: getMessages().at(-1)?.id ?? null,
      },
    });
    updateInput(createEmptyTiptapDocument());
    return true;
  }, [
    getMessages,
    isInteractionLocked,
    modelId,
    parsedInput,
    scrollToBottom,
    sendMessage,
    updateInput,
  ]);

  useHotkey(
    STOP_GENERATION_HOTKEY,
    (event) => {
      event.preventDefault();
      stopGeneration();
    },
    {
      enabled: canStop && isActivePane,
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
      enabled: isActivePane,
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
      enabled: isActivePane,
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
    },
  );

  return (
    <ChatScrollToBottomProvider scrollToBottom={scrollToBottom}>
      <div
        ref={containerRef}
        role="region"
        aria-label="Conversation"
        className="flex-1 min-h-0 overflow-auto scrollbar"
      >
        <ChatMessageHotkeys />

        <div className="flex flex-col min-h-full justify-end">
          <React.Activity mode={isActiveTab ? "visible" : "hidden"}>
            <Conversation />
          </React.Activity>

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
                <ChatComposerEditor
                  document={input}
                  disabled={isInteractionLocked}
                  submitBehavior={submitBehavior}
                  workspaceId={workspaceId}
                  onChange={updateInput}
                  onSubmit={submitMessage}
                />
                <InputGroupAddon
                  align="block-end"
                  className="flex w-full items-center gap-1.5 px-2 py-0"
                >
                  <ChatToolsMenu />
                  <ChatModelPicker />
                  <div className="ml-auto flex items-center gap-1.5">
                    <ChatContextUsage />
                    <SumiPromptAction
                      prompt={inputText}
                      isDisabled={isInteractionLocked || !inputIsTextOnly}
                      onReplace={(text) => updateInput(createTiptapDocumentFromText(text))}
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
                              disabled={!modelId || !inputText.trim() || isInteractionLocked}
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

function ChatToolsMenu() {
  const chatId = useChatId();
  const isInteractionLocked = useChatIsInteractionLocked();
  const { data: chat } = useQuery(getChatQueryOptions(chatId));
  const updateChatSettings = useUpdateChatSettings();
  const approvalActions = useToolApprovalActions();
  const toolsButtonRef = React.useRef<HTMLButtonElement>(null);
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const webEnabled = chat?.data.settings.webEnabled ?? false;
  const hanokiEnabled = chat?.data.settings.hanokiEnabled ?? false;
  const terminalEnabled = chat?.data.settings.terminalEnabled ?? false;
  const approvalMode = chat?.data.settings.toolApprovalMode ?? "ask";
  const allowedTools = chat?.data.settings.allowedTools ?? [];
  const isSaving = updateChatSettings.isPending || approvalActions.isSaving;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={toolsButtonRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-foreground"
              aria-label="Chat tools"
              aria-pressed={webEnabled || hanokiEnabled || terminalEnabled}
              disabled={isInteractionLocked}
            />
          }
        >
          <HugeiconsIcon icon={Add01Icon} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={isInteractionLocked}
              onClick={() => {
                window.setTimeout(() => setMentionOpen(true), 0);
              }}
            >
              Mention item…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              variant="switch"
              checked={webEnabled}
              disabled={isSaving}
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
            <DropdownMenuCheckboxItem
              variant="switch"
              checked={hanokiEnabled}
              disabled={isSaving}
              onCheckedChange={(checked) => {
                updateChatSettings.mutate({
                  id: chatId,
                  input: { hanokiEnabled: checked },
                });
              }}
            >
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={Database02Icon} />
                Hanoki
              </span>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              variant="switch"
              checked={terminalEnabled}
              disabled={isSaving}
              onCheckedChange={(checked) => {
                updateChatSettings.mutate({
                  id: chatId,
                  input: { terminalEnabled: checked },
                });
              }}
            >
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={ComputerTerminal01Icon} />
                Terminal
              </span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Approvals</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={approvalMode}
              onValueChange={(next) => {
                if (next === "allow-all") approvalActions.allowAllForChat();
                else approvalActions.askBeforeActions();
              }}
            >
              <DropdownMenuRadioItem value="ask" disabled={isSaving}>
                Ask before actions
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="allow-all" disabled={isSaving}>
                Allow all actions
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {approvalMode === "ask" && allowedTools.length > 0 ? (
              <DropdownMenuItem disabled={isSaving} onClick={approvalActions.forgetAllowedTools}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span>Ask again for everything</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Allowed here:{" "}
                    {allowedTools.map((name) => APPROVAL_TOOLS[name].label).join(", ")}
                  </span>
                </span>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {approvalMode === "allow-all" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-warning hover:text-warning"
                disabled={isSaving}
                onClick={approvalActions.askBeforeActions}
              />
            }
          >
            <HugeiconsIcon icon={FlashIcon} data-icon="inline-start" />
            Auto-approve
          </TooltipTrigger>
          <TooltipContent>
            Every action in this chat runs without asking. Click to ask again.
          </TooltipContent>
        </Tooltip>
      ) : null}
      <MentionItemsMenu
        anchorRef={toolsButtonRef}
        open={mentionOpen}
        onOpenChange={setMentionOpen}
      />
    </>
  );
}
