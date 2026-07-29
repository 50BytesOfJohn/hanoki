import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { CheckmarkCircle02Icon, FolderOffIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { PaneDropPosition } from "@/features/workspace/store/layout-tree";
import { CHAT_DRAG_FORMAT } from "./chat-tabs";

export type PaneDropIntent =
  | "chat"
  | "pane"
  /** Dragging a folder — panes only host chats. */
  | "unsupported"
  /** This pane already shows the dragged chat. */
  | "already-here"
  /** A sibling pane in this tab already shows it; a tab can't hold the same chat twice. */
  | "already-open";

const POSITIONS: PaneDropPosition[] = ["center", "left", "right", "top", "bottom"];

// Hit areas tile the whole pane edge-to-edge, so there is no dead space to aim around.
const HIT_CLASS: Record<PaneDropPosition, string> = {
  left: "inset-y-0 left-0 w-[30%]",
  right: "inset-y-0 right-0 w-[30%]",
  top: "inset-x-[30%] top-0 h-[35%]",
  bottom: "inset-x-[30%] bottom-0 h-[35%]",
  center: "inset-x-[30%] inset-y-[35%]",
};

// A single rect that morphs to where the chat will actually land — the preview is the result,
// not the target.
const PREVIEW_CLASS: Record<PaneDropPosition, string> = {
  center: "inset-1",
  left: "top-1 bottom-1 left-1 right-1/2",
  right: "top-1 bottom-1 right-1 left-1/2",
  top: "left-1 right-1 top-1 bottom-1/2",
  bottom: "left-1 right-1 bottom-1 top-1/2",
};

const CHAT_LABEL: Record<PaneDropPosition, string> = {
  center: "Replace chat",
  left: "Split left",
  right: "Split right",
  top: "Split up",
  bottom: "Split down",
};

const PANE_LABEL: Record<PaneDropPosition, string> = {
  center: "Swap panes",
  left: "Move left",
  right: "Move right",
  top: "Move up",
  bottom: "Move down",
};

// Cell placement inside the 3x3 compass: edges span the full side, the middle column stacks.
const COMPASS_CELL: Record<PaneDropPosition, string> = {
  left: "col-start-1 row-start-1 row-span-3",
  top: "col-start-2 row-start-1",
  center: "col-start-2 row-start-2",
  bottom: "col-start-2 row-start-3",
  right: "col-start-3 row-start-1 row-span-3",
};

export function PaneDropOverlay({
  paneId,
  intent,
  isFocused,
  onDropChat,
}: {
  paneId: string;
  intent: PaneDropIntent | null;
  isFocused: boolean;
  onDropChat: (event: React.DragEvent, position: PaneDropPosition) => void;
}) {
  const [active, setActive] = React.useState<PaneDropPosition | null>(null);
  // The hit areas must outlive the drag: the window-level `drop` capture listener clears the
  // intent before the event bubbles back here, and an unmounted node never gets its handler.
  const armed = intent === "chat" || intent === "pane";

  const handleOver = React.useCallback((position: PaneDropPosition, isOver: boolean) => {
    setActive((current) => (isOver ? position : current === position ? null : current));
  }, []);

  React.useEffect(() => {
    if (!armed) setActive(null);
  }, [armed]);

  const labels = intent === "pane" ? PANE_LABEL : CHAT_LABEL;

  return (
    <div
      aria-hidden="true"
      onDragLeave={(event) => {
        // dragleave fires when crossing between sibling hit areas too, so only clear once the
        // pointer is genuinely outside the pane.
        const rect = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (outside) setActive(null);
      }}
      className={cn(
        "pointer-events-none absolute inset-0 z-30 rounded-lg ring-1 ring-inset transition-colors duration-150",
        intent === null && "opacity-0",
        intent === "already-here"
          ? "ring-focus/45"
          : intent === "unsupported" || intent === "already-open"
            ? "ring-border"
            : active
              ? "ring-focus/45"
              : "ring-focus/15",
      )}
    >
      {armed ? (
        <>
          <div
            className={cn(
              "absolute rounded-md bg-focus/15 ring-1 ring-focus/70 ring-inset transition-[top,right,bottom,left,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
              active ? PREVIEW_CLASS[active] : "inset-1 opacity-0",
            )}
          />
          <div
            className={cn(
              "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-xl bg-surface-secondary/85 px-3 py-2.5 shadow-2xl ring-1 ring-border backdrop-blur-md transition-[opacity,transform,scale] duration-150 ease-out motion-reduce:transition-none",
              active ? "scale-100 opacity-100" : "scale-90 opacity-55",
            )}
          >
            <div className="grid h-[26px] w-[34px] grid-cols-[1fr_1.3fr_1fr] grid-rows-[1fr_1.3fr_1fr] gap-[2px]">
              {POSITIONS.map((position) => (
                <span
                  key={position}
                  className={cn(
                    "rounded-[2px] transition-colors duration-150 motion-reduce:transition-none",
                    COMPASS_CELL[position],
                    active === position ? "bg-focus" : "bg-foreground/15",
                  )}
                />
              ))}
            </div>
            {/* Fixed width: the label is the badge's widest child, so letting it size to the
                text makes the badge jump between zones. */}
            <p className="min-w-[76px] text-center text-[11px] leading-none font-medium">
              {active ? labels[active] : "Drop to open"}
            </p>
          </div>
        </>
      ) : null}

      {intent === "already-here" ? (
        <PaneNotice
          icon={CheckmarkCircle02Icon}
          iconClassName="text-focus"
          title="Already open here"
          detail="A tab can only show a chat once."
        />
      ) : null}

      {intent === "unsupported" && isFocused ? (
        <PaneNotice
          icon={FolderOffIcon}
          title="Folders can't open in a pane"
          detail="Drop it on a folder in the sidebar to move it."
        />
      ) : null}

      {POSITIONS.map((position) => (
        <ZoneHit
          key={position}
          paneId={paneId}
          position={position}
          armed={armed}
          onOver={handleOver}
          onDropChat={onDropChat}
        />
      ))}
    </div>
  );
}

function PaneNotice({
  icon,
  iconClassName,
  title,
  detail,
}: {
  icon: IconSvgElement;
  iconClassName?: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="absolute top-1/2 left-1/2 flex max-w-[280px] -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-xl bg-surface-secondary/85 px-3 py-2.5 shadow-2xl ring-1 ring-border backdrop-blur-md duration-150 animate-in fade-in zoom-in-95">
      <HugeiconsIcon
        icon={icon}
        className={cn("size-4 shrink-0 text-muted-foreground", iconClassName)}
      />
      <div className="min-w-0">
        <p className="text-[11px] leading-tight font-medium">{title}</p>
        <p className="text-[10px] leading-tight text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function ZoneHit({
  paneId,
  position,
  armed,
  onOver,
  onDropChat,
}: {
  paneId: string;
  position: PaneDropPosition;
  armed: boolean;
  onOver: (position: PaneDropPosition, isOver: boolean) => void;
  onDropChat: (event: React.DragEvent, position: PaneDropPosition) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:${paneId}:${position}`,
    disabled: !armed,
  });

  // dnd-kit tracks pane drags; native chat drags freeze :hover, so both funnel through onOver.
  React.useEffect(() => {
    onOver(position, isOver);
  }, [isOver, onOver, position]);

  return (
    <div
      ref={setNodeRef}
      className={cn("absolute", HIT_CLASS[position], armed && "pointer-events-auto")}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(CHAT_DRAG_FORMAT)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        onOver(position, true);
      }}
      onDrop={(event) => {
        onOver(position, false);
        onDropChat(event, position);
      }}
    />
  );
}
