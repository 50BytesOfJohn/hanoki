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
import { useChatContextUsage, useChatModelId } from "@/features/chat/chat-context";
import { listEnabledModelsQueryOptions } from "@/queries/models";
import type { BranchCost, LatestContextUsage } from "@shared/chat/context-usage";
import type { ProviderModelInfo } from "@shared/ipc";

/**
 * Composer meter for how full the selected model's context window is. The
 * count comes from the latest reply, so every way it can drift from the next
 * request — another model measured it, a reply was cut short, a provider
 * reported nothing — is spelled out rather than hidden.
 */
export function ChatContextUsage() {
  const modelId = useChatModelId();
  const { data: enabledModels = [] } = useQuery(listEnabledModelsQueryOptions);
  const { latest, cost } = useChatContextUsage();

  const selected = enabledModels.find((model) => model.id === modelId) ?? null;
  const usage = latest.status === "measured" ? latest.usage : null;
  const maxTokens = selected?.contextLength ?? null;
  const notes = getNotes(latest, selected, enabledModels);
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
        {cost ? <CostFooter cost={cost} /> : null}
      </ContextContent>
    </Context>
  );
}

function CostFooter({ cost }: { cost: BranchCost }) {
  return (
    <ContextContentFooter>
      <span className="text-muted-foreground">Branch cost</span>
      <span className="font-mono text-foreground tabular-nums">
        {cost.unpricedResponses > 0 ? "≥ " : null}
        {formatCost(cost.total, cost.currency)}
      </span>
    </ContextContentFooter>
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
