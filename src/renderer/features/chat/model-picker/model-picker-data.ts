import type { ProviderInfo, ProviderModelInfo, RecentModelUsage } from "@shared/ipc";
import {
  clampReasoningEffort,
  parseReasoningEffortAlias,
  type ReasoningEffort,
} from "@shared/models/reasoning";
import {
  compareSearchSummaries,
  createSearchIndex,
  type SearchIndex,
  type SearchSummary,
  summarizeSearchTokens,
  tokenizeSearchQuery,
} from "@/lib/fuzzy-search";

/** One selectable line in the picker. */
export interface ModelPickerRow {
  /** Unique across the whole list; also the cmdk item value. */
  key: string;
  model: ProviderModelInfo;
  /**
   * Effort the row selects with: fixed for recent pairs, or asked for in the
   * search ("opus high"). Absent rows fall back to the model's own default.
   */
  effort?: ReasoningEffort | null;
  /** Recent pairs can be dropped from the list instead of hiding the model. */
  isRecent?: boolean;
  /** The provider is not obvious from a section heading. */
  showProvider: boolean;
}

export type ModelPickerSectionKind = "all" | "pinned" | "recent" | "provider";

/** One entry of the picker's rail and the rows it lists. */
export interface ModelPickerSection {
  id: string;
  kind: ModelPickerSectionKind;
  label: string;
  /** Set for provider sections; each provider account gets its own section. */
  provider?: ProviderInfo;
  rows: ModelPickerRow[];
}

/** The search scope across every section; only offered while searching. */
export const ALL_SECTION: ModelPickerSection = { id: "all", kind: "all", label: "All", rows: [] };

/** The right-click menu stays short; the picker's own section has room for more. */
export const RECENT_MODELS_SHOWN = 5;
export const RECENT_MODELS_IN_SECTION = 10;

export function getModelLabel(model: Pick<ProviderModelInfo, "displayName" | "providerModelId">) {
  return model.displayName?.trim() || model.providerModelId;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareModelsByLabel(a: ProviderModelInfo, b: ProviderModelInfo) {
  return collator.compare(getModelLabel(a), getModelLabel(b));
}

export function isModelPinned(model: ProviderModelInfo) {
  return model.pinnedAt !== null && model.pinnedAt !== undefined;
}

export function getPinnedModels(models: readonly ProviderModelInfo[]) {
  return models.filter(isModelPinned).sort((a, b) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0));
}

/** Recent pairs whose model can still be picked, newest first. */
export function getRecentRows(
  models: readonly ProviderModelInfo[],
  recents: readonly RecentModelUsage[],
  limit = RECENT_MODELS_SHOWN,
): ModelPickerRow[] {
  const modelsById = new Map(models.map((model) => [model.id, model]));
  const rows: ModelPickerRow[] = [];

  for (const usage of recents) {
    const model = modelsById.get(usage.modelId);
    if (!model) {
      continue;
    }

    const offered = model.reasoningEfforts ?? [];
    const effort =
      usage.reasoningEffort && offered.includes(usage.reasoningEffort)
        ? usage.reasoningEffort
        : null;
    const key = `recent:${model.id}:${effort ?? "default"}`;
    // A level the model dropped collapses into Default, which may already be listed.
    if (rows.some((row) => row.key === key)) {
      continue;
    }

    rows.push({ key, model, effort, isRecent: true, showProvider: true });
    if (rows.length === limit) {
      break;
    }
  }

  return rows;
}

/** Pinned, then recent, then one section per provider account. Empty sections are left out. */
export function buildModelPickerSections({
  models,
  providers,
  recents,
}: {
  models: readonly ProviderModelInfo[];
  providers: readonly ProviderInfo[];
  recents: readonly RecentModelUsage[];
}): ModelPickerSection[] {
  const sections: ModelPickerSection[] = [];
  const pinned = getPinnedModels(models);

  if (pinned.length > 0) {
    sections.push({
      id: "pinned",
      kind: "pinned",
      label: "Pinned",
      rows: pinned.map((model) => ({ key: `pinned:${model.id}`, model, showProvider: true })),
    });
  }

  const recentRows = getRecentRows(models, recents, RECENT_MODELS_IN_SECTION);
  if (recentRows.length > 0) {
    sections.push({ id: "recent", kind: "recent", label: "Recent", rows: recentRows });
  }

  const modelsByProviderId = new Map<string, ProviderModelInfo[]>();
  for (const model of models) {
    const providerModels = modelsByProviderId.get(model.providerId);
    if (providerModels) {
      providerModels.push(model);
    } else {
      modelsByProviderId.set(model.providerId, [model]);
    }
  }
  for (const provider of providers) {
    const providerModels = modelsByProviderId.get(provider.id);
    if (!providerModels?.length) {
      continue;
    }

    sections.push({
      id: `provider:${provider.id}`,
      kind: "provider",
      label: provider.displayName,
      provider,
      rows: providerModels.sort(compareModelsByLabel).map((model) => ({
        key: `provider:${model.id}`,
        model,
        showProvider: false,
      })),
    });
  }

  return sections;
}

