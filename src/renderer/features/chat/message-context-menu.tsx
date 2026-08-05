import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { TextContextMenu } from "@/components/text-context-menu";
import {
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { messagesApi } from "@/api/messages";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { getTiptapMessageDisplayText } from "@shared/tiptap/extensions";
import {
  useChatDeleteMessage,
  useChatRegenerateMessage,
  useChatStartEditingMessage,
} from "@/features/chat/chat-context";
import { useChatScrollToBottom } from "@/features/chat/chat-scroll-context";
import { useWorkspaceStore } from "@/features/workspace/store";
import { queryKeys } from "@/queries/keys";
import { CURRENT_BRANCH_QUERY_KEY } from "@/queries/chats";
import { useChatStore } from "@/stores/chat-store";
import { useOptionalChatPane } from "./chat-pane-context";

export function usePinMessage(chatId: string) {
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

interface DeleteMessageDialogProps {
  message: HanokiUiMessage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteMessageDialog({ message, open, onOpenChange }: DeleteMessageDialogProps) {
  const deleteMessage = useChatDeleteMessage();
  const queryClient = useQueryClient();
  const [deleteAllVersions, setDeleteAllVersions] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const siblingCount = message.metadata?.siblings?.length ?? 0;
  const hasSiblings = siblingCount > 1;

  const handleOpenChange = (nextOpen: boolean) => {
    if (isDeleting) {
      return;
    }
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setDeleteAllVersions(false);
    }
  };

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await deleteMessage(message.id, deleteAllVersions ? "branch" : "message");
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chats.pinnedBranches(),
      });
      onOpenChange(false);
      setDeleteAllVersions(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-[420px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete message?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes this message and every reply that follows it in this branch.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasSiblings && (
          <label className="flex items-start gap-2.5 rounded-lg bg-surface-secondary px-3 py-2.5">
            <Checkbox
              checked={deleteAllVersions}
              onCheckedChange={(checked) => setDeleteAllVersions(checked === true)}
              disabled={isDeleting}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium">Delete all {siblingCount} versions</span>
              <span className="text-xs text-muted-foreground">
                Also removes the other branches of this message and all of their replies.
              </span>
            </span>
          </label>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            onClick={() => void handleConfirm()}
          >
            {deleteAllVersions ? "Delete all versions" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function MessageContextMenu({
  children,
  chatId,
  isInteractionLocked,
  message,
}: {
  children: React.ReactElement;
  chatId: string;
  isInteractionLocked: boolean;
  message: HanokiUiMessage;
}) {
  const navigate = useNavigate();
  const pane = useOptionalChatPane();
  const setPaneView = useWorkspaceStore((state) => state.setPaneView);
  const regenerate = useChatRegenerateMessage();
  const startEditingMessage = useChatStartEditingMessage();
  const scrollToBottom = useChatScrollToBottom();
  const pinMutation = usePinMessage(chatId);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);

  const isAssistant = message.role === "assistant";
  const isPinned = Boolean(message.metadata?.pinned);
  const hasCopyableText = message.parts.some(
    (part) =>
      (part.type === "text" && part.text.length > 0) ||
      (part.type === "data-tiptap" && part.data.content.length > 0),
  );
  const getCopyAllText = React.useCallback(() => getTiptapMessageDisplayText(message), [message]);

  const showInGraph = () => {
    if (pane) {
      setPaneView(pane.tabId, pane.paneId, "/chat/graph", message.id);
      void navigate({ to: "/chat" });
      return;
    }
    void navigate({
      search: (previous) => ({ ...previous, graphMessageId: message.id }),
      to: "/chat/graph",
    });
  };

  return (
    <>
      <TextContextMenu
        forceOpen
        copyAllText={hasCopyableText ? getCopyAllText : undefined}
        extraItems={
          <>
            <ContextMenuGroup>
              {isAssistant ? (
                <ContextMenuItem
                  disabled={isInteractionLocked}
                  onClick={() => {
                    scrollToBottom();
                    regenerate({ messageId: message.id });
                  }}
                >
                  Regenerate
                </ContextMenuItem>
              ) : null}
              <ContextMenuItem
                disabled={isInteractionLocked}
                onClick={() => startEditingMessage(message.id)}
              >
                Edit
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() =>
                  pinMutation.mutate({
                    messageId: message.id,
                    pinned: !isPinned,
                  })
                }
              >
                {isPinned ? "Unpin" : "Pin"}
              </ContextMenuItem>
              <ContextMenuItem
                variant="destructive"
                disabled={isInteractionLocked}
                onClick={() => setIsDeleteOpen(true)}
              >
                Delete Message
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem onClick={showInGraph}>Show in Graph</ContextMenuItem>
            </ContextMenuGroup>
          </>
        }
      >
        {children}
      </TextContextMenu>

      <DeleteMessageDialog message={message} open={isDeleteOpen} onOpenChange={setIsDeleteOpen} />
    </>
  );
}
