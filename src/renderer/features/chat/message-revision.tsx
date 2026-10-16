import * as React from "react";
import { NoteEditIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  useChatRegenerateWithNote,
  useChatRevisionComposer,
  useChatSwitchBranch,
} from "@/features/chat/chat-context";
import { useChatScrollToBottom } from "@/features/chat/chat-scroll-context";
import { modShortcut } from "@/lib/platform";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { REVISION_NOTE_MAX_LENGTH } from "@shared/chat/revision";

const REVISION_NOTE_PLACEHOLDER = "e.g. Make it shorter · Elaborate on the second point";
const SUBMIT_SHORTCUT = modShortcut("↵");

interface RevisionNoteFieldProps {
  isInteractionLocked: boolean;
  note: string;
  onNoteChange: (note: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  submitRef?: React.Ref<HTMLButtonElement>;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

function RevisionNoteField({
  isInteractionLocked,
  note,
  onNoteChange,
  onSubmit,
  submitLabel,
  submitRef,
  textareaRef,
}: RevisionNoteFieldProps) {
  const canSubmit = note.trim().length > 0 && !isInteractionLocked;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <Textarea
        ref={textareaRef}
        aria-label="Revision note"
        className="max-h-48 min-h-16 resize-none"
        maxLength={REVISION_NOTE_MAX_LENGTH}
        placeholder={REVISION_NOTE_PLACEHOLDER}
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            if (canSubmit) onSubmit();
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <Kbd>{SUBMIT_SHORTCUT}</Kbd>
        <Button ref={submitRef} type="submit" size="sm" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

interface RegenerateWithNotePopoverProps {
  anchor: React.RefObject<HTMLElement | null>;
  isInteractionLocked: boolean;
  message: HanokiUiMessage;
}

/** Note composer for "Regenerate with note", anchored to the Regenerate button. */
export function RegenerateWithNotePopover({
  anchor,
  isInteractionLocked,
  message,
}: RegenerateWithNotePopoverProps) {
  const composer = useChatRevisionComposer(message.id);
  const regenerateWithNote = useChatRegenerateWithNote();
  const scrollToBottom = useChatScrollToBottom();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  return (
    <Popover
      open={composer.isOpen}
      onOpenChange={(open) => {
        if (!open) composer.close();
      }}
    >
      <PopoverContent anchor={anchor} align="start" className="w-80" initialFocus={textareaRef}>
        <PopoverHeader>
          <PopoverTitle className="text-sm">Regenerate with note</PopoverTitle>
        </PopoverHeader>
        <RevisionNoteField
          isInteractionLocked={isInteractionLocked}
          note={composer.note}
          onNoteChange={composer.setNote}
          submitLabel="Regenerate"
          textareaRef={textareaRef}
          onSubmit={() => {
            scrollToBottom();
            void regenerateWithNote({
              messageId: message.id,
              sourceMessageId: message.id,
              note: composer.note,
            });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

interface MessageRevisionBadgeProps {
  isInteractionLocked: boolean;
  message: HanokiUiMessage;
}

/** Marks a response regenerated with a note, and lets it be retried with a new one. */
export function MessageRevisionBadge({ isInteractionLocked, message }: MessageRevisionBadgeProps) {
  const revision = message.metadata?.revision;
  const regenerateWithNote = useChatRegenerateWithNote();
  const switchBranch = useChatSwitchBranch();
  const scrollToBottom = useChatScrollToBottom();
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [note, setNote] = React.useState(revision?.note ?? "");

  if (!revision) {
    return null;
  }

  const isOriginalAvailable = message.metadata?.siblings?.includes(revision.sourceMessageId);
  const isNoteEdited = note.trim() !== revision.note;

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (open) setNote(revision.note);
        setIsOpen(open);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex max-w-full items-center gap-1.5 rounded-md bg-surface-secondary px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          />
        }
      >
        <HugeiconsIcon icon={NoteEditIcon} className="size-3.5 shrink-0" />
        <span className="max-w-80 truncate">Revised · {revision.note}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96" initialFocus={submitRef}>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Note</p>
          <RevisionNoteField
            isInteractionLocked={isInteractionLocked}
            note={note}
            onNoteChange={setNote}
            submitLabel={isNoteEdited ? "Regenerate with new note" : "Regenerate again"}
            submitRef={submitRef}
            onSubmit={() => {
              setIsOpen(false);
              scrollToBottom();
              void regenerateWithNote({
                messageId: message.id,
                sourceMessageId: revision.sourceMessageId,
                note,
              });
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Original</p>
            {isOriginalAvailable ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={isInteractionLocked}
                onClick={() => {
                  setIsOpen(false);
                  void switchBranch(revision.sourceMessageId);
                }}
              >
                View original
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Original deleted</span>
            )}
          </div>
          <p className="line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground">
            {revision.sourceText}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
