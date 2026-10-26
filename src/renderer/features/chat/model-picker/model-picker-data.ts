import type { ProviderInfo, ProviderModelInfo, RecentModelUsage } from "@shared/ipc";
import {
  clampReasoningEffort,
  parseReasoningEffortAlias,
  type ReasoningEffort,
} from "@shared/models/reasoning";

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

function normalize(value: string) {
  return value.toLowerCase();
}

/** "claude-opus-4.5" and "Opus 4.5" both become comparable with "opus45". */
function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const WORD_SEPARATOR = /[\s\-_./:]+/;

function scoreToken(token: string, label: string, haystack: string, compactHaystack: string) {
  if (label.startsWith(token)) return 4;
  if (label.split(WORD_SEPARATOR).some((word) => word.startsWith(token))) return 3;
  if (label.includes(token)) return 2;
  if (haystack.includes(token)) return 1.5;
  const compactToken = compact(token);
  if (compactToken && compactHaystack.includes(compactToken)) return 1;
  return 0;
}

/**
 * Ranks models against a free-text query. Every word has to match the name,
 * id, provider or creator — except a trailing effort word ("high", "max", …),
 * which instead preselects that level on models that reason.
 */
export function searchModelPickerRows({
  models,
  providers,
  query,
}: {
  models: readonly ProviderModelInfo[];
  providers: readonly ProviderInfo[];
  query: string;
}): ModelPickerRow[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const providerNames = new Map(providers.map((provider) => [provider.id, provider.displayName]));
  const results: { row: ModelPickerRow; score: number; label: string }[] = [];

  for (const model of models) {
    const label = normalize(getModelLabel(model));
    const haystack = normalize(
      [label, model.providerModelId, providerNames.get(model.providerId), model.creator]
        .filter(Boolean)
        .join(" "),
    );
    const compactHaystack = compact(haystack);
    const offered = model.reasoningEfforts ?? [];
    let score = 0;
    let effort: ReasoningEffort | null | undefined;
    let matched = true;

    for (const token of tokens) {
      const tokenScore = scoreToken(token, label, haystack, compactHaystack);
      if (tokenScore > 0) {
        score += tokenScore;
        continue;
      }

      const requested = parseReasoningEffortAlias(token);
      const clamped = requested ? clampReasoningEffort(requested, offered) : null;
      if (clamped && effort === undefined) {
        effort = clamped;
        continue;
      }

      matched = false;
      break;
    }

    // A query made only of an effort word should not list every reasoning model.
    if (!matched || score === 0) {
      continue;
    }

    if (isModelPinned(model)) {
      score += 0.5;
    }

    results.push({
      row: {
        key: `search:${model.id}`,
        model,
        ...(effort !== undefined ? { effort } : {}),
        showProvider: true,
      },
      score,
      label,
    });
  }

  return results
    .sort(
      (a, b) =>
        b.score - a.score || a.label.length - b.label.length || collator.compare(a.label, b.label),
    )
    .map((result) => result.row);
}
