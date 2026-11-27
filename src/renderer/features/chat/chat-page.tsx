import * as React from "react";
import type { Editor } from "@tiptap/core";
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
import { Kbd } from "@/components/ui/kbd";
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
import { toastManager } from "@/components/ui/toast";
import {
  useChatCanStop,
  ChatContextProvider,
  useChatEditingMessageId,
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
  enqueue,
  moveToFront,
  removeItem,
  restoreItem,
  toQueuePreview,
  updateItem,
} from "@/stores/chat-queue";
import {
  getChatQueue,
  resumeChatQueue,
  setChatQueueHold,
  updateChatQueue,
  useChatQueue,
} from "@/stores/chat-queue-store";
import { createUuidV7 } from "@shared/uuidv7";
import {
  createEmptyTiptapDocument,
  createTiptapDocumentFromText,
  createTiptapMessageParts,
  parseTiptapDocument,
  type TiptapDocument,
} from "@shared/tiptap/document";
import { ChatContextUsage } from "./chat-context-usage";
import { ChatMessageQueue } from "./chat-message-queue";
import { ChatMessageHotkeys } from "./chat-message-hotkeys";
import { useWorkspaceStore } from "../workspace/store";
import { Conversation } from "./conversation";
import { SumiPromptAction } from "./sumi-prompt-action";
import { MentionItemsMenu } from "./mention-context";
import { ChatComposerEditor } from "./tiptap-editor";
import { ChatModelPicker } from "./model-picker/chat-model-picker";
import { useToolApprovalActions } from "./tool-approval-actions";
import { APPROVAL_TOOLS } from "@shared/chat/tool-approval";
import { ChatWorkflowMenu, ChatWorkflowSidebar } from "../workflow/chat-workflow";
import { useChatWorkflowStatus } from "../workflow/workflow-model-availability";

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

  const { data: enabledModels = [], isPending: isModelsPending } = useQuery(
    listEnabledModelsQueryOptions,
  );
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
          {!isModelsPending && enabledModels.length === 0
            ? "Enable a model in Settings to start chatting."
            : ""}
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

  // A local read that takes milliseconds: a "Loading…" line would only ever register as a flash.
  if (!chat) {
    return null;
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
  const composerEditorRef = React.useRef<Editor | null>(null);
  // A queued message open in the composer. The draft it displaced waits in `stash` and comes
  // back on save or cancel, so editing a queued message never costs the user what they typed.
  const [queueEdit, setQueueEdit] = React.useState<{
    id: string;
    stash: TiptapDocument;
  } | null>(null);
  const queueEditRef = React.useRef(queueEdit);
  queueEditRef.current = queueEdit;
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  const saveDraft = useDebouncedCallback(
    (document: TiptapDocument) => useWorkspaceStore.getState().setChatDraft(chatId, document),
    { wait: 500 },
  );
  const updateInput = React.useCallback(
    (document: TiptapDocument) => {
      inputRef.current = document;
      setInput(document);
      // While a queued message is open, the saved draft stays the stashed one.
      if (!queueEditRef.current) {
        saveDraft(document);
      }
      // Typing is engagement: a half-written prompt shouldn't vanish with its preview tab.
      useWorkspaceStore.getState().keepItem(chatId);
    },
    [chatId, saveDraft],
  );

  // Convert legacy string drafts on load and flush on unmount so fast chat switches keep edits.
  React.useEffect(() => {
    useWorkspaceStore.getState().setChatDraft(chatId, inputRef.current);
    return () => {
      const edit = queueEditRef.current;
      useWorkspaceStore.getState().setChatDraft(chatId, edit?.stash ?? inputRef.current);
      // Leaving mid-edit keeps the queued message as it was, and lets the queue move again.
      if (edit && getChatQueue(chatId).editingId === edit.id) {
        updateChatQueue(chatId, (queue) => ({ ...queue, editingId: null }));
      }
    };
  }, [chatId]);
  const modelId = useChatModelId();
  const getMessages = useChatGetMessages();
  const sendMessage = useChatSendMessage();
  const regenerateMessage = useChatRegenerateMessage();
  const stopChat = useChatStop();
  const canStop = useChatCanStop();
  const isInteractionLocked = useChatIsInteractionLocked();
  const isEditingSentMessage = useChatEditingMessageId() !== null;
  const queue = useChatQueue(chatId);
  // A workflow that can't run (deleted, unreadable, or a step's model gone)
  // would fail the request after the composer clears; fix it first.
  const workflowBlockReason = useChatWorkflowStatus(chatId).blockReason;
  const isWorkflowBlocked = workflowBlockReason !== null;

  React.useEffect(() => {
    setChatQueueHold(chatId, "workflow-blocked", isWorkflowBlocked);
    return () => setChatQueueHold(chatId, "workflow-blocked", false);
  }, [chatId, isWorkflowBlocked]);
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

  // Before paint, or the pane header's buttons pop in a frame after the chat does.
  React.useLayoutEffect(() => {
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

  const focusComposer = React.useCallback(() => {
    requestAnimationFrame(() => composerEditorRef.current?.commands.focus("end"));
  }, []);

  const endQueueEdit = React.useCallback(() => {
    const edit = queueEditRef.current;
    if (!edit) {
      return;
    }
    queueEditRef.current = null;
    setQueueEdit(null);
    updateInput(edit.stash);
    updateChatQueue(chatId, (current) =>
      current.editingId === edit.id ? { ...current, editingId: null } : current,
    );
    focusComposer();
  }, [chatId, focusComposer, updateInput]);

  const startQueueEdit = React.useCallback(
    (id: string) => {
      const item = getChatQueue(chatId).items.find((candidate) => candidate.id === id);
      if (!item || isEditingSentMessage) {
        return;
      }
      // Switching straight to another queued message keeps the original draft stashed.
      const stash = queueEditRef.current?.stash ?? inputRef.current;
      const edit = { id, stash };
      queueEditRef.current = edit;
      setQueueEdit(edit);
      updateInput(item.document);
      updateChatQueue(chatId, (current) => ({ ...current, editingId: id }));
      focusComposer();
    },
    [chatId, focusComposer, isEditingSentMessage, updateInput],
  );

  // A queued message removed or sent from elsewhere ends its edit.
  React.useEffect(() => {
    if (queueEdit && !queue.items.some((item) => item.id === queueEdit.id)) {
      endQueueEdit();
    }
  }, [endQueueEdit, queue.items, queueEdit]);

  const removeQueued = React.useCallback(
    (id: string) => {
      const current = getChatQueue(chatId);
      const index = current.items.findIndex((item) => item.id === id);
      const item = current.items[index];
      if (!item) {
        return;
      }
      updateChatQueue(chatId, (latest) => removeItem(latest, id));
      toastManager.add({
        title: "Queued message removed",
        actionProps: {
          children: "Undo",
          onClick: () => updateChatQueue(chatId, (latest) => restoreItem(latest, item, index)),
        },
      });
    },
    [chatId],
  );

  const sendQueuedNow = React.useCallback(
    (id: string) => {
      // Order is the point of a queue: "send now" jumps this one ahead and lets it go at once.
      updateChatQueue(chatId, (current) => ({
        ...moveToFront(current, id),
        pausedBy: null,
      }));
      if (canStop) {
        void stopChat({ pauseQueue: false });
      }
    },
    [canStop, chatId, stopChat],
  );

  const submitMessage = React.useCallback(() => {
    const edit = queueEditRef.current;
    if (edit) {
      if (!parsedInput.ok) {
        return false;
      }
      const text = toQueuePreview(parsedInput.value.displayText);
      // Saving an emptied message drops it, just like the row's remove button.
      updateChatQueue(chatId, (current) =>
        text
          ? updateItem(current, edit.id, {
              document: parsedInput.value.document,
              preview: text,
            })
          : removeItem(current, edit.id),
      );
      endQueueEdit();
      return true;
    }

    if (
      !modelId ||
      !parsedInput.ok ||
      !parsedInput.value.displayText.trim() ||
      isEditingSentMessage ||
      isWorkflowBlocked
    ) {
      return false;
    }

    // While a reply generates, or earlier messages are still waiting their turn, new ones line
    // up behind them. A paused queue doesn't hold back what the user sends next.
    const current = getChatQueue(chatId);
    if (canStop || (current.items.length > 0 && current.pausedBy === null)) {
      updateChatQueue(chatId, (latest) =>
        enqueue(latest, {
          id: createUuidV7(),
          document: parsedInput.value.document,
          preview: toQueuePreview(parsedInput.value.displayText),
        }),
      );
      updateInput(createEmptyTiptapDocument());
      return true;
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
    canStop,
    chatId,
    endQueueEdit,
    getMessages,
    isEditingSentMessage,
    isWorkflowBlocked,
    modelId,
    parsedInput,
    scrollToBottom,
    sendMessage,
    updateInput,
  ]);

  const handleComposerKeyDown = React.useCallback(
    (event: KeyboardEvent, editor: { isEmpty: boolean }) => {
      if (event.key === "Escape" && queueEditRef.current) {
        endQueueEdit();
        return true;
      }
      // The terminal-agent convention: Up in an empty prompt reopens the last queued message.
      if (
        event.key === "ArrowUp" &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        editor.isEmpty &&
        !queueEditRef.current
      ) {
        const last = getChatQueue(chatId).items.at(-1);
        if (last) {
          startQueueEdit(last.id);
          return true;
        }
      }
      return false;
    },
    [chatId, endQueueEdit, startQueueEdit],
  );

  useHotkey(
    STOP_GENERATION_HOTKEY,
    (event) => {
      event.preventDefault();
      stopGeneration();
    },
    {
      enabled: canStop && isActivePane,
      conflictBehavior: "allow",
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
      conflictBehavior: "allow",
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
      conflictBehavior: "allow",
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
    },
  );

  return (
    <ChatScrollToBottomProvider scrollToBottom={scrollToBottom}>
      {/* A container, so the workflow sidebar reacts to this pane's width, not the window's. */}
      <div className="@container/chat relative flex min-h-0 flex-1">
        <div
          ref={containerRef}
          role="region"
          aria-label="Conversation"
          data-chat-conversation=""
          className="min-w-0 flex-1 overflow-auto scrollbar"
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
                    disabled={!modelId || isInteractionLocked || isWorkflowBlocked}
                    onClick={() => {
                      scrollToBottom();
                      void regenerateMessage({ messageId: lastUserMessageId });
                    }}
                  >
                    Generate
                  </Button>
                </div>
              ) : null}

              <ChatMessageQueue
                queue={queue}
                isBusy={canStop}
                blockReason={workflowBlockReason}
                onSendNow={sendQueuedNow}
                onEdit={startQueueEdit}
                onRemove={removeQueued}
                onResume={() => resumeChatQueue(chatId)}
              />

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
                  {queueEdit ? (
                    <div className="flex h-6 items-center gap-2 px-3 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">Editing queued message</span>
                      <Button type="button" size="xs" variant="ghost" onClick={endQueueEdit}>
                        Cancel
                        <Kbd>Esc</Kbd>
                      </Button>
                    </div>
                  ) : null}
                  <ChatComposerEditor
                    ref={composerEditorRef}
                    document={input}
                    disabled={isEditingSentMessage}
                    submitBehavior={submitBehavior}
                    workspaceId={workspaceId}
                    placeholder={
                      queueEdit
                        ? "Save it empty to remove it from the queue"
                        : canStop
                          ? "Queue a follow-up…"
                          : undefined
                    }
                    onChange={updateInput}
                    onSubmit={submitMessage}
                    onKeyDown={handleComposerKeyDown}
                  />
                  <InputGroupAddon
                    align="block-end"
                    className="@container/composer-tools flex w-full min-w-0 items-center gap-1.5 px-2 py-0"
                  >
                    <ChatToolsMenu />
                    <ChatWorkflowMenu />
                    <ChatModelPicker />
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      <ChatContextUsage />
                      <SumiPromptAction
                        prompt={inputText}
                        isDisabled={isInteractionLocked}
                        canShorten={inputIsTextOnly}
                        editorRef={composerEditorRef}
                        onReplace={(text) => updateInput(createTiptapDocumentFromText(text))}
                      />
                      {queueEdit ? (
                        <Button type="submit" size="sm">
                          Save
                        </Button>
                      ) : canStop ? (
                        inputText.trim() ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="submit"
                                  aria-label="Queue"
                                  size="sm"
                                  variant="ghost"
                                  className="@max-lg/composer-tools:w-7 @max-lg/composer-tools:px-0 @max-lg/composer-tools:[&>svg]:mx-0!"
                                  disabled={!modelId || isEditingSentMessage || isWorkflowBlocked}
                                />
                              }
                            >
                              <HugeiconsIcon icon={SentIcon} data-icon="inline-start" />
                              <span className="@max-lg/composer-tools:hidden">Queue</span>
                            </TooltipTrigger>
                            <TooltipContent>Sends when the reply finishes</TooltipContent>
                          </Tooltip>
                        ) : null
                      ) : (
                        <Tooltip>
                          {/* A disabled button gets no pointer events, so the wrapper
                            carries the tooltip that says why Send is off. */}
                          <TooltipTrigger
                            render={
                              <span
                                className="inline-flex rounded-md"
                                tabIndex={isWorkflowBlocked ? 0 : undefined}
                                aria-label={workflowBlockReason ?? undefined}
                              />
                            }
                          >
                            <Button
                              type="submit"
                              aria-label="Send"
                              size="sm"
                              className="@max-lg/composer-tools:w-7 @max-lg/composer-tools:px-0 @max-lg/composer-tools:[&>svg]:mx-0!"
                              disabled={
                                !modelId ||
                                !inputText.trim() ||
                                isEditingSentMessage ||
                                isWorkflowBlocked
                              }
                            >
                              <HugeiconsIcon icon={SentIcon} data-icon="inline-start" />
                              <span className="@max-lg/composer-tools:hidden">Send</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-72">
                            {workflowBlockReason ?? "Send"}
                          </TooltipContent>
                        </Tooltip>
                      )}
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
                      ) : null}
                    </div>
                  </InputGroupAddon>
                </InputGroup>
              </form>
            </div>

            <div ref={anchorRef} aria-hidden="true" />
          </div>
        </div>
        <ChatWorkflowSidebar />
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
