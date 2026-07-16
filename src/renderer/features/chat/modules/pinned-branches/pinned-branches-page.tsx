import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Chatting01Icon, PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PinnedBranchSummary } from "@shared/chat/pinned-branch";
import { messagesApi } from "@/api/messages";
import { SettingsPageHeader, SettingsPageShell } from "@/features/settings/settings-ui";
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
          description="Open a chat to see the branches you've pinned in it."
        />
      </PinnedBranchesShell>
    );
  }

  return (
    <PinnedBranchesShell>
      <SettingsPageHeader
        title="Pinned Branches"
        description="Bookmarked points in this conversation. Open one to switch the chat to that branch."
      />

      {isLoading ? (
        <PinnedBranchesSkeleton />
      ) : error ? (
        <PinnedBranchesEmptyState
          title="Unable to load pinned branches"
          description={error instanceof Error ? error.message : "Something went wrong."}
        />
      ) : filteredPinned.length === 0 ? (
        <PinnedBranchesEmptyState
          title="Nothing pinned yet"
          description="Pin a message in the conversation to bookmark its branch here."
        />
      ) : (
        <ItemGroup className="gap-2">
          {filteredPinned.map((summary) => (
            <PinnedBranchItem
              key={summary.messageId}
              summary={summary}
              modelDisplayName={
                summary.model ? (modelDisplayNameById.get(summary.model) ?? summary.model) : null
              }
            />
          ))}
        </ItemGroup>
      )}
    </PinnedBranchesShell>
  );
}

function PinnedBranchesShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
      <SettingsPageShell>{children}</SettingsPageShell>
    </div>
  );
}

function PinnedBranchesEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Empty className="rounded-lg border border-border py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-surface-secondary text-muted-foreground">
          <HugeiconsIcon icon={PinIcon} size={20} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription className="max-w-sm">{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function PinnedBranchItem({
  summary,
  modelDisplayName,
}: {
  summary: PinnedBranchSummary;
  modelDisplayName: string | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentChat = useWorkspaceStore((state) => state.setCurrentChat);

  const switchBranchMutation = useMutation({
    mutationFn: () => messagesApi.switchBranch(summary.chatId, summary.messageId),
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chats.pinnedBranches(),
      });
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

  const preview = summary.textPreview.trim() || "This pinned message has no text preview.";
  const mutationError = switchBranchMutation.error ?? unpinMutation.error;

  return (
    <Item variant="outline" className="items-start">
      <ItemContent className="gap-1.5">
        <ItemDescription className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
          {preview}
        </ItemDescription>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <Badge variant="secondary" className="capitalize">
            {summary.role}
          </Badge>
          {modelDisplayName ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{modelDisplayName}</span>
            </>
          ) : null}
          {Number.isFinite(summary.createdAt) ? (
            <>
              <span aria-hidden>·</span>
              <span>{formatMessageCreatedDate(summary.createdAt)}</span>
            </>
          ) : null}
        </div>
      </ItemContent>

      <ItemActions className="gap-1 opacity-0 transition-opacity duration-100 group-hover/item:opacity-100 group-focus-within/item:opacity-100">
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={switchBranchMutation.isPending}
          onClick={handleOpenInChat}
        >
          {switchBranchMutation.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <HugeiconsIcon icon={Chatting01Icon} data-icon="inline-start" />
          )}
          Open in chat
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-danger"
                disabled={unpinMutation.isPending}
                aria-label="Unpin branch"
                onClick={() => unpinMutation.mutate()}
              />
            }
          >
            {unpinMutation.isPending ? <Spinner /> : <HugeiconsIcon icon={PinOffIcon} />}
          </TooltipTrigger>
          <TooltipContent>Unpin branch</TooltipContent>
        </Tooltip>
      </ItemActions>

      {mutationError ? (
        <ItemFooter>
          <p className="text-xs text-danger">
            {mutationError instanceof Error ? mutationError.message : "Something went wrong."}
          </p>
        </ItemFooter>
      ) : null}
    </Item>
  );
}

function PinnedBranchesSkeleton() {
  return (
    <ItemGroup className="gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Item key={i} variant="outline" className="items-start">
          <ItemContent className="gap-2 py-0.5">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-3/5 rounded" />
            <div className="flex items-center gap-2 pt-0.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3.5 w-32 rounded" />
            </div>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

function formatMessageCreatedDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
