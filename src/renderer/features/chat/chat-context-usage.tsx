import { useQuery } from "@tanstack/react-query";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
  ContextUsageRow,
  formatTokens,
} from "@/components/ai-elements/context";
import { useChatContextUsage, useChatId, useChatModelId } from "@/features/chat/chat-context";
import { getChatQueryOptions } from "@/queries/chats";
import { listEnabledModelsQueryOptions } from "@/queries/models";
import type { ChatCost } from "@shared/chat/chat-cost";
import type { BranchCost, LatestContextUsage } from "@shared/chat/context-usage";
import type { ProviderModelInfo } from "@shared/ipc";

/**
 * Composer meter for how full the selected model's context window is. The
 * count comes from the latest reply, so every way it can drift from the next
 * request — another model measured it, a reply was cut short, a provider
 * reported nothing — is spelled out rather than hidden.
 */
export function ChatContextUsage() {
  const chatId = useChatId();
  const modelId = useChatModelId();
  const { data: enabledModels = [] } = useQuery(listEnabledModelsQueryOptions);
  const { data: chatCost } = useQuery({
    ...getChatQueryOptions(chatId),
    select: (chat) => chat.data.cost,
  });
  const { latest, cost: branchCost } = useChatContextUsage();

  const selected = enabledModels.find((model) => model.id === modelId) ?? null;
  const usage = latest.status === "measured" ? latest.usage : null;
  const maxTokens = selected?.contextLength ?? null;
  const notes = [...getNotes(latest, selected, enabledModels), ...getCostNotes(chatCost)];
  const isApproximate =
    usage !== null &&
    (usage.isPartial || usage.skippedResponses > 0 || isMeasuredByOtherModel(latest, selected));

  return (
    <Context usedTokens={usage?.used ?? null} maxTokens={maxTokens} isApproximate={isApproximate}>
      <ContextTrigger />
      <ContextContent>
        <ContextContentHeader />
        {usage ? (
          <ContextContentBody>
            <ContextUsageRow
              label="Input"
              tokens={usage.input}
              hint={usage.cached ? `${formatTokens(usage.cached)} cached` : undefined}
            />
            <ContextUsageRow label="Output" tokens={usage.output - usage.reasoning} />
            {usage.reasoning > 0 ? (
              <ContextUsageRow label="Reasoning" tokens={usage.reasoning} hint="not carried over" />
            ) : null}
          </ContextContentBody>
        ) : null}
        {notes.length > 0 ? (
          <ContextContentBody className="gap-2">
            {notes.map((note) => (
              <p key={note} className="flex gap-1.5 leading-relaxed text-muted-foreground">
                <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-3 shrink-0" />
                {note}
              </p>
            ))}
          </ContextContentBody>
        ) : null}
        {branchCost || chatCost ? <CostFooter branchCost={branchCost} chatCost={chatCost} /> : null}
      </ContextContent>
    </Context>
  );
}

function CostFooter({
  branchCost,
  chatCost,
}: {
  branchCost: BranchCost | null;
  chatCost: ChatCost | undefined;
}) {
  return (
    <ContextContentFooter className="flex-col items-stretch gap-1.5">
      {branchCost ? (
        <CostRow
          label="Branch cost"
          value={`${branchCost.unpricedResponses > 0 ? "≥ " : ""}${formatCost(branchCost.total, branchCost.currency)}`}
        />
      ) : null}
      {chatCost ? (
        <CostRow
          label="Chat cost"
          title="All replies in this chat, including other branches, regenerations and deleted replies."
          value={
            chatCost.pricedResponses === 0
              ? "Unknown"
              : `${chatCost.unpricedResponses > 0 ? "≥ " : ""}${formatCost(chatCost.total, chatCost.currency)}`
          }
        />
      ) : null}
    </ContextContentFooter>
  );
}

function CostRow({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground" title={title}>
        {label}
      </span>
      <span className="font-mono text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function getNotes(
  latest: LatestContextUsage,
  selected: ProviderModelInfo | null,
  enabledModels: readonly ProviderModelInfo[],
): string[] {
  const notes: string[] = [];

  if (latest.status === "empty") {
    notes.push("Usage appears after the first reply.");
  } else if (latest.status === "unavailable") {
    notes.push("The provider didn't report token usage for the replies in this chat.");
  } else {
    const { usage } = latest;

    if (usage.skippedResponses > 0) {
      notes.push("The latest reply didn't report token usage, so this reflects an earlier one.");
    }
    if (usage.isPartial) {
      notes.push("That reply was interrupted, so its partial output isn't counted.");
    }
    if (selected && isMeasuredByOtherModel(latest, selected)) {
      const measuredWith = enabledModels.find((model) => model.id === usage.modelId);
      notes.push(
        `Measured with ${measuredWith ? getModelName(measuredWith) : "another model"}. ${getModelName(selected)} counts tokens differently, so this is an estimate.`,
      );
    }
  }

  if (selected && selected.contextLength == null) {
    notes.push("The provider doesn't report this model's context window size.");
  }

  return notes;
}

function getCostNotes(cost: ChatCost | undefined): string[] {
  if (!cost || cost.unpricedResponses === 0) {
    return [];
  }
  if (cost.pricedResponses === 0) {
    return ["No reply in this chat had a known price, so its cost is unknown."];
  }
  const replies = cost.unpricedResponses === 1 ? "1 reply" : `${cost.unpricedResponses} replies`;
  return [`${replies} had no known price, so the chat cost is a lower bound.`];
}

function isMeasuredByOtherModel(
  latest: LatestContextUsage,
  selected: ProviderModelInfo | null,
): boolean {
  return (
    latest.status === "measured" &&
    selected !== null &&
    latest.usage.modelId !== null &&
    latest.usage.modelId !== selected.id
  );
}

function getModelName(model: ProviderModelInfo): string {
  return model.displayName ?? model.providerModelId;
}

function formatCost(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value);
}
