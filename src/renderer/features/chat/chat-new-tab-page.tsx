import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  ArrowRight01Icon,
  ChatAdd01Icon,
  FolderOffIcon,
  MessagesSquare,
  Search01Icon,
} from "@hugeicons/core-free-icons";

import markUrl from "@/assets/hanoki-mark.png";
import { chatTreeApi } from "@/api/chat-tree";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useCreateChat } from "@/mutations/chats";
import { queryKeys } from "@/queries/keys";
import { useWorkspaceStore } from "@/features/workspace/store";
import { cn } from "@/lib/utils";
import type { NativeChatDrag } from "./chat-layout";
import { CHAT_DRAG_FORMAT } from "./chat-tabs";
import { ChatSearchDialog } from "./chat-search-dialog";
import { flattenSnapshotChats } from "./chat-sidebar-tree";
import { applyChatTitleUpdate } from "./chat-title-events";

const RECENT_LIMIT = 5;

/** Strong ease-out entrance; `fill-mode-both` holds the from-state through the stagger delay. */
const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 duration-[260ms] ease-out-quint fill-mode-both";

/**
 * The workspace's new tab page — what fills the content panel when no tab is open.
 * Doubles as the drop target for chats dragged out of the sidebar.
 */
export function ChatNewTabPage({ drag }: { drag: NativeChatDrag | null }) {
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const createChatMutation = useCreateChat();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [isOver, setIsOver] = React.useState(false);
  const armed = drag?.kind === "chat";

  React.useEffect(() => {
    if (!armed) setIsOver(false);
  }, [armed]);

  const { data: recents = [] } = useQuery({
    queryKey: queryKeys.chatTree.snapshot(workspaceId ?? ""),
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is required.");
      return chatTreeApi.getTree(workspaceId);
    },
    select: (snapshot) => flattenSnapshotChats(snapshot).slice(0, RECENT_LIMIT),
    enabled: Boolean(workspaceId),
  });

  const createChat = async () => {
    if (!workspaceId || createChatMutation.isPending) return;
    const chat = await createChatMutation.mutateAsync({
      workspaceId,
      title: "New chat",
      folderId: null,
    });
    // The tree sidebar loads its children outside react-query, so a query invalidation
    // alone leaves it stale — this event is the refresh signal both sidebar modes listen to.
    applyChatTitleUpdate({
      type: "chat:title-updated",
      chatId: chat.id,
      workspaceId,
      title: chat.title,
    });
  };

  return (
    <div
      onDragOver={(event) => {
        if (!armed) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsOver(true);
      }}
      onDragLeave={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        ) {
          setIsOver(false);
        }
      }}
      onDrop={(event) => {
        // Not gated on `armed`: the window-level `drop` capture listener clears the intent
        // before this handler runs, so the payload is the only reliable source of truth.
        setIsOver(false);
        event.preventDefault();
        let chatIds: string[] = [];
        try {
          chatIds = JSON.parse(event.dataTransfer.getData(CHAT_DRAG_FORMAT));
        } catch {
          return;
        }
        for (const chatId of chatIds) openTab({ type: "chat", chatId });
      }}
      className={cn(
        "relative flex h-full items-center justify-center overflow-hidden rounded-lg border bg-surface transition-colors duration-150",
        // The whole panel is the drop target, so its own edge carries the signal:
        // armed arms it, hovering commits it.
        isOver ? "border-focus/60 bg-focus/5" : armed ? "border-focus/25" : "border-border",
      )}
    >
      <AmbientWash active={isOver} />

      {drag?.kind === "unsupported" ? (
        <DropNotice />
      ) : (
        <div
          className={cn(
            "relative flex w-full max-w-[27rem] flex-col items-center px-6 py-10 transition-opacity duration-150",
            armed && "opacity-35",
          )}
        >
          <img
            src={markUrl}
            alt=""
            width={96}
            height={96}
            draggable={false}
            className={cn("size-24 select-none", ENTER)}
          />

          <div className={cn("mt-6 flex items-center gap-2", ENTER)} style={delay(40)}>
            <Button size="sm" disabled={!workspaceId} onClick={() => void createChat()}>
              <HugeiconsIcon icon={ChatAdd01Icon} />
              New chat
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={!workspaceId}
              onClick={() => setSearchOpen(true)}
            >
              <HugeiconsIcon icon={Search01Icon} />
              Search
              <Kbd className="ml-0.5">⌘K</Kbd>
            </Button>
          </div>

          {recents.length > 0 ? (
            <div className={cn("mt-9 w-full", ENTER)} style={delay(120)}>
              <ul>
                {recents.map((chat, index) => (
                  <li key={chat.id} className={ENTER} style={delay(160 + index * 30)}>
                    <button
                      type="button"
                      onClick={() => openTab({ type: "chat", chatId: chat.id })}
                      className="group relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left outline-none transition-colors duration-100 hover:bg-hover focus-visible:bg-hover focus-visible:ring-1 focus-visible:ring-focus/60"
                    >
                      <HugeiconsIcon
                        icon={MessagesSquare}
                        className="size-3.5 shrink-0 text-muted-foreground/70 transition-colors duration-100 group-hover:text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground transition-colors duration-100 group-hover:text-foreground">
                        {chat.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground/60 tabular-nums transition-opacity duration-100 group-hover:opacity-0">
                        {formatDistanceToNowStrict(chat.updatedAt, { addSuffix: false })}
                      </span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        className="absolute right-2 size-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-[opacity,translate] duration-150 ease-out-quint group-hover:translate-x-0 group-hover:opacity-100"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {/* Sits above the dimmed content so the invitation stays legible mid-drag. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface-secondary/85 px-3 py-2 text-[11px] font-medium shadow-2xl ring-1 ring-border backdrop-blur-md transition-[scale,opacity] duration-150 ease-out-quint",
          !armed && "scale-95 opacity-0",
          armed && (isOver ? "scale-100 opacity-100" : "scale-[0.97] opacity-60"),
        )}
      >
        Drop to open
      </span>

      {workspaceId ? (
        <ChatSearchDialog
          workspaceId={workspaceId}
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelectChat={(chatId) => openTab({ type: "chat", chatId })}
        />
      ) : null}
    </div>
  );
}

function delay(ms: number): React.CSSProperties {
  return { animationDelay: `${ms}ms` };
}

/** Two slow moss gradients drifting past each other — atmosphere, not a UI element. */
function AmbientWash({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-500 ease-out-quint",
        active ? "opacity-100" : "opacity-70",
      )}
    >
      <div
        className="ambient-drift absolute -top-1/4 left-[6%] size-[46rem] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklch, var(--accent) 15%, transparent), transparent)",
        }}
      />
      <div
        className="ambient-drift-reverse absolute -bottom-1/3 right-[2%] size-[40rem] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklch, var(--accent) 10%, transparent), transparent)",
        }}
      />
    </div>
  );
}

function DropNotice() {
  return (
    <div className="relative flex items-center gap-2.5 duration-150 animate-in fade-in zoom-in-95">
      <HugeiconsIcon icon={FolderOffIcon} className="size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-[13px] leading-tight font-medium">Folders can't be opened here</p>
        <p className="text-xs leading-tight text-muted-foreground">
          Drop a chat instead, or drop the folder on another folder to move it.
        </p>
      </div>
    </div>
  );
}
