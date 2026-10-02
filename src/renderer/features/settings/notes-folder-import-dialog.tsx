import { useEffect, useSyncExternalStore } from "react";

import type { NotesFolderImportProgressEvent } from "@shared/events";
import {
  NOTES_FOLDER_REIMPORT_NOTE,
  notesFolderImportSkipCount,
  type NotesFolderImportResult,
} from "@shared/markdown/folder-io";

import { markdownApi } from "@/api/markdown";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ImportedNotes = Extract<NotesFolderImportResult, { status: "imported" }>;

type ImportUiState =
  | { phase: "idle" }
  | { phase: "running"; progress: NotesFolderImportProgressEvent | null; canceling: boolean }
  | { phase: "summary"; result: ImportedNotes };

let state: ImportUiState = { phase: "idle" };
const listeners = new Set<() => void>();

function setImportUiState(next: ImportUiState): void {
  state = next;
  for (const listener of listeners) listener();
}

export const notesImportUi = {
  begin(): void {
    setImportUiState({ phase: "running", progress: null, canceling: false });
  },
  progress(event: NotesFolderImportProgressEvent): void {
    if (state.phase !== "running") return;
    setImportUiState({ phase: "running", progress: event, canceling: state.canceling });
  },
  finish(result: ImportedNotes): void {
    setImportUiState({ phase: "summary", result });
  },
  reset(): void {
    setImportUiState({ phase: "idle" });
  },
  markCanceling(): void {
    if (state.phase !== "running") return;
    setImportUiState({ phase: "running", progress: state.progress, canceling: true });
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ImportUiState {
    return state;
  },
};

export function NotesFolderImportDialog() {
  const ui = useSyncExternalStore(
    notesImportUi.subscribe,
    notesImportUi.getSnapshot,
    notesImportUi.getSnapshot,
  );

  useEffect(() => {
    return window.electronAPI.onSystemEvent((event) => {
      if (event.type === "markdown:import-progress") notesImportUi.progress(event);
    });
  }, []);

  const progress = ui.phase === "running" ? ui.progress : null;
  const open = ui.phase === "summary" || progress !== null;

  return (
    <Dialog
      open={open}
      disablePointerDismissal={ui.phase === "running"}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return;
        if (ui.phase === "running") {
          void cancelImport();
          return;
        }
        notesImportUi.reset();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        {ui.phase === "running" && progress ? (
          <ProgressBody
            progress={progress}
            canceling={ui.canceling}
            onCancel={() => void cancelImport()}
          />
        ) : null}
        {ui.phase === "summary" ? <SummaryBody result={ui.result} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ProgressBody({
  progress,
  canceling,
  onCancel,
}: {
  progress: NotesFolderImportProgressEvent;
  canceling: boolean;
  onCancel: () => void;
}) {
  const percent = progress.total === 0 ? 0 : Math.round((progress.index / progress.total) * 100);

  return (
    <>
      <DialogHeader>
        <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Importing
        </p>
        <DialogTitle>
          Importing… {progress.index} of {progress.total}
        </DialogTitle>
        <DialogDescription className="truncate text-[12px]" title={progress.folderPath}>
          {truncateMiddle(progress.folderPath)}
        </DialogDescription>
      </DialogHeader>
      <div className="h-px bg-separator" />
      <div className="h-1 overflow-hidden rounded-full bg-hover">
        <div className="h-full bg-foreground/60" style={{ width: `${percent}%` }} />
      </div>
      <p className="truncate text-[12px] text-muted-foreground" title={progress.relativePath}>
        {progress.relativePath}
      </p>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" disabled={canceling} onClick={onCancel}>
          {canceling ? "Canceling…" : "Cancel"}
        </Button>
      </div>
    </>
  );
}

function SummaryBody({ result }: { result: ImportedNotes }) {
  const skip = notesFolderImportSkipCount(result);
  const oversized = result.warnings.filter((warning) => warning.includes("larger than"));
  const otherWarnings = result.warnings.filter((warning) => !warning.includes("larger than"));

  return (
    <>
      <DialogHeader>
        <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          {result.canceled ? "Canceled" : "Imported"}
        </p>
        <DialogTitle>{result.canceled ? "Import canceled" : "Notes imported"}</DialogTitle>
        <DialogDescription className="text-[13px] text-foreground">
          New {result.noteCount} · Skip {skip} · Fail {result.failedCount}
        </DialogDescription>
      </DialogHeader>
      {result.canceled && result.noteCount === 0 ? (
        <p className="text-[13px]">Nothing was copied.</p>
      ) : (
        <p className="text-[13px]">
          Copied under {result.wrapFolderPath}. {NOTES_FOLDER_REIMPORT_NOTE}
          {result.canceled ? " Notes already copied were kept." : null}
        </p>
      )}
      <p className="truncate text-[12px] text-muted-foreground" title={result.folderPath}>
        {truncateMiddle(result.folderPath)}
      </p>
      {result.ignoredNonMarkdownCount > 0 || result.ignoredDirectoryNames.length > 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {result.ignoredNonMarkdownCount > 0
            ? `${result.ignoredNonMarkdownCount} non-markdown file${result.ignoredNonMarkdownCount === 1 ? "" : "s"} ignored. `
            : null}
          {result.ignoredDirectoryNames.length > 0
            ? `Ignored ${result.ignoredDirectoryNames.map((name) => `${name}/`).join(", ")}.`
            : null}
        </p>
      ) : null}
      {oversized.map((warning) => (
        <p key={warning} className="text-[12px] text-muted-foreground">
          {warning}
        </p>
      ))}
      {otherWarnings.map((warning) => (
        <p key={warning} className="text-[12px] text-muted-foreground">
          {warning}
        </p>
      ))}
      <PathList
        label="Skipped"
        rows={result.skippedPaths.map((path) => ({ path, detail: "Duplicate path" }))}
      />
      <PathList
        label="Failures"
        danger
        rows={result.failures.map((failure) => ({
          path: failure.relativePath,
          detail: failure.reason,
        }))}
      />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => notesImportUi.reset()}>
          Done
        </Button>
      </div>
    </>
  );
}

function PathList({
  label,
  rows,
  danger = false,
}: {
  label: string;
  rows: { path: string; detail: string }[];
  danger?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-[12px] text-muted-foreground">
        {label} ({rows.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <li key={`${row.path}:${row.detail}`}>
              <div className="truncate text-[13px]" title={row.path}>
                {row.path}
              </div>
              <div
                className={
                  danger ? "text-[12px] text-destructive" : "text-[12px] text-muted-foreground"
                }
              >
                {row.detail}
              </div>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

async function cancelImport(): Promise<void> {
  notesImportUi.markCanceling();
  try {
    await markdownApi.cancelImport();
  } catch {
    // The in-flight import still returns a summary.
  }
}

function truncateMiddle(value: string, max = 72): string {
  if (value.length <= max) return value;
  const marker = "…";
  const keep = max - marker.length;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${value.slice(0, head)}${marker}${value.slice(value.length - tail)}`;
}
