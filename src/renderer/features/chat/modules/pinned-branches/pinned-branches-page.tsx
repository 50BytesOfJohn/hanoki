import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { PinnedBranchSummary } from "@shared/chat/pinned-branch";
import { messagesApi } from "@/api/messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  const { data: pinned = [], isLoading, error } = useQuery(getPinnedBranchesQueryOptions());
  const { data: enabledModels = [] } = useQuery(listEnabledModelsQueryOptions);

  const modelDisplayNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const m of enabledModels) {
      map.set(m.id, m.displayName?.trim() || m.providerModelId);
    }
    return map;
  }, [enabledModels]);

  if (isLoading) {
    return <PinnedBranchesLoadingState />;
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load pinned branches: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  if (pinned.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={PinIcon} />
          </EmptyMedia>
          <EmptyTitle>No pinned branches yet</EmptyTitle>
          <EmptyDescription>
            Pin a message in any chat to bookmark that branch for quick access.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-4">
      {pinned.map((summary) => (
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
      // Update the AI SDK Chat instance so the conversation view re-renders immediately
      const chatSession = useChatStore.getState().chatEntries.get(summary.chatId);
      if (chatSession) {
        chatSession.messages = messages;
      }
      // Keep TanStack Query cache in sync
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
    <div
      className="group/row flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleRowClick();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{summary.chatTitle}</p>
        <p className="line-clamp-3 text-sm leading-relaxed">{summary.textPreview}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {modelDisplayName && (
          <Badge variant="secondary" className="text-[10px]">
            {modelDisplayName}
          </Badge>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            unpinMutation.mutate();
          }}
        >
          <HugeiconsIcon icon={PinOffIcon} />
        </Button>
      </div>
    </div>
  );
}

function PinnedBranchesLoadingState() {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}
