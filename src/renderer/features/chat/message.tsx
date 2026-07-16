import * as React from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "@/components/ui/preview-card";
import { Separator } from "@/components/ui/separator";

import type { ChatMessageMetadata, HanokiUiMessage } from "@shared/chat/message-metadata";
import type { EditMessageBehavior, ProviderModelInfo } from "@shared/ipc";
import {
  useChatContinueMessage,
  useChatRegenerateMessage,
  useChatStartEditingMessage,
  useChatStopEditingMessage,
  useChatSubmitEditedMessage,
  useChatSwitchBranch,
} from "@/features/chat/chat-context";
import { useChatScrollToBottom } from "@/features/chat/chat-scroll-context";
import { useMessageContextMenu } from "@/hooks/use-message-context-menu";
import { messagesApi } from "@/api/messages";
import { queryKeys } from "@/queries/keys";
import { CURRENT_BRANCH_QUERY_KEY } from "@/queries/chats";
import { useChatStore } from "@/stores/chat-store";
import { listProviderModelsQueryOptions } from "@/queries/providers";

import "streamdown/styles.css";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Edit01Icon,
  InformationCircleIcon,
  PinIcon,
  PinOffIcon,
  Refresh04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const STREAMDOWN_PLUGINS = { code };
const USER_MESSAGE_CARD_CLASS_NAME =
  "max-w-[85%] rounded-xl bg-surface-secondary px-4 py-3 text-sm";
const ASSISTANT_MESSAGE_CARD_CLASS_NAME = "w-full max-w-full text-sm";
/* Quiet toolbar buttons: ghost variant with muted text until hovered */
const TOOLBAR_BUTTON_CLASS = "text-muted-foreground";

// --- Pin hook ---

function usePinMessage(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      messagesApi.setMessagePinned(messageId, pinned),
    onSuccess: (_result, { messageId, pinned }) => {
      // Update the AI SDK Chat instance so the rendered messages reflect the new pin state
      const chatSession = useChatStore.getState().chatEntries.get(chatId);
      if (chatSession) {
        chatSession.messages = chatSession.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                metadata: {
                  parentId: m.metadata?.parentId ?? null,
                  ...m.metadata,
                  pinned,
                },
              }
            : m,
        );
      }
      // Keep the TanStack Query cache in sync too
      queryClient.setQueryData<HanokiUiMessage[]>(
        queryKeys.chats.messages(chatId, CURRENT_BRANCH_QUERY_KEY),
        (prev) =>
          prev?.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  metadata: {
                    parentId: m.metadata?.parentId ?? null,
                    ...m.metadata,
                    pinned,
                  },
                }
              : m,
          ),
      );
      // Invalidate the pinned branches list
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chats.pinnedBranches(),
      });
    },
  });
}

// --- Text parts ---

interface UserMessageTextPartProps {
  text: string;
}

const UserMessageTextPart = React.memo(function UserMessageTextPart({
  text,
}: UserMessageTextPartProps) {
  return (
    <Streamdown
      mode="static"
      plugins={STREAMDOWN_PLUGINS}
      className="text-[0.9375rem] leading-[1.65]"
    >
      {text}
    </Streamdown>
  );
});

interface AssistantMessageTextPartProps {
  text: string;
  isAnimating: boolean;
}

const AssistantMessageTextPart = React.memo(function AssistantMessageTextPart({
  text,
  isAnimating,
}: AssistantMessageTextPartProps) {
  return (
    <Streamdown
      mode={isAnimating ? "streaming" : "static"}
      plugins={STREAMDOWN_PLUGINS}
      isAnimating={isAnimating}
      className="text-[0.9375rem] text-foreground/90 leading-[1.7]"
    >
      {text}
    </Streamdown>
  );
});

function hasStreamingReasoning(message: HanokiUiMessage): boolean {
  return message.parts.some((part) => part.type === "reasoning" && part.state === "streaming");
}

