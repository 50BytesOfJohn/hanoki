import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Chatting01Icon, Clock01Icon, PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Card, Chip, Skeleton, Tooltip } from "@heroui/react";

import type { PinnedBranchSummary } from "@shared/chat/pinned-branch";
import { messagesApi } from "@/api/messages";
import { getPinnedBranchesQueryOptions, CURRENT_BRANCH_QUERY_KEY } from "@/queries/chats";
import { listEnabledModelsQueryOptions } from "@/queries/models";
import { queryKeys } from "@/queries/keys";
import { useWorkspaceStore } from "@/features/workspace/store";
import { useChatStore } from "@/stores/chat-store";

export function PinnedBranchesPage() {
  const chatId = useWorkspaceStore((s) => s.currentChatId);

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
      <PinnedBranchesShell>
        <PinnedBranchesEmptyState
          title="No chat selected"
          description="Open a chat to view its pinned branches."
        />
      </PinnedBranchesShell>
    );
  }

  if (isLoading) {
    return <PinnedBranchesLoadingState />;
  }

  if (error) {
    return (
      <PinnedBranchesShell>
        <Card variant="secondary">
          <Card.Header>
            <Card.Title>Unable to Load Pinned Branches</Card.Title>
          </Card.Header>
          <Card.Content>
            <p className="text-sm text-danger">
              Failed to load pinned branches:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </Card.Content>
        </Card>
      </PinnedBranchesShell>
    );
  }

  if (filteredPinned.length === 0) {
    return (
      <PinnedBranchesShell>
        <PinnedBranchesEmptyState
          title="No pinned branches yet"
          description="Pin a message in this chat to bookmark that branch for quick access."
        />
      </PinnedBranchesShell>
    );
  }

  return (
    <PinnedBranchesShell>
      <div className="flex flex-col gap-2">
        {filteredPinned.map((summary) => (
          <PinnedBranchCard
            key={summary.messageId}
            summary={summary}
            modelDisplayName={
              summary.model ? (modelDisplayNameById.get(summary.model) ?? summary.model) : null
            }
          />
        ))}
      </div>
    </PinnedBranchesShell>
  );
}

interface PinnedBranchesShellProps {
  children: React.ReactNode;
}

function PinnedBranchesShell({ children }: PinnedBranchesShellProps) {
  return (
    <main className="h-full min-h-0 overflow-y-auto px-6 py-16">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">{children}</div>
    </main>
  );
}

interface PinnedBranchesEmptyStateProps {
  title: string;
  description: string;
}

function PinnedBranchesEmptyState({ title, description }: PinnedBranchesEmptyStateProps) {
  return (
    <Card className="items-center border border-border/60 py-10 text-center" variant="transparent">
      <div className="flex size-10 items-center justify-center rounded-xl bg-surface-secondary text-muted">
        <HugeiconsIcon icon={PinIcon} size={22} />
      </div>
      <Card.Header className="items-center">
        <Card.Title>{title}</Card.Title>
        <Card.Description className="max-w-md">{description}</Card.Description>
      </Card.Header>
    </Card>
  );
}

interface PinnedBranchCardProps {
  summary: PinnedBranchSummary;
  modelDisplayName: string | null;
}

function PinnedBranchCard({ summary, modelDisplayName }: PinnedBranchCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentChat = useWorkspaceStore((state) => state.setCurrentChat);

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

  const handleOpenInChat = () => {
    setCurrentChat(summary.chatId);
    switchBranchMutation.mutate(undefined, {
      onSuccess: () => {
        void navigate({ to: "/chat" });
      },
    });
  };

  const preview = summary.textPreview.trim() || "Pinned message has no text preview.";
  const messageCreatedDate = formatMessageCreatedDate(summary.createdAt);

  return (
    <Card className="border border-border/60" variant="transparent">
      <Card.Header className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Chip size="sm" variant="soft">
            <Chip.Label>{summary.role}</Chip.Label>
          </Chip>
          {modelDisplayName && (
            <Chip className="max-w-full sm:max-w-80" size="sm" variant="secondary">
              <Chip.Label className="truncate">{modelDisplayName}</Chip.Label>
            </Chip>
          )}
          {messageCreatedDate ? (
            <Chip size="sm" variant="secondary">
              <HugeiconsIcon icon={Clock01Icon} size={14} />
              <Chip.Label>{messageCreatedDate}</Chip.Label>
            </Chip>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto sm:justify-end">
          <Button
            size="sm"
            variant="tertiary"
            isPending={switchBranchMutation.isPending}
            onPress={handleOpenInChat}
          >
            <HugeiconsIcon icon={Chatting01Icon} size={15} />
            Open in chat
          </Button>
          <Tooltip delay={0}>
            <Button
              isIconOnly
              size="sm"
              variant="danger"
              isPending={unpinMutation.isPending}
              aria-label="Unpin branch"
              onPress={() => unpinMutation.mutate()}
            >
              <HugeiconsIcon icon={PinOffIcon} size={15} />
            </Button>
            <Tooltip.Content>Unpin branch</Tooltip.Content>
          </Tooltip>
        </div>
      </Card.Header>

      <Card.Content className="pt-0">
        <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
          {preview}
        </p>
      </Card.Content>

      {switchBranchMutation.error || unpinMutation.error ? (
        <Card.Footer>
          <p className="text-xs text-danger">
            {getMutationErrorMessage(switchBranchMutation.error ?? unpinMutation.error)}
          </p>
        </Card.Footer>
      ) : null}
    </Card>
  );
}

function PinnedBranchesLoadingState() {
  return (
    <PinnedBranchesShell>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border border-border/60" variant="transparent">
            <Card.Header className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-40 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
              <div className="flex w-full items-center gap-1.5 sm:w-auto">
                <Skeleton className="h-8 w-28 rounded" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </Card.Header>
            <Card.Content className="pt-0">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-4/5 rounded" />
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>
    </PinnedBranchesShell>
  );
}

function formatMessageCreatedDate(value: number) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getMutationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
