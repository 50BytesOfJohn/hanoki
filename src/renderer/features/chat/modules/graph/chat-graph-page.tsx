import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { WorkflowSquare03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { messagesApi } from "@/api/messages";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/features/workspace/store";
import { useChatStore } from "@/stores/chat-store";
import {
  CURRENT_BRANCH_QUERY_KEY,
  getAllChatMessagesQueryOptions,
  getChatMessagesQueryOptions,
} from "@/queries/chats";
import { queryKeys } from "@/queries/keys";
import { useOptionalChatPane } from "../../chat-pane-context";

const LazyChatGraphCanvas = React.lazy(() =>
  import("./chat-graph-canvas").then((module) => ({
    default: module.ChatGraphCanvas,
  })),
);

export function ChatGraphPage({
  chatId,
  graphMessageId: paneGraphMessageId,
}: { chatId?: string; graphMessageId?: string } = {}) {
  const search = useSearch({ from: "/chat" });
  const graphMessageId = paneGraphMessageId ?? search.graphMessageId;
  const currentChatId = useWorkspaceStore((state) => (chatId ? null : state.currentChatId));
  const setPaneView = useWorkspaceStore((state) => state.setPaneView);
  const pane = useOptionalChatPane();
  const activeChatId = chatId ?? currentChatId;

  const {
    data: allMessages = [],
    error: allMessagesError,
    isLoading: isAllMessagesLoading,
  } = useQuery(
    getAllChatMessagesQueryOptions(activeChatId, {
      enabled: Boolean(activeChatId),
    }),
  );
  const {
    data: activeBranchMessages = [],
    error: activeBranchError,
    isLoading: isActiveBranchLoading,
  } = useQuery(
    getChatMessagesQueryOptions(activeChatId, null, {
      enabled: Boolean(activeChatId),
    }),
  );

  const deferredMessages = React.useDeferredValue(allMessages);
  const deferredActiveBranchMessages = React.useDeferredValue(activeBranchMessages);
  const [focusedMessageId, setFocusedMessageId] = React.useState<string | null>(
    graphMessageId ?? null,
  );
  const activeMessageIds = React.useMemo(
    () => new Set(deferredActiveBranchMessages.map((message) => message.id)),
    [deferredActiveBranchMessages],
  );
  const selectedMessageId = focusedMessageId ?? deferredActiveBranchMessages.at(-1)?.id ?? null;
  const queryClient = useQueryClient();

  const switchBranchMutation = useMutation({
    mutationFn: (messageId: string) => {
      if (!activeChatId) {
        throw new Error("Chat ID is required.");
      }

      return messagesApi.switchBranch(activeChatId, messageId);
    },
    onSuccess: (messages) => {
      if (!activeChatId) {
        return;
      }

      React.startTransition(() => {
        queryClient.setQueryData(
          queryKeys.chats.messages(activeChatId, CURRENT_BRANCH_QUERY_KEY),
          messages,
        );
      });

      const chatSession = useChatStore.getState().chatEntries.get(activeChatId);
      if (chatSession) {
        chatSession.messages = messages;
      }
    },
  });
  const handleSelectBranch = React.useCallback(
    (messageId: string) => {
      setFocusedMessageId(messageId);
      if (pane) setPaneView(pane.tabId, pane.paneId, "/chat/graph", messageId);

      if (activeMessageIds.has(messageId)) {
        return;
      }

      switchBranchMutation.mutate(messageId);
    },
    [activeMessageIds, pane, setPaneView, switchBranchMutation],
  );

  React.useEffect(() => {
    if (!graphMessageId) {
      return;
    }

    setFocusedMessageId(graphMessageId);
  }, [graphMessageId]);

  if (!activeChatId) {
    return (
      <GraphEmptyState
        description="Open a chat from the sidebar to inspect its message tree and branch structure."
        title="No chat selected"
      />
    );
  }

  if (isAllMessagesLoading || isActiveBranchLoading) {
    return <ChatGraphLoadingState />;
  }

  const errorMessage =
    getErrorMessage(allMessagesError) ??
    getErrorMessage(activeBranchError) ??
    getErrorMessage(switchBranchMutation.error);

  if (errorMessage) {
    return (
      <div className="flex h-full min-h-0 flex-col p-4">
        <Alert className="max-w-3xl" variant="destructive">
          <AlertTitle>Failed to load the chat graph</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (deferredMessages.length === 0) {
    return (
      <GraphEmptyState
        description="Start the conversation first. The graph becomes available once the chat has stored messages."
        title="This chat has no messages yet"
      />
    );
  }

  return (
    <div className="h-full min-h-0">
      <React.Suspense fallback={<ChatGraphCanvasFallback />}>
        <LazyChatGraphCanvas
          activeMessageIds={activeMessageIds}
          focusMessageId={graphMessageId ?? null}
          messages={deferredMessages}
          onSelectBranch={handleSelectBranch}
          selectedMessageId={selectedMessageId}
        />
      </React.Suspense>
    </div>
  );
}

function GraphEmptyState({ description, title }: { description: string; title: string }) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={WorkflowSquare03Icon} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ChatGraphLoadingState() {
  return <ChatGraphCanvasFallback />;
}

function ChatGraphCanvasFallback() {
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-6 p-6 lg:grid-cols-3">
      <Skeleton className="h-72 rounded-lg" />
      <Skeleton className="h-72 rounded-lg" />
      <Skeleton className="hidden h-72 rounded-lg lg:block" />
      <Skeleton className="h-72 rounded-lg" />
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return null;
}