function ThinkingMarker({ hasPriorText }: { hasPriorText: boolean }) {
  return (
    <Marker role="status" className={cn("text-xs", hasPriorText && "mt-2")}>
      <MarkerIcon>
        <Spinner />
      </MarkerIcon>
      <MarkerContent className="shimmer">Thinking…</MarkerContent>
    </Marker>
  );
}

// --- Role-specific tools components ---
interface MessageToolsProps extends React.ComponentProps<"div"> {
  forceVisible?: boolean;
}

const MessageTools = React.memo(function MessageTools({
  className,
  forceVisible = false,
  children,
  ...props
}: MessageToolsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 transition-opacity duration-150",
        forceVisible ? "opacity-100" : "opacity-0 group-hover/message:opacity-100",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

function MessageButtonGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

interface CopyMessageButtonProps {
  text: string;
}

const CopyMessageButton = React.memo(function CopyMessageButton({ text }: CopyMessageButtonProps) {
  const [isCopied, setIsCopied] = React.useState(false);

  React.useEffect(() => {
    if (!isCopied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setIsCopied(false), 1200);
    return () => window.clearTimeout(timeoutId);
  }, [isCopied]);

  return (
    <Button
      aria-label={isCopied ? "Copied message" : "Copy message"}
      variant="ghost"
      size="icon-sm"
      className={TOOLBAR_BUTTON_CLASS}
      disabled={text.length === 0}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setIsCopied(true));
      }}
    >
      <HugeiconsIcon icon={Copy01Icon} />
    </Button>
  );
});

interface AssistantMessageInfoButtonProps {
  message: HanokiUiMessage;
}

