import * as React from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ButtonGroup, Card } from "@heroui/react";

import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import type { EditMessageBehavior } from "@shared/ipc";
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

import "streamdown/styles.css";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Edit01Icon,
  PinIcon,
  PinOffIcon,
  Refresh04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

const STREAMDOWN_PLUGINS = { code };
const USER_MESSAGE_CARD_CLASS_NAME = "max-w-[min(calc(100%_-_48px),720px)]";
const ASSISTANT_MESSAGE_CARD_CLASS_NAME = "max-w-[min(calc(100%_-_48px),860px)]";

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
          m.id === messageId ? { ...m, metadata: { ...m.metadata, pinned } } : m,
        );
      }
      // Keep the TanStack Query cache in sync too
      queryClient.setQueryData<HanokiUiMessage[]>(
        queryKeys.chats.messages(chatId, CURRENT_BRANCH_QUERY_KEY),
        (prev) =>
          prev?.map((m) =>
            m.id === messageId ? { ...m, metadata: { ...m.metadata, pinned } } : m,
          ),
      );
      // Invalidate the pinned branches list
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats.pinnedBranches() });
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
      className="text-[0.9375rem] leading-[1.6]"
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
      className="text-[1.0625rem] text-foreground/85 leading-[1.75]"
    >
      {text}
    </Streamdown>
  );
});

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
  return (
    <ButtonGroup size="sm" variant="tertiary">
      {children}
    </ButtonGroup>
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
        isIconOnly
        isDisabled={isInteractionLocked || !prevSiblingId}
        onPress={() => prevSiblingId && void switchBranch(prevSiblingId)}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} />
      </Button>
      <Button isDisabled={isInteractionLocked}>
        <ButtonGroup.Separator />
        {siblingIndex + 1}/{siblingTotal}
      </Button>
      <Button
        isIconOnly
        isDisabled={isInteractionLocked || !nextSiblingId}
        onPress={() => nextSiblingId && void switchBranch(nextSiblingId)}
      >
        <ButtonGroup.Separator />
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
      <MessageButtonGroup>
        <Button
          isDisabled={isInteractionLocked}
          onPress={() => {
            scrollToBottom();
            void continueMessage(message.id);
          }}
        >
          Continue
        </Button>

        <Button
          isIconOnly
          isDisabled={isInteractionLocked}
          onPress={() => {
            scrollToBottom();
            regenerate({ messageId: message.id });
          }}
        >
          <ButtonGroup.Separator />
          <HugeiconsIcon icon={Refresh04Icon} />
        </Button>

        <Button
          isIconOnly
          isDisabled={isInteractionLocked}
          onPress={() => startEditingMessage(message.id)}
        >
          <ButtonGroup.Separator />
          <HugeiconsIcon icon={Edit01Icon} />
        </Button>

        <Button
          isIconOnly
          onPress={() =>
            pinMutation.mutate({ messageId: message.id, pinned: !message.metadata?.pinned })
          }
        >
          <ButtonGroup.Separator />
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
          isDisabled={!canSave}
          onPress={() => {
            void submitEditedMessage(messageId, draft, "overwrite");
          }}
        >
          Save
        </Button>
        <Button
          isDisabled={!canSave}
          onPress={() => {
            void submitEditedMessage(messageId, draft, "branch");
          }}
        >
          <ButtonGroup.Separator />
          Save as new branch
        </Button>
        <Button
          onPress={() => {
            onDraftChange(messageText);
            stopEditingMessage();
          }}
        >
          <ButtonGroup.Separator />
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
          isIconOnly
          isDisabled={isInteractionLocked}
          onPress={() => startEditingMessage(message.id)}
        >
          <HugeiconsIcon icon={Edit01Icon} />
        </Button>

        <Button
          isIconOnly
          onPress={() =>
            pinMutation.mutate({ messageId: message.id, pinned: !message.metadata?.pinned })
          }
        >
          <ButtonGroup.Separator />
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
    <div className="group/message flex flex-col items-end gap-3">
      <Card
        variant="secondary"
        className={USER_MESSAGE_CARD_CLASS_NAME}
        onContextMenu={onContextMenu}
      >
        <Card.Content>
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
        </Card.Content>
      </Card>

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
  const [draft, setDraft] = React.useState(messageText);

  React.useEffect(() => {
    if (!isEditing) {
      setDraft(messageText);
    }
  }, [isEditing, messageText]);

  return (
    <div className="group/message flex flex-col items-start gap-3">
      <Card
        variant="transparent"
        className={ASSISTANT_MESSAGE_CARD_CLASS_NAME}
        onContextMenu={onContextMenu}
      >
        <Card.Content>
          {isEditing ? (
            <Textarea
              className="border-0 bg-transparent p-0 min-h-0 rounded-none shadow-none focus-visible:ring-0 text-[1.0625rem] leading-[1.75] text-foreground/85"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : (
            message.parts.map((part, i) =>
              part.type === "text" ? (
                <AssistantMessageTextPart key={i} text={part.text} isAnimating={isAnimating} />
              ) : null,
            )
          )}
        </Card.Content>
      </Card>

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
