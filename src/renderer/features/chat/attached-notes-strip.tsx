import { Cancel01Icon, FileScriptIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ATTACHED_NOTE_CHAR_LIMIT,
  ATTACHED_NOTE_WARN_RATIO,
  ATTACHED_NOTES_TOTAL_CHAR_LIMIT,
  attachedNotesInjectedChars,
  estimateTokens,
  type PackedAttachedNote,
} from "@shared/chat/attached-notes";

export function AttachedNotesStrip({
  notes,
  onOpen,
  onRemove,
}: {
  notes: readonly PackedAttachedNote[];
  onOpen: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
}) {
  if (notes.length === 0) return null;

  const injected = attachedNotesInjectedChars(notes);
  const warn =
    injected >= ATTACHED_NOTES_TOTAL_CHAR_LIMIT * ATTACHED_NOTE_WARN_RATIO ||
    notes.some(
      (note) =>
        note.status !== "error" &&
        note.fullChars >= ATTACHED_NOTE_CHAR_LIMIT * ATTACHED_NOTE_WARN_RATIO,
    );

  return (
    <div className="flex flex-col gap-1.5 px-2" aria-label="Attached notes">
      <div className="flex flex-wrap items-center gap-1">
        {notes.map((note) => (
          <AttachedNoteChip key={note.itemId} note={note} onOpen={onOpen} onRemove={onRemove} />
        ))}
      </div>
      <p className={cn("text-xs", warn ? "text-warning" : "text-muted-foreground")}>
        ≈ {estimateTokens(injected).toLocaleString()} tokens · {injected.toLocaleString()} /{" "}
        {ATTACHED_NOTES_TOTAL_CHAR_LIMIT.toLocaleString()} chars
      </p>
    </div>
  );
}

function AttachedNoteChip({
  note,
  onOpen,
  onRemove,
}: {
  note: PackedAttachedNote;
  onOpen: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
}) {
  const label = chipLabel(note);
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-border bg-background px-1.5 text-[13px]">
      <HugeiconsIcon icon={FileScriptIcon} className="size-3.5 text-muted-foreground" />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="max-w-48 truncate text-left"
              onClick={() => onOpen(note.itemId)}
            />
          }
        >
          {note.title}
        </TooltipTrigger>
        <TooltipContent>{label.tooltip}</TooltipContent>
      </Tooltip>
      {label.badge ? <span className="text-xs text-muted-foreground">{label.badge}</span> : null}
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${note.title}`}
          onClick={() => onRemove(note.itemId)}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      ) : null}
    </span>
  );
}

function chipLabel(note: PackedAttachedNote): { badge: string | null; tooltip: string } {
  if (note.status === "error") {
    const badge =
      note.error === "wrong-type"
        ? "Not a note"
        : note.error === "wrong-workspace"
          ? "Wrong workspace"
          : "Missing";
    return { badge, tooltip: `${note.title} · ${badge}` };
  }
  if (note.status === "truncated") {
    return {
      badge: note.injectedChars === ATTACHED_NOTE_CHAR_LIMIT ? "Truncated · first 8k" : "Truncated",
      tooltip: `using first ${note.injectedChars.toLocaleString()} of ${note.fullChars.toLocaleString()} in ${note.title}`,
    };
  }
  return {
    badge: null,
    tooltip: `${note.title} · ${note.fullChars.toLocaleString()} chars`,
  };
}