const AssistantMessageInfoButton = React.memo(function AssistantMessageInfoButton({
  message,
}: AssistantMessageInfoButtonProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const modelId = message.metadata?.model;
  const providerId = message.metadata?.provider;
  const { data: providerModels = [] } = useQuery({
    ...listProviderModelsQueryOptions(providerId ?? ""),
    enabled: Boolean(modelId && providerId),
  });
  const modelName = React.useMemo(
    () => resolveModelDisplayName(modelId, providerModels),
    [providerModels, modelId],
  );
  const summary = React.useMemo(
    () => getMessageInfoSummary(message, modelName),
    [message, modelName],
  );
  const details = React.useMemo(
    () => getMessageInfoDetails(message, modelName),
    [message, modelName],
  );

  return (
    <>
      <PreviewCard>
        <PreviewCardTrigger
          render={
            <Button
              aria-label="Show assistant message information"
              size="icon-sm"
              variant="ghost"
              className={TOOLBAR_BUTTON_CLASS}
              onClick={() => setIsOpen(true)}
            />
          }
        >
          <HugeiconsIcon icon={InformationCircleIcon} />
        </PreviewCardTrigger>
        <PreviewCardPopup sideOffset={10} className="w-auto p-3">
          <AssistantMessageInfoTooltip summary={summary} />
        </PreviewCardPopup>
      </PreviewCard>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Message Information</DialogTitle>
            <DialogDescription>
              Stored metadata and message payload for this assistant response.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto scrollbar">
            <div className="grid gap-3 sm:grid-cols-2">
              {details.primary.map((item) => (
                <MessageInfoField key={item.label} label={item.label} value={item.value} />
              ))}
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-3">
              {details.tokens.map((item) => (
                <MessageInfoField key={item.label} label={item.label} value={item.value} />
              ))}
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              {details.branch.map((item) => (
                <MessageInfoField key={item.label} label={item.label} value={item.value} />
              ))}
            </div>

            <MessageInfoJson title="Metadata" value={message.metadata ?? null} />
            <MessageInfoJson title="Parts" value={message.parts} />
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

interface AssistantMessageInfoTooltipProps {
  summary: MessageInfoSummary;
}

function AssistantMessageInfoTooltip({ summary }: AssistantMessageInfoTooltipProps) {
  return (
    <div className="flex w-72 flex-col gap-3 p-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{summary.model}</p>
          <p className="truncate text-xs text-muted-foreground">{summary.provider}</p>
        </div>
        <Badge variant="secondary">{summary.totalTokens}</Badge>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        <MessageInfoField label="Created" value={summary.createdAt} />
        <MessageInfoField label="Generation" value={summary.generationTime} />
        <MessageInfoField label="Input" value={summary.inputTokens} />
        <MessageInfoField label="Output" value={summary.outputTokens} />
        <MessageInfoField label="Cost" value={summary.cost} />
      </div>
    </div>
  );
}

interface MessageInfoFieldProps {
  label: string;
  value: string;
}

function MessageInfoField({ label, value }: MessageInfoFieldProps) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-secondary px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}

interface MessageInfoJsonProps {
  title: string;
  value: unknown;
}

function MessageInfoJson({ title, value }: MessageInfoJsonProps) {
  return (
    <Card size="sm" className="gap-3 bg-surface-secondary">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="max-h-64 overflow-auto rounded-lg bg-surface px-3 py-2 text-xs leading-5 text-muted-foreground">
          {JSON.stringify(value, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

interface BranchSwitcherButtonGroupProps {
  isInteractionLocked: boolean;
  nextSiblingId: string | undefined;
  prevSiblingId: string | undefined;
  siblingIndex: number;
  siblingTotal: number;
}

function BranchSwitcherButtonGroup({
  isInteractionLocked,
  nextSiblingId,
  prevSiblingId,
  siblingIndex,
  siblingTotal,
}: BranchSwitcherButtonGroupProps) {
  const switchBranch = useChatSwitchBranch();

  return (
    <MessageButtonGroup>
      <Button
        size="icon-sm"
        variant="ghost"
        className={TOOLBAR_BUTTON_CLASS}
        aria-label="Previous branch"
        disabled={isInteractionLocked || !prevSiblingId}
        onClick={() => prevSiblingId && void switchBranch(prevSiblingId)}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} />
      </Button>
      <span className="px-0.5 text-xs tabular-nums text-muted-foreground select-none">
        {siblingIndex + 1}/{siblingTotal}
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        className={TOOLBAR_BUTTON_CLASS}
        aria-label="Next branch"
        disabled={isInteractionLocked || !nextSiblingId}
        onClick={() => nextSiblingId && void switchBranch(nextSiblingId)}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} />
      </Button>
    </MessageButtonGroup>
  );
}

interface AssistantMessageToolsProps {
  chatId: string;
  draft: string;
  isEditing: boolean;
  isInteractionLocked: boolean;
  message: HanokiUiMessage;
  messageText: string;
  onDraftChange: (value: string) => void;
  startEditingMessage: (messageId: string) => void;
  stopEditingMessage: () => void;
  submitEditedMessage: (
    messageId: string,
    text: string,
    behavior: EditMessageBehavior,
  ) => Promise<void>;
}

const AssistantMessageTools = React.memo(function AssistantMessageTools({
  chatId,
  draft,
  isEditing,
  isInteractionLocked,
  message,
  messageText,
  onDraftChange,
  startEditingMessage,
  stopEditingMessage,
  submitEditedMessage,
}: AssistantMessageToolsProps) {
  const continueMessage = useChatContinueMessage();
  const regenerate = useChatRegenerateMessage();
  const scrollToBottom = useChatScrollToBottom();
  const pinMutation = usePinMessage(chatId);

  const siblings = message.metadata?.siblings ?? [];
  const siblingIndex = message.metadata?.siblingIndex ?? 0;
  const prevSiblingId = siblings[siblingIndex - 1];
  const nextSiblingId = siblings[siblingIndex + 1];
  const hasSiblings = siblings.length > 1;

  if (isEditing) {
    return (
      <EditableMessageTools
        canSave={draft.trim().length > 0}
        draft={draft}
        messageId={message.id}
        messageText={messageText}
        onDraftChange={onDraftChange}
        stopEditingMessage={stopEditingMessage}
        submitEditedMessage={submitEditedMessage}
      />
    );
  }

  return (
    <MessageTools>
      <AssistantMessageInfoButton message={message} />

      <MessageButtonGroup>
        <Button
          size="sm"
          variant="ghost"
          className={TOOLBAR_BUTTON_CLASS}
          disabled={isInteractionLocked}
          onClick={() => {
            scrollToBottom();
            void continueMessage(message.id);
          }}
        >
          Continue
        </Button>

        <Button
          size="icon-sm"
          variant="ghost"
          className={TOOLBAR_BUTTON_CLASS}
          aria-label="Regenerate message"
          disabled={isInteractionLocked}
          onClick={() => {
            scrollToBottom();
            regenerate({ messageId: message.id });
          }}
        >
          <HugeiconsIcon icon={Refresh04Icon} />
        </Button>

        <Button
          size="icon-sm"
          variant="ghost"
          className={TOOLBAR_BUTTON_CLASS}
          aria-label="Edit message"
          disabled={isInteractionLocked}
          onClick={() => startEditingMessage(message.id)}
        >
          <HugeiconsIcon icon={Edit01Icon} />
        </Button>

        <CopyMessageButton text={messageText} />

        <Button
          size="icon-sm"
          variant="ghost"
          className={TOOLBAR_BUTTON_CLASS}
          aria-label={message.metadata?.pinned ? "Unpin message" : "Pin message"}
          onClick={() =>
            pinMutation.mutate({
              messageId: message.id,
              pinned: !message.metadata?.pinned,
            })
          }
        >
          <HugeiconsIcon icon={message.metadata?.pinned ? PinOffIcon : PinIcon} />
        </Button>
      </MessageButtonGroup>

      {hasSiblings && (
        <BranchSwitcherButtonGroup
          isInteractionLocked={isInteractionLocked}
          nextSiblingId={nextSiblingId}
          prevSiblingId={prevSiblingId}
          siblingIndex={siblingIndex}
          siblingTotal={siblings.length}
        />
      )}
    </MessageTools>
  );
});

interface EditableMessageToolsProps {
  canSave: boolean;
  draft: string;
  messageId: string;
  messageText: string;
  onDraftChange: (value: string) => void;
  stopEditingMessage: () => void;
  submitEditedMessage: (
    messageId: string,
    text: string,
    behavior: EditMessageBehavior,
  ) => Promise<void>;
}

const EditableMessageTools = React.memo(function EditableMessageTools({
  canSave,
  draft,
  messageId,
  messageText,
  onDraftChange,
  stopEditingMessage,
  submitEditedMessage,
}: EditableMessageToolsProps) {
  return (
    <MessageTools forceVisible>
      <MessageButtonGroup>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() => {
            void submitEditedMessage(messageId, draft, "overwrite");
          }}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={TOOLBAR_BUTTON_CLASS}
          disabled={!canSave}
          onClick={() => {
            void submitEditedMessage(messageId, draft, "branch");
          }}
        >
          Save as new branch
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={TOOLBAR_BUTTON_CLASS}
          onClick={() => {
            onDraftChange(messageText);
            stopEditingMessage();
          }}
        >
          Cancel
        </Button>
      </MessageButtonGroup>
    </MessageTools>
  );
});

interface UserMessageToolsProps {
  chatId: string;
  draft: string;
  isEditing: boolean;
  isInteractionLocked: boolean;
  message: HanokiUiMessage;
  messageText: string;
  modelId: string | null;
  onDraftChange: (value: string) => void;
  startEditingMessage: (messageId: string) => void;
  stopEditingMessage: () => void;
  submitEditedMessage: (
    messageId: string,
    text: string,
    behavior: EditMessageBehavior,
  ) => Promise<void>;
}

const UserMessageTools = React.memo(function UserMessageTools({
  chatId,
  draft,
  isEditing,
  isInteractionLocked,
  message,
  messageText,
  modelId,
  onDraftChange,
  startEditingMessage,
  stopEditingMessage,
  submitEditedMessage,
}: UserMessageToolsProps) {
  const pinMutation = usePinMessage(chatId);

  const siblings = message.metadata?.siblings ?? [];
  const siblingIndex = message.metadata?.siblingIndex ?? 0;
  const prevSiblingId = siblings[siblingIndex - 1];
  const nextSiblingId = siblings[siblingIndex + 1];
  const hasSiblings = siblings.length > 1;

  if (isEditing) {
    return (
      <EditableMessageTools
        canSave={Boolean(modelId) && draft.trim().length > 0}
        draft={draft}
        messageId={message.id}
        messageText={messageText}
        onDraftChange={onDraftChange}
        stopEditingMessage={stopEditingMessage}
        submitEditedMessage={submitEditedMessage}
      />
    );
  }

  return (
    <MessageTools>
      {hasSiblings && (
        <BranchSwitcherButtonGroup
          isInteractionLocked={isInteractionLocked}
          nextSiblingId={nextSiblingId}
          prevSiblingId={prevSiblingId}
          siblingIndex={siblingIndex}
          siblingTotal={siblings.length}
        />
      )}

      <MessageButtonGroup>
        <Button
          size="icon-sm"
          variant="ghost"
          className={TOOLBAR_BUTTON_CLASS}
          aria-label="Edit message"
          disabled={isInteractionLocked}
          onClick={() => startEditingMessage(message.id)}
        >
          <HugeiconsIcon icon={Edit01Icon} />
        </Button>

        <CopyMessageButton text={messageText} />

        <Button
          size="icon-sm"
          variant="ghost"
          className={TOOLBAR_BUTTON_CLASS}
          aria-label={message.metadata?.pinned ? "Unpin message" : "Pin message"}
          onClick={() =>
            pinMutation.mutate({
              messageId: message.id,
              pinned: !message.metadata?.pinned,
            })
          }
        >
          <HugeiconsIcon icon={message.metadata?.pinned ? PinOffIcon : PinIcon} />
        </Button>
      </MessageButtonGroup>
    </MessageTools>
  );
});

// --- Role-specific message components ---

interface UserMessageProps {
  chatId: string;
  isEditing: boolean;
  isInteractionLocked: boolean;
  message: HanokiUiMessage;
  modelId: string | null;
}

const UserMessage = React.memo(function UserMessage({
  chatId,
  isEditing,
  isInteractionLocked,
  message,
  modelId,
}: UserMessageProps) {
  const onContextMenu = useMessageContextMenu(message.id);
  const startEditingMessage = useChatStartEditingMessage();
  const stopEditingMessage = useChatStopEditingMessage();
  const submitEditedMessage = useChatSubmitEditedMessage();
  const messageText = React.useMemo(() => getMessageText(message), [message]);
  const [draft, setDraft] = React.useState(messageText);

  React.useEffect(() => {
    if (!isEditing) {
      setDraft(messageText);
    }
  }, [isEditing, messageText]);

  return (
    <div className="group/message flex flex-col items-end gap-2" data-chat-message-id={message.id}>
      <div className={USER_MESSAGE_CARD_CLASS_NAME} onContextMenu={onContextMenu}>
        {isEditing ? (
          <Textarea
            className="border-0 bg-transparent p-0 min-h-0 rounded-none shadow-none focus-visible:ring-0 text-[0.9375rem] leading-[1.6]"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : (
          message.parts.map((part, i) =>
            part.type === "text" ? <UserMessageTextPart key={i} text={part.text} /> : null,
          )
        )}
      </div>

      <UserMessageTools
        chatId={chatId}
        draft={draft}
        isEditing={isEditing}
        isInteractionLocked={isInteractionLocked}
        message={message}
        messageText={messageText}
        modelId={modelId}
        onDraftChange={setDraft}
        startEditingMessage={startEditingMessage}
        stopEditingMessage={stopEditingMessage}
        submitEditedMessage={submitEditedMessage}
      />
    </div>
  );
});

interface AssistantMessageProps {
  chatId: string;
  isAnimating: boolean;
  isEditing: boolean;
  isInteractionLocked: boolean;
  message: HanokiUiMessage;
}

const AssistantMessage = React.memo(function AssistantMessage({
  chatId,
  isAnimating,
  isEditing,
  isInteractionLocked,
  message,
}: AssistantMessageProps) {
  const startEditingMessage = useChatStartEditingMessage();
  const stopEditingMessage = useChatStopEditingMessage();
  const submitEditedMessage = useChatSubmitEditedMessage();
  const onContextMenu = useMessageContextMenu(message.id);
  const messageText = React.useMemo(() => getMessageText(message), [message]);
  const isThinking = isAnimating && (message.parts.length === 0 || hasStreamingReasoning(message));
  const [draft, setDraft] = React.useState(messageText);

  React.useEffect(() => {
    if (!isEditing) {
      setDraft(messageText);
    }
  }, [isEditing, messageText]);

  return (
    <div
      className="group/message flex flex-col items-start gap-2"
      data-chat-message-id={message.id}
    >
      <div className={ASSISTANT_MESSAGE_CARD_CLASS_NAME} onContextMenu={onContextMenu}>
        {isEditing ? (
          <Textarea
            className="border-0 bg-transparent p-0 min-h-0 rounded-none shadow-none focus-visible:ring-0 text-[0.9375rem] leading-[1.7] text-foreground/90"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : (
          <>
            {message.parts.map((part, i) =>
              part.type === "text" ? (
                <AssistantMessageTextPart key={i} text={part.text} isAnimating={isAnimating} />
              ) : null,
            )}
            {isThinking ? <ThinkingMarker hasPriorText={messageText.length > 0} /> : null}
          </>
        )}
      </div>

      {!isAnimating ? (
        <AssistantMessageTools
          chatId={chatId}
          draft={draft}
          isEditing={isEditing}
          isInteractionLocked={isInteractionLocked}
          message={message}
          messageText={messageText}
          onDraftChange={setDraft}
          startEditingMessage={startEditingMessage}
          stopEditingMessage={stopEditingMessage}
          submitEditedMessage={submitEditedMessage}
        />
      ) : null}
    </div>
  );
});

// --- Message dispatcher ---

interface ChatMessageProps {
  chatId: string;
  isAnimating: boolean;
  isEditing: boolean;
  isInteractionLocked: boolean;
  message: HanokiUiMessage;
  modelId: string | null;
}

export const ChatMessage = React.memo(function ChatMessage({
  chatId,
  isAnimating,
  isEditing,
  isInteractionLocked,
  message,
  modelId,
}: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <UserMessage
        chatId={chatId}
        isEditing={isEditing}
        isInteractionLocked={isInteractionLocked}
        message={message}
        modelId={modelId}
      />
    );
  }

  return (
    <AssistantMessage
      chatId={chatId}
      isAnimating={isAnimating}
      isEditing={isEditing}
      isInteractionLocked={isInteractionLocked}
      message={message}
    />
  );
});

function getMessageText(message: HanokiUiMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<HanokiUiMessage["parts"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n");
}

interface MessageInfoSummary {
  model: string;
  provider: string;
  createdAt: string;
  generationTime: string;
  inputTokens: string;
  outputTokens: string;
  totalTokens: string;
  cost: string;
}

interface MessageInfoDetails {
  primary: MessageInfoFieldProps[];
  tokens: MessageInfoFieldProps[];
  branch: MessageInfoFieldProps[];
}

function resolveModelDisplayName(
  modelId: string | null | undefined,
  models: ProviderModelInfo[],
): string {
  const fallback = formatKnownValue(modelId);
  const model = models.find((item) => item.id === modelId);

  if (!model) {
    return fallback;
  }

  return formatKnownValue(model.displayName ?? model.providerModelId);
}

function getMessageInfoSummary(message: HanokiUiMessage, modelName: string): MessageInfoSummary {
  const metadata = message.metadata;
  const tokens = metadata?.tokens;

  return {
    model: modelName,
    provider: formatKnownValue(metadata?.provider),
    createdAt: formatTimestamp(metadata?.createdAt),
    generationTime: formatDuration(metadata?.times?.generation),
    inputTokens: formatNumber(tokens?.input),
    outputTokens: formatNumber(tokens?.output),
    totalTokens: formatTokenTotal(tokens),
    cost: formatCost(metadata?.cost?.total, metadata?.cost?.currency),
  };
}

function getMessageInfoDetails(message: HanokiUiMessage, modelName: string): MessageInfoDetails {
  const metadata = message.metadata;
  const tokens = metadata?.tokens;
  const siblings = metadata?.siblings ?? [];

  return {
    primary: [
      { label: "Message ID", value: message.id },
      { label: "Role", value: message.role },
      { label: "Model", value: modelName },
      { label: "Provider", value: formatKnownValue(metadata?.provider) },
      { label: "Created", value: formatTimestamp(metadata?.createdAt) },
      { label: "Updated", value: formatTimestamp(metadata?.updatedAt) },
      {
        label: "Generation Time",
        value: formatDuration(metadata?.times?.generation),
      },
      {
        label: "Finish Reason",
        value: formatKnownValue(metadata?.finishReason),
      },
      {
        label: "Cost",
        value: formatCost(metadata?.cost?.total, metadata?.cost?.currency),
      },
      { label: "Pinned", value: metadata?.pinned ? "Yes" : "No" },
    ],
    tokens: [
      { label: "Input", value: formatNumber(tokens?.input) },
      { label: "Output", value: formatNumber(tokens?.output) },
      { label: "Cached", value: formatNumber(tokens?.cached) },
      { label: "Cache Write", value: formatNumber(tokens?.cacheWrite) },
      { label: "Reasoning", value: formatNumber(tokens?.reasoning) },
      { label: "Total", value: formatTokenTotal(tokens) },
      { label: "Parts", value: formatNumber(message.parts.length) },
    ],
    branch: [
      { label: "Parent ID", value: formatKnownValue(metadata?.parentId) },
      {
        label: "Sibling Count",
        value: formatNumber(siblings.length || undefined),
      },
      {
        label: "Sibling Position",
        value:
          metadata?.siblingIndex !== undefined && siblings.length > 0
            ? `${metadata.siblingIndex + 1} of ${siblings.length}`
            : "Not branched",
      },
      {
        label: "Sibling IDs",
        value: siblings.length > 0 ? siblings.join(", ") : "Not branched",
      },
    ],
  };
}

function formatKnownValue(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "Unknown";
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "Unknown";
}

function formatTokenTotal(tokens: ChatMessageMetadata["tokens"] | undefined): string {
  if (!tokens) {
    return "Unknown tokens";
  }

  if (typeof tokens.total === "number" && Number.isFinite(tokens.total)) {
    return `${tokens.total.toLocaleString()} tokens`;
  }

  if (
    typeof tokens.input !== "number" ||
    !Number.isFinite(tokens.input) ||
    typeof tokens.output !== "number" ||
    !Number.isFinite(tokens.output)
  ) {
    return "Unknown tokens";
  }

  const total = tokens.input + tokens.output;
  return `${total.toLocaleString()} tokens`;
}

function formatCost(value: number | null | undefined, currency: string | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unknown";
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: value < 0.01 ? 6 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 4,
  }).format(value);
}

function formatDuration(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unknown";
  }

  if (value < 1000) {
    return `${Math.round(value).toLocaleString()} ms`;
  }

  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function formatTimestamp(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
