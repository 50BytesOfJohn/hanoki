import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { GrammarFixRequest, GrammarFixSegments } from "@shared/sumi/grammar-fix";

import { toastManager } from "@/components/ui/toast";
import { modShortcut } from "@/lib/platform";
import { sumiSettingsQueryOptions } from "@/queries/settings";
import { selectAiServerPort, useSystemStore } from "@/stores/system-store";

const REQUEST_TIMEOUT_MS = 120_000;

export interface GrammarFixTarget {
  segments: string[];
  startsMidSentence: boolean;
  apply: (corrected: readonly string[]) => "applied" | "unchanged" | "stale" | "failed";
}

const runningFixes = new WeakSet<object>();

const TOAST_TIMEOUT_MS = 5_000;

function getOutcomeToast(outcome: ReturnType<GrammarFixTarget["apply"]>) {
  switch (outcome) {
    case "applied":
      return {
        type: "success",
        title: "Grammar fixed",
        description: `Press ${modShortcut("Z")} to undo.`,
      };
    case "unchanged":
      return { type: "info", title: "No grammar issues found" };
    case "stale":
      return {
        type: "warning",
        title: "Grammar fix skipped",
        description: "The text changed while Sumi was working, so nothing was replaced.",
      };
    case "failed":
      return {
        type: "error",
        title: "Grammar fix failed",
        description: "The correction couldn't be applied, so nothing was changed.",
      };
  }
}

async function requestCorrections(apiUrl: string, target: GrammarFixTarget): Promise<string[]> {
  const { segments, startsMidSentence } = target;
  const response = await fetch(`${apiUrl}/grammar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments, startsMidSentence } satisfies GrammarFixRequest),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error((await response.text()).trim() || "Sumi could not fix this text.");
  }

  const result: GrammarFixSegments = await response.json();
  return result.segments;
}

async function runGrammarFix(apiUrl: string, source: object, target: GrammarFixTarget) {
  if (runningFixes.has(source)) {
    return;
  }
  if (target.segments.length === 0) {
    toastManager.add({ type: "info", title: "No text to fix" });
    return;
  }

  runningFixes.add(source);
  const loadingToast = toastManager.add({ type: "loading", title: "Fixing grammar…", timeout: 0 });
  try {
    const corrected = await requestCorrections(apiUrl, target);
    toastManager.update(loadingToast, {
      ...getOutcomeToast(target.apply(corrected)),
      timeout: TOAST_TIMEOUT_MS,
    });
  } catch (error) {
    toastManager.update(loadingToast, {
      type: "error",
      title: "Grammar fix failed",
      description: error instanceof Error ? error.message : "Sumi could not fix this text.",
      timeout: TOAST_TIMEOUT_MS,
    });
  } finally {
    runningFixes.delete(source);
  }
}

/** Null while Sumi's writing tools are off or not ready, so callers can hide their entry point. */
export function useGrammarFix() {
  const port = useSystemStore(selectAiServerPort);
  const { data: settings } = useQuery(sumiSettingsQueryOptions);
  const promptActions = settings?.promptActions;
  const isAvailable = Boolean(port && promptActions?.enabled && promptActions.model);

  return React.useMemo(
    () =>
      isAvailable
        ? (source: object, target: GrammarFixTarget) =>
            runGrammarFix(`http://127.0.0.1:${port}/api/sumi`, source, target)
        : null,
    [isAvailable, port],
  );
}