/**
 * The section to open on: the remembered one while it still exists, else the
 * one holding the model in use, else the first.
 */
export function resolveModelPickerSection(
  sections: readonly ModelPickerSection[],
  rememberedId: string | null,
  currentModelId: string | null,
): ModelPickerSection {
  return (
    sections.find((section) => section.id === rememberedId) ??
    sections.find((section) => section.rows.some((row) => row.model.id === currentModelId)) ??
    sections[0] ??
    ALL_SECTION
  );
}

/**
 * Narrows ranked search results to one section, keeping the ranking. Recent
 * keeps its own pairs (and their efforts) in recency order instead.
 */
export function getSectionSearchRows(
  section: ModelPickerSection,
  ranked: readonly ModelPickerRow[],
): ModelPickerRow[] {
  switch (section.kind) {
    case "all":
      return [...ranked];
    case "pinned":
      return ranked.filter((row) => isModelPinned(row.model));
    case "recent": {
      const matched = new Set(ranked.map((row) => row.model.id));
      return section.rows.filter((row) => matched.has(row.model.id));
    }
    case "provider":
      return ranked
        .filter((row) => row.model.providerId === section.provider?.id)
        .map((row) => ({ ...row, showProvider: false }));
  }
}

export type ModelSearchIndex = SearchIndex<ProviderModelInfo>;

/** Built once per model list; searching it is cheap enough for every keystroke. */
export function createModelSearchIndex(
  models: readonly ProviderModelInfo[],
  providers: readonly ProviderInfo[],
): ModelSearchIndex {
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.displayName]));
  return createSearchIndex(models, (model) => [
    { text: getModelLabel(model) },
    { text: model.providerModelId, weight: 0.9 },
    { text: providerNames.get(model.providerId), weight: 0.7 },
    { text: model.creator, weight: 0.7 },
  ]);
}

/**
 * Ranks models against a free-text query, forgiving typos and loose version
 * numbers ("deepseek 4"). Models matching every word come first, then ones
 * matching most of the query. An effort word ("high", "max", …) instead
 * preselects that level on models that reason.
 */
export function searchModelPickerRows({
  index,
  query,
}: {
  index: ModelSearchIndex;
  query: string;
}): ModelPickerRow[] {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) {
    return [];
  }

  // Effort words are matched literally, so "high" never reads as a typo.
  const efforts = tokens.map((token) => parseReasoningEffortAlias(token));
  const tokenScores = tokens.map((token, position) =>
    index.scoreToken(token, { allowTypos: !efforts[position] }),
  );
  const results: { row: ModelPickerRow; summary: SearchSummary; label: string }[] = [];

  for (const [position, model] of index.items.entries()) {
    const offered = model.reasoningEfforts ?? [];
    // The query words left once an effort word is set aside, and their scores.
    const searched: string[] = [];
    const scores: number[] = [];
    let effort: ReasoningEffort | null | undefined;
    let matched = true;

    for (const [tokenIndex, token] of tokens.entries()) {
      const tokenScore = tokenScores[tokenIndex]![position]!;
      const requested = efforts[tokenIndex];
      if (tokenScore > 0 || !requested) {
        searched.push(token);
        scores.push(tokenScore);
        continue;
      }

      const clamped = clampReasoningEffort(requested, offered);
      if (clamped && effort === undefined) {
        effort = clamped;
        continue;
      }

      matched = false;
      break;
    }

    // A query made only of an effort word should not list every reasoning model.
    const summary = matched ? summarizeSearchTokens(searched, scores) : null;
    if (!summary) {
      continue;
    }

    if (isModelPinned(model)) {
      summary.score += 0.5;
    }

    results.push({
      row: {
        key: `search:${model.id}`,
        model,
        ...(effort !== undefined ? { effort } : {}),
        showProvider: true,
      },
      summary,
      label: getModelLabel(model),
    });
  }

  return results
    .sort(
      (a, b) =>
        compareSearchSummaries(a.summary, b.summary) ||
        a.label.length - b.label.length ||
        collator.compare(a.label, b.label),
    )
    .map((result) => result.row);
}
