import * as React from "react";
import {
  AiWebBrowsingIcon,
  ComputerTerminal01Icon,
  Database02Icon,
  FileScriptIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { ChatTreeFolderNode, ChatTreeSnapshot, ItemInfo } from "@shared/ipc";
import { cn } from "@/lib/utils";
import { fuzzyTitleMatch } from "@shared/chat/attached-notes";
import {
  HANOKI_TOOL_ID,
  HANOKI_TOOL_LABEL,
  TERMINAL_TOOL_ID,
  TERMINAL_TOOL_LABEL,
  WEB_TOOL_ID,
  WEB_TOOL_LABEL,
  type ChatToolId,
} from "@shared/tiptap/document";

export interface NoteCandidate {
  id: string;
  title: string;
  folderPath: string | null;
  updatedAt: number;
}

export type ComposerSuggestion =
  | {
      kind: "tool";
      id: ChatToolId;
      label: string;
      description: string;
      icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
    }
  | {
      kind: "note";
      id: string;
      title: string;
      folderPath: string | null;
    };

const TOOLS: Extract<ComposerSuggestion, { kind: "tool" }>[] = [
  {
    kind: "tool",
    id: WEB_TOOL_ID,
    label: WEB_TOOL_LABEL,
    description: "Web search",
    icon: AiWebBrowsingIcon,
  },
  {
    kind: "tool",
    id: HANOKI_TOOL_ID,
    label: HANOKI_TOOL_LABEL,
    description: "Workspace data",
    icon: Database02Icon,
  },
  {
    kind: "tool",
    id: TERMINAL_TOOL_ID,
    label: TERMINAL_TOOL_LABEL,
    description: "Commands & files",
    icon: ComputerTerminal01Icon,
  },
];

const EMPTY_NOTE_LIMIT = 8;

export function flattenMarkdownNotes(snapshot: ChatTreeSnapshot | undefined): NoteCandidate[] {
  if (!snapshot) return [];
  const notes: NoteCandidate[] = [];
  const walk = (folders: ChatTreeFolderNode[], items: ItemInfo[], path: string | null) => {
    for (const item of items) {
      if (item.type === "markdown") {
        notes.push({
          id: item.id,
          title: item.title,
          folderPath: path,
          updatedAt: item.updatedAt,
        });
      }
    }
    for (const folder of folders) {
      walk(folder.folders, folder.items, path ? `${path} / ${folder.name}` : folder.name);
    }
  };
  walk(snapshot.rootFolders, snapshot.rootItems, null);
  return notes.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function filterComposerSuggestions(
  notes: readonly NoteCandidate[],
  query: string,
  notesOnly: boolean,
): ComposerSuggestion[] {
  const normalized = query.trim().toLowerCase();
  const tools = notesOnly
    ? []
    : TOOLS.filter((tool) => !normalized || tool.label.toLowerCase().startsWith(normalized));
  const matchedNotes = notes.filter((note) => fuzzyTitleMatch(note.title, normalized));
  const visibleNotes = (normalized ? matchedNotes : matchedNotes.slice(0, EMPTY_NOTE_LIMIT)).map(
    (note): ComposerSuggestion => ({ kind: "note", ...note }),
  );
  return [...visibleNotes, ...tools];
}

export function ComposerSuggestionList({
  items,
  query,
  selectedIndex,
  notesOnly,
  onSelect,
}: {
  items: readonly ComposerSuggestion[];
  query: string;
  selectedIndex: number;
  notesOnly: boolean;
  onSelect: (item: ComposerSuggestion) => void;
}) {
  const notes = items.filter((item) => item.kind === "note");
  const tools = items.filter((item) => item.kind === "tool");
  const emptyQuery = query.trim().length === 0;
  let index = 0;

  return (
    <div
      className="max-h-72 min-w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
      role="listbox"
      aria-label={notesOnly ? "Notes" : "Notes and tools"}
    >
      <SuggestionSection label="Notes">
        {notes.length === 0 ? (
          <p className="px-2 py-1.5 text-[13px] text-muted-foreground">
            {emptyQuery ? "Type to search notes…" : "No notes match"}
          </p>
        ) : (
          notes.map((item) => {
            const itemIndex = index;
            index += 1;
            return (
              <SuggestionRow
                key={item.id}
                selected={itemIndex === selectedIndex}
                onSelect={() => onSelect(item)}
              >
                <HugeiconsIcon icon={FileScriptIcon} className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{item.title}</span>
                {item.folderPath ? (
                  <span className="max-w-[40%] truncate text-xs text-muted-foreground">
                    {item.folderPath}
                  </span>
                ) : null}
              </SuggestionRow>
            );
          })
        )}
      </SuggestionSection>
      {notesOnly ? null : (
        <SuggestionSection label="Tools">
          {tools.length === 0 ? (
            <p className="px-2 py-1.5 text-[13px] text-muted-foreground">No tools match</p>
          ) : (
            tools.map((item) => {
              const itemIndex = index;
              index += 1;
              return (
                <SuggestionRow
                  key={item.id}
                  selected={itemIndex === selectedIndex}
                  onSelect={() => onSelect(item)}
                >
                  <HugeiconsIcon icon={item.icon} className="size-3.5 text-muted-foreground" />
                  <span className="text-[13px] font-medium">{item.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{item.description}</span>
                </SuggestionRow>
              );
            })
          )}
        </SuggestionSection>
      )}
    </div>
  );
}

function SuggestionSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function SuggestionRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left outline-none",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      {children}
    </button>
  );
}
