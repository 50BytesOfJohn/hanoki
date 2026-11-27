import {
  ArrowUp02Icon,
  Cancel01Icon,
  CornerDownRightIcon,
  Edit01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatQueue, QueuedMessage } from "@/stores/chat-queue";
import { cn } from "cn";

interface ChatMessageQueueProps {
  queue: ChatQueue;
  isBusy: boolean;
  /** Why the queue can't send yet even though nothing is generating. */
  blockReason: string | null;
  onSendNow: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onResume: () => void;
}

const PAUSE_LABELS = {
  stopped: "Paused after you stopped the reply",
  error: "Paused after the reply failed",
} as const;

/**
 * Messages waiting for the current reply, tucked behind the top edge of the composer. Each row
 * is one line of preview; its actions appear on hover or focus, as elsewhere in the app.
 */
export function ChatMessageQueue({
  queue,
  isBusy,
  blockReason,
  onSendNow,
  onEdit,
  onRemove,
  onResume,
}: ChatMessageQueueProps) {
  if (queue.items.length === 0) {
    return null;
  }

  const status = queue.pausedBy ? PAUSE_LABELS[queue.pausedBy] : !isBusy ? blockReason : null;

  return (
    <section
      aria-label="Queued messages"
      className="mx-3 rounded-t-lg border border-b-0 border-border bg-surface p-1 pb-1.5"
    >
      {status ? (
        <div className="flex h-7 items-center gap-2 pr-1 pl-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{status}</span>
          {queue.pausedBy ? (
            <Button type="button" size="xs" variant="ghost" onClick={onResume}>
              Resume
            </Button>
          ) : null}
        </div>
      ) : null}
      <ol className="flex max-h-36 flex-col overflow-y-auto scrollbar">
        {queue.items.map((item, index) => (
          <QueuedMessageRow
            key={item.id}
            item={item}
            isNext={index === 0}
            isEditing={queue.editingId === item.id}
            isBusy={isBusy}
            onSendNow={onSendNow}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        ))}
      </ol>
    </section>
  );
}

function QueuedMessageRow({
  item,
  isNext,
  isEditing,
  isBusy,
  onSendNow,
  onEdit,
  onRemove,
}: {
  item: QueuedMessage;
  isNext: boolean;
  isEditing: boolean;
  isBusy: boolean;
  onSendNow: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li
      className={cn(
        "group/queued flex h-7 shrink-0 items-center gap-2 rounded-md pr-0.5 pl-2 text-[13px] transition-colors duration-100 hover:bg-hover focus-within:bg-hover",
        isEditing && "bg-surface-tertiary hover:bg-surface-tertiary",
      )}
    >
      <HugeiconsIcon
        icon={CornerDownRightIcon}
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0",
          isNext ? "text-muted-foreground" : "text-muted-foreground/50",
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          isEditing
            ? "text-foreground"
            : "text-muted-foreground group-hover/queued:text-foreground",
        )}
      >
        {item.preview}
      </span>
      {isEditing ? (
        <span className="shrink-0 pr-1.5 text-xs text-muted-foreground">Editing</span>
      ) : (
        <div className="flex shrink-0 items-center opacity-0 transition-opacity duration-100 group-hover/queued:opacity-100 group-focus-within/queued:opacity-100">
          <RowAction
            label={isBusy ? "Send now (stops the current reply)" : "Send now"}
            onClick={() => onSendNow(item.id)}
          >
            <HugeiconsIcon icon={ArrowUp02Icon} />
          </RowAction>
          <RowAction label="Edit" onClick={() => onEdit(item.id)}>
            <HugeiconsIcon icon={Edit01Icon} />
          </RowAction>
          <RowAction label="Remove" onClick={() => onRemove(item.id)}>
            <HugeiconsIcon icon={Cancel01Icon} />
          </RowAction>
        </div>
      )}
    </li>
  );
}

function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            className="text-muted-foreground hover:text-foreground"
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
