import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Card, Chip, Skeleton } from "@heroui/react";

import type { PinnedBranchSummary } from "@shared/chat/pinned-branch";
import { messagesApi } from "@/api/messages";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getPinnedBranchesQueryOptions, CURRENT_BRANCH_QUERY_KEY } from "@/queries/chats";
import { listEnabledModelsQueryOptions } from "@/queries/models";
import { queryKeys } from "@/queries/keys";
import { useWorkspaceStore } from "@/features/workspace/store";
import { useChatStore } from "@/stores/chat-store";

export function PinnedBranchesPage() {
  const activeTab = useWorkspaceStore((s) => s.activeTab());
  const chatId = activeTab?.type === "chat" ? activeTab.chatId : null;

  const { data: pinned = [], isLoading, error } = useQuery(getPinnedBranchesQueryOptions());
  const { data: enabledModels = [] } = useQuery(listEnabledModelsQueryOptions);

  const modelDisplayNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const m of enabledModels) {
      map.set(m.id, m.displayName?.trim() || m.providerModelId);
    }
    return map;
  }, [enabledModels]);

  const filteredPinned = React.useMemo(() => {
    if (!chatId) return [];
    return pinned.filter((summary) => summary.chatId === chatId);
  }, [pinned, chatId]);

  if (!chatId) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={PinIcon} />
          </EmptyMedia>
          <EmptyTitle>No chat selected</EmptyTitle>
          <EmptyDescription>Open a chat to view its pinned branches.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isLoading) {
    return <PinnedBranchesLoadingState />;
  }

  if (error) {
    return (
      <div className="p-4">
        <Card variant="secondary">
          <Card.Content>
            <p className="text-sm text-danger">
              Failed to load pinned branches:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </Card.Content>
        </Card>
      </div>
    );
  }

  if (filteredPinned.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={PinIcon} />
          </EmptyMedia>
          <EmptyTitle>No pinned branches yet</EmptyTitle>
          <EmptyDescription>
            Pin a message in this chat to bookmark that branch for quick access.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-4">
      {filteredPinned.map((summary) => (
        <PinnedBranchRow
          key={summary.messageId}
          summary={summary}
          modelDisplayName={
            summary.model ? (modelDisplayNameById.get(summary.model) ?? summary.model) : null
          }
        />
      ))}
    </div>
  );
}

interface PinnedBranchRowProps {
  summary: PinnedBranchSummary;
  modelDisplayName: string | null;
}

function PinnedBranchRow({ summary, modelDisplayName }: PinnedBranchRowProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openTab = useWorkspaceStore((state) => state.openTab);

  const switchBranchMutation = useMutation({
    mutationFn: async () => {
      const messages = await messagesApi.switchBranch(summary.chatId, summary.messageId);
      return messages;
    },
    onSuccess: (messages) => {
      const chatSession = useChatStore.getState().chatEntries.get(summary.chatId);
      if (chatSession) {
        chatSession.messages = messages;
      }
      queryClient.setQueryData(
        queryKeys.chats.messages(summary.chatId, CURRENT_BRANCH_QUERY_KEY),
        messages,
      );
    },
  });

  const unpinMutation = useMutation({
    mutationFn: () => messagesApi.setMessagePinned(summary.messageId, false),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats.pinnedBranches() });
    },
  });

  const handleRowClick = () => {
    openTab({ type: "chat", chatId: summary.chatId });
    switchBranchMutation.mutate(undefined, {
      onSuccess: () => {
        void navigate({ to: "/chat" });
      },
    });
  };

  return (
    <Card
      className="group/row cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleRowClick();
        }
      }}
    >
      <Card.Header className="flex-row items-start justify-between gap-3">
        <p className="text-muted min-w-0 truncate text-xs">{summary.chatTitle}</p>
        <div
          className="flex shrink-0 items-center gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {modelDisplayName && (
            <Chip size="sm" variant="secondary">
              {modelDisplayName}
            </Chip>
          )}
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            isPending={unpinMutation.isPending}
            aria-label="Unpin branch"
            onPress={() => unpinMutation.mutate()}
          >
            <HugeiconsIcon icon={PinOffIcon} size={16} />
          </Button>
        </div>
      </Card.Header>
      <Card.Content className="pt-0">
        <p className="line-clamp-3 text-sm leading-relaxed">{summary.textPreview}</p>
      </Card.Content>
    </Card>
  );
}

function PinnedBranchesLoadingState() {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <Card.Header>
            <Skeleton className="h-3 w-28 rounded" />
          </Card.Header>
          <Card.Content className="pt-0 pb-1">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-4/5 rounded" />
              <Skeleton className="h-4 w-3/5 rounded" />
            </div>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
