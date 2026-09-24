import * as React from "react";
import { getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart } from "ai";
import {
  AlertCircleIcon,
  ChatAdd01Icon,
  MessageAdd01Icon,
  ComputerTerminal01Icon,
  Database02Icon,
  DatabaseSearchIcon,
  Edit02Icon,
  File01Icon,
  FileEditIcon,
  FileScriptIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderTransferIcon,
  GlobalSearchIcon,
  Globe02Icon,
  MoreHorizontalIcon,
  ShieldBanIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { useUpdateChatSettings } from "@/mutations/chats";
import { useChatId, useChatRespondToToolApproval } from "@/features/chat/chat-context";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/queries/keys";
import { notifyChatTreeChanged } from "@/features/items/item-title-events";
import { requestSidebarFolderReveal } from "@/features/chat/sidebar-reveal";
import { useWorkspaceStore } from "@/features/workspace/store";
import type { ChatTreeFolderNode, ChatTreeSnapshot, ItemInfo } from "@shared/ipc";
import { formatHanokiMoveApproval, formatHanokiRenameApproval } from "./tool-approval-summary";

export { isToolUIPart };

type ToolIcon = React.ComponentProps<typeof HugeiconsIcon>["icon"];

interface ToolMarkerConfig {
  icon: ToolIcon;
  pendingLabel: (input: unknown) => string;
  doneLabel: (input: unknown, output?: unknown) => string;
  errorLabel: string;
  Details: React.ComponentType<{ input: unknown; output: unknown }>;
}

function getStringField(input: unknown, field: string): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const value = (input as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getStringArray(input: unknown, field: string): string[] {
  if (typeof input !== "object" || input === null) return [];
  const value = (input as Record<string, unknown>)[field];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function getArrayLength(input: unknown, field: string): number {
  if (typeof input !== "object" || input === null) return 0;
  const value = (input as Record<string, unknown>)[field];
  return Array.isArray(value) ? value.length : 0;
}

function getHostname(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// --- Web search details (Firecrawl /v2/search) ---

interface WebSearchResult {
  url: string;
  title?: string;
  description?: string;
}

function getWebSearchResults(output: unknown): WebSearchResult[] {
  const data = (output as { data?: { web?: unknown } } | null)?.data;
  if (!Array.isArray(data?.web)) {
    return [];
  }

  return data.web.filter(
    (item): item is WebSearchResult =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as WebSearchResult).url === "string",
  );
}

function WebSearchDetails({ output }: { input: unknown; output: unknown }) {
  const results = getWebSearchResults(output);

  if (results.length === 0) {
    return <p className="text-xs text-muted-foreground">No results returned.</p>;
  }

  return (
    <div className="flex max-h-80 flex-col gap-1 overflow-y-auto scrollbar">
      {results.map((result) => (
        <a
          key={result.url}
          href={result.url}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 hover:bg-accent"
        >
          <span className="truncate text-sm font-medium text-foreground">
            {result.title || result.url}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {getHostname(result.url) ?? result.url}
          </span>
          {result.description ? (
            <span className="line-clamp-2 text-xs text-muted-foreground">{result.description}</span>
          ) : null}
        </a>
      ))}
    </div>
  );
}

// --- Web fetch details (Firecrawl /v2/scrape) ---

function WebFetchDetails({ input, output }: { input: unknown; output: unknown }) {
  const data = (output as { data?: Record<string, unknown> } | null)?.data;
  const metadata =
    typeof data?.metadata === "object" && data.metadata !== null
      ? (data.metadata as Record<string, unknown>)
      : null;
  const url = getStringField(metadata, "sourceURL") ?? getStringField(input, "url");
  const title = getStringField(metadata, "title") ?? url ?? "Fetched page";
  const description = getStringField(metadata, "description");
  const markdown = getStringField(data ?? null, "markdown");

  return (
    <div className="flex flex-col gap-1">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 hover:bg-accent"
        >
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          <span className="truncate text-xs text-muted-foreground">{getHostname(url) ?? url}</span>
        </a>
      ) : (
        <p className="truncate px-2 text-sm font-medium text-foreground">{title}</p>
      )}
      {description ? (
        <p className="line-clamp-3 px-2 text-xs text-muted-foreground">{description}</p>
      ) : null}
      {markdown ? (
        <p className="px-2 text-xs text-muted-foreground">
          {markdown.length.toLocaleString()} characters fetched
        </p>
      ) : null}
    </div>
  );
}

// --- Terminal details ---

function getNumberField(input: unknown, field: string): number | null {
  if (typeof input !== "object" || input === null) return null;
  const value = (input as Record<string, unknown>)[field];
  return typeof value === "number" ? value : null;
}

/** Collapses a home-prefixed path to `~/…` the way a shell prompt would. */
function shortenPath(filePath: string | null): string | null {
  if (!filePath) return null;
  const match = /^(\/(?:Users|home)\/[^/]+)(\/.*)?$/.exec(filePath);
  return match ? `~${match[2] ?? ""}` : filePath;
}

function OutputStream({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="px-0.5 text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase">
        {label}
      </span>
      <pre className="max-h-64 overflow-auto rounded-md bg-surface-secondary px-2.5 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground scrollbar">
        {value}
      </pre>
    </div>
  );
}

function TerminalRunDetails({ input, output }: { input: unknown; output: unknown }) {
  const command = getStringField(input, "command");
  const exitCode = getNumberField(output, "exitCode");
  const cwd = shortenPath(getStringField(output, "cwd"));

  return (
    <div className="flex flex-col gap-2.5">
      {command ? (
        <pre className="overflow-x-auto rounded-md bg-surface-secondary px-2.5 py-2 font-mono text-xs leading-5 text-foreground scrollbar">
          <span className="text-muted-foreground">$ </span>
          {command}
        </pre>
      ) : null}
      <OutputStream label="Output" value={getStringField(output, "stdout")} />
      <OutputStream label="Errors" value={getStringField(output, "stderr")} />
      <p className="px-0.5 text-xs text-muted-foreground">
        {exitCode === null
          ? null
          : exitCode === 0
            ? "Finished successfully"
            : `Exit code ${exitCode}`}
        {cwd ? ` · ${cwd}` : ""}
      </p>
    </div>
  );
}

function TerminalReadFileDetails({ input, output }: { input: unknown; output: unknown }) {
  const filePath = shortenPath(getStringField(output, "path") ?? getStringField(input, "path"));

  return (
    <div className="flex flex-col gap-2">
      {filePath ? (
        <p className="truncate px-0.5 font-mono text-xs text-muted-foreground">{filePath}</p>
      ) : null}
      <OutputStream label="Contents" value={getStringField(output, "content")} />
    </div>
  );
}

function TerminalWriteFileDetails({ input, output }: { input: unknown; output: unknown }) {
  const filePath = shortenPath(getStringField(output, "path") ?? getStringField(input, "path"));
  const bytesWritten = getNumberField(output, "bytesWritten");

  return (
    <div className="flex flex-col gap-2">
      {filePath ? (
        <p className="truncate px-0.5 font-mono text-xs text-muted-foreground">{filePath}</p>
      ) : null}
      <OutputStream label="Written" value={getStringField(input, "content")} />
      {bytesWritten === null ? null : (
        <p className="px-0.5 text-xs text-muted-foreground">
          {bytesWritten.toLocaleString()} bytes written
        </p>
      )}
    </div>
  );
}

// --- Generic fallback details ---

function GenericToolDetails({ input, output }: { input: unknown; output: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg bg-surface-secondary px-3 py-2 text-xs leading-5 text-muted-foreground scrollbar">
      {JSON.stringify({ input, output }, null, 2)}
    </pre>
  );
}

const TOOL_CONFIGS: Record<string, ToolMarkerConfig> = {
  webSearch: {
    icon: GlobalSearchIcon,
    pendingLabel: (input) => {
      const query = getStringField(input, "query");
      return query ? `Searching the web for “${query}”…` : "Searching the web…";
    },
    doneLabel: (input) => {
      const query = getStringField(input, "query");
      return query ? `Searched the web for “${query}”` : "Searched the web";
    },
    errorLabel: "Web search failed",
    Details: WebSearchDetails,
  },
  webFetch: {
    icon: Globe02Icon,
    pendingLabel: (input) => {
      const hostname = getHostname(getStringField(input, "url"));
      return hostname ? `Fetching ${hostname}…` : "Fetching a web page…";
    },
    doneLabel: (input) => {
      const hostname = getHostname(getStringField(input, "url"));
      return hostname ? `Fetched ${hostname}` : "Fetched a web page";
    },
    errorLabel: "Web fetch failed",
    Details: WebFetchDetails,
  },
  terminalRun: {
    icon: ComputerTerminal01Icon,
    pendingLabel: (input) => {
      const command = getStringField(input, "command");
      return command ? `Running ${command}…` : "Running a command…";
    },
    doneLabel: (input) => {
      const command = getStringField(input, "command");
      return command ? `Ran ${command}` : "Ran a command";
    },
    errorLabel: "Command failed",
    Details: TerminalRunDetails,
  },
  terminalReadFile: {
    icon: File01Icon,
    pendingLabel: (input) => {
      const filePath = shortenPath(getStringField(input, "path"));
      return filePath ? `Reading ${filePath}…` : "Reading a file…";
    },
    doneLabel: (input) => {
      const filePath = shortenPath(getStringField(input, "path"));
      return filePath ? `Read ${filePath}` : "Read a file";
    },
    errorLabel: "Reading the file failed",
    Details: TerminalReadFileDetails,
  },
  terminalWriteFile: {
    icon: FileEditIcon,
    pendingLabel: (input) => {
      const filePath = shortenPath(getStringField(input, "path"));
      return filePath ? `Writing ${filePath}…` : "Writing a file…";
    },
    doneLabel: (input) => {
      const filePath = shortenPath(getStringField(input, "path"));
      return filePath ? `Wrote ${filePath}` : "Wrote a file";
    },
    errorLabel: "Writing the file failed",
    Details: TerminalWriteFileDetails,
  },
  hanokiBrowseItems: {
    icon: Database02Icon,
    pendingLabel: () => "Browsing Hanoki…",
    doneLabel: () => "Browsed Hanoki",
    errorLabel: "Hanoki browse failed",
    Details: GenericToolDetails,
  },
  hanokiSearchChats: {
    icon: DatabaseSearchIcon,
    pendingLabel: (input) => {
      const query = getStringField(input, "query");
      return query ? `Searching Hanoki for “${query}”…` : "Searching Hanoki…";
    },
    doneLabel: (input) => {
      const query = getStringField(input, "query");
      return query ? `Searched Hanoki for “${query}”` : "Searched Hanoki";
    },
    errorLabel: "Hanoki search failed",
    Details: GenericToolDetails,
  },
  hanokiGetChatContent: {
    icon: Database02Icon,
    pendingLabel: () => "Reading a Hanoki chat…",
    doneLabel: () => "Read a Hanoki chat",
    errorLabel: "Reading Hanoki chat failed",
    Details: GenericToolDetails,
  },
  hanokiGetCurrentFolder: {
    icon: Folder01Icon,
    pendingLabel: () => "Reading this chat’s folder…",
    doneLabel: () => "Read this chat’s folder",
    errorLabel: "Reading this chat’s folder failed",
    Details: GenericToolDetails,
  },
  hanokiGetItemLocation: {
    icon: Folder01Icon,
    pendingLabel: () => "Reading a Hanoki item location…",
    doneLabel: () => "Read a Hanoki item location",
    errorLabel: "Reading Hanoki item location failed",
    Details: GenericToolDetails,
  },
  hanokiCreateFolder: {
    icon: FolderAddIcon,
    pendingLabel: (input) => {
      const name = getStringField(input, "name");
      return name ? `Creating folder “${name}”…` : "Creating a Hanoki folder…";
    },
    doneLabel: (input) => {
      const name = getStringField(input, "name");
      return name ? `Created folder “${name}”` : "Created a Hanoki folder";
    },
    errorLabel: "Creating Hanoki folder failed",
    Details: GenericToolDetails,
  },
  hanokiCreateChat: {
    icon: ChatAdd01Icon,
    pendingLabel: (input) => {
      const title = getStringField(input, "title");
      return title ? `Creating chat “${title}”…` : "Creating a Hanoki chat…";
    },
    doneLabel: (input) => {
      const title = getStringField(input, "title");
      return title ? `Created chat “${title}”` : "Created a Hanoki chat";
    },
    errorLabel: "Creating Hanoki chat failed",
    Details: GenericToolDetails,
  },
  hanokiSendMessage: {
    icon: MessageAdd01Icon,
    pendingLabel: () => "Saving a draft message…",
    doneLabel: (_input, output) => {
      const title = getStringField(output, "title");
      return title ? `Saved a draft in “${title}”` : "Saved a draft message";
    },
    errorLabel: "Saving draft message failed",
    Details: GenericToolDetails,
  },
  hanokiCreateMarkdown: {
    icon: FileScriptIcon,
    pendingLabel: (input) => {
      const title = getStringField(input, "title");
      return title ? `Creating note “${title}”…` : "Creating a Hanoki note…";
    },
    doneLabel: (input) => {
      const title = getStringField(input, "title");
      return title ? `Created note “${title}”` : "Created a Hanoki note";
    },
    errorLabel: "Creating Hanoki note failed",
    Details: GenericToolDetails,
  },
  hanokiMoveItems: {
    icon: FolderTransferIcon,
    pendingLabel: (input) => {
      const count = getArrayLength(input, "items");
      return count > 0
        ? `Moving ${count} Hanoki ${count === 1 ? "item" : "items"}…`
        : "Moving Hanoki items…";
    },
    doneLabel: (input) => {
      const count = getArrayLength(input, "items");
      return count > 0
        ? `Organized ${count} Hanoki ${count === 1 ? "item" : "items"}`
        : "Organized Hanoki items";
    },
    errorLabel: "Moving Hanoki items failed",
    Details: GenericToolDetails,
  },
  hanokiRenameItem: {
    icon: Edit02Icon,
    pendingLabel: (input) => {
      const name = getStringField(input, "newName");
      return name ? `Renaming to “${name}”…` : "Renaming Hanoki item…";
    },
    doneLabel: (input) => {
      const name = getStringField(input, "newName");
      return name ? `Renamed to “${name}”` : "Renamed Hanoki item";
    },
    errorLabel: "Renaming Hanoki item failed",
    Details: GenericToolDetails,
  },
};

function getToolConfig(toolName: string): ToolMarkerConfig {
  return (
    TOOL_CONFIGS[toolName] ?? {
      icon: Globe02Icon,
      pendingLabel: () => `Running ${toolName}…`,
      doneLabel: () => `Used ${toolName}`,
      errorLabel: `${toolName} failed`,
      Details: GenericToolDetails,
    }
  );
}

/** Plain-language summary of what a pending tool call is asking permission to do. */
function describeApprovalRequest(
  toolName: string,
  input: unknown,
  names: {
    destinationFolderName: string | null;
    currentItemName: string | null;
    targetChatTitle: string | null;
  },
): { title: string; body: React.ReactNode } {
  if (toolName === "terminalRun") {
    const command = getStringField(input, "command");
    return {
      title: "Run a command on your computer?",
      body: command ? (
        <pre className="overflow-x-auto rounded-md bg-surface-secondary px-2.5 py-2 font-mono text-xs leading-5 text-foreground scrollbar">
          <span className="text-muted-foreground">$ </span>
          {command}
        </pre>
      ) : null,
    };
  }

  if (toolName === "terminalReadFile") {
    const filePath = shortenPath(getStringField(input, "path"));
    return {
      title: "Read a file from your computer?",
      body: filePath ? (
        <p className="truncate rounded-md bg-surface-secondary px-2.5 py-2 font-mono text-xs text-foreground">
          {filePath}
        </p>
      ) : null,
    };
  }

  if (toolName === "terminalWriteFile") {
    const filePath = shortenPath(getStringField(input, "path"));
    const content = getStringField(input, "content");
    return {
      title: "Save a file on your computer?",
      body: (
        <div className="flex flex-col gap-1.5">
          {filePath ? (
            <p className="truncate rounded-md bg-surface-secondary px-2.5 py-2 font-mono text-xs text-foreground">
              {filePath}
            </p>
          ) : null}
          {content ? (
            <pre className="max-h-40 overflow-auto rounded-md bg-surface-secondary px-2.5 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground scrollbar">
              {content}
            </pre>
          ) : null}
          <p className="px-0.5 text-xs text-muted-foreground">
            This replaces the file if it already exists.
          </p>
        </div>
      ),
    };
  }

  if (toolName === "hanokiMoveItems") {
    const move = formatHanokiMoveApproval(input, names.destinationFolderName);
    return {
      title: move.title,
      body: (
        <div className="flex flex-col gap-1.5">
          <p className="rounded-md bg-surface-secondary px-2.5 py-2 text-xs text-foreground">
            {move.summary}
          </p>
          <p className="px-0.5 text-xs text-muted-foreground">to {move.destination}</p>
        </div>
      ),
    };
  }

  if (toolName === "hanokiSendMessage") {
    const targetTitle = names.targetChatTitle;
    return {
      title: "Kick generation in another chat?",
      body: (
        <p className="px-0.5 text-xs text-muted-foreground">
          Start generation in{" "}
          <span className="font-medium text-foreground">
            {targetTitle ? `“${targetTitle}”` : "that chat"}
          </span>{" "}
          from this chat’s tool
        </p>
      ),
    };
  }

  if (toolName === "hanokiRenameItem") {
    const rename = formatHanokiRenameApproval(input, names.currentItemName);
    return {
      title: rename.title,
      body: rename.after ? (
        <p className="truncate rounded-md bg-surface-secondary px-2.5 py-2 text-xs text-foreground">
          {rename.before ? `${rename.before} → ${rename.after}` : rename.after}
        </p>
      ) : null,
    };
  }

  return {
    title: `Allow ${toolName}?`,
    body: (
      <pre className="max-h-40 overflow-auto rounded-md bg-surface-secondary px-2.5 py-2 text-xs leading-5 text-muted-foreground scrollbar">
        {JSON.stringify(input, null, 2)}
      </pre>
    ),
  };
}

function collectTreeNames(snapshot: ChatTreeSnapshot | undefined) {
  const folders = new Map<string, string>();
  const items = new Map<string, string>();
  const visit = (folderNodes: ChatTreeFolderNode[], nodeItems: ItemInfo[]) => {
    for (const item of nodeItems) items.set(item.id, item.title);
    for (const folder of folderNodes) {
      folders.set(folder.id, folder.name);
      visit(folder.folders, folder.items);
    }
  };
  if (snapshot) visit(snapshot.rootFolders, snapshot.rootItems);
  return { folders, items };
}

function approvalNamesFromInput(
  input: unknown,
  snapshot: ChatTreeSnapshot | undefined,
): {
  destinationFolderName: string | null;
  currentItemName: string | null;
  targetChatTitle: string | null;
} {
  const { folders, items } = collectTreeNames(snapshot);
  const destinationFolderId = getStringField(input, "destinationFolderId");
  const itemId = getStringField(input, "id");
  const targetChatId = getStringField(input, "chatId");
  return {
    destinationFolderName: destinationFolderId ? (folders.get(destinationFolderId) ?? null) : null,
    currentItemName: itemId ? (items.get(itemId) ?? folders.get(itemId) ?? null) : null,
    targetChatTitle: targetChatId ? (items.get(targetChatId) ?? null) : null,
  };
}

function ToolApprovalCard({
  approvalId,
  toolName,
  input,
}: {
  approvalId: string;
  toolName: string;
  input: unknown;
}) {
  const chatId = useChatId();
  const respondToToolApproval = useChatRespondToToolApproval();
  const updateChatSettings = useUpdateChatSettings();
  const [hasResponded, setHasResponded] = React.useState(false);
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  const snapshot = queryClient.getQueryData<ChatTreeSnapshot>(
    queryKeys.chatTree.snapshot(workspaceId ?? ""),
  );
  const { title, body } = describeApprovalRequest(
    toolName,
    input,
    approvalNamesFromInput(input, snapshot),
  );
  const canAllowForThisChat = toolName.startsWith("terminal");
  const icon = getToolConfig(toolName).icon;

  const respond = (approved: boolean, reason?: string) => {
    setHasResponded(true);
    respondToToolApproval({ id: approvalId, approved, ...(reason ? { reason } : {}) });
  };

  return (
    <div className="my-2 flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
        <p className="text-[13px] font-medium text-foreground">{title}</p>
      </div>
      {body}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={hasResponded}
          onClick={() => respond(false, "The user did not allow this action.")}
        >
          Don&apos;t allow
        </Button>
        {canAllowForThisChat ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={hasResponded}
            onClick={() => {
              // Persist first: the approval below immediately resumes the
              // generation, and the server reads this flag on that request.
              updateChatSettings.mutate(
                { id: chatId, input: { terminalAutoApprove: true } },
                { onSettled: () => respond(true) },
              );
              setHasResponded(true);
            }}
          >
            Allow for this chat
          </Button>
        ) : null}
        <Button size="sm" disabled={hasResponded} onClick={() => respond(true)}>
          Allow once
        </Button>
      </div>
    </div>
  );
}

type OpenableItemType = "chat" | "markdown";

function openHanokiItem(
  itemId: string,
  itemType: OpenableItemType,
  mode: "focus" | "split" | "tab",
) {
  const { activeTabId, openItemInFocusedPane, openTab, splitPane, tabs } =
    useWorkspaceStore.getState();
  if (mode === "focus") {
    openItemInFocusedPane(itemId, itemType);
    return;
  }
  if (mode === "tab") {
    openTab({ type: itemType, itemId }, { activate: true });
    return;
  }
  const tab = tabs.find((candidate) => candidate.id === activeTabId);
  if (!tab) {
    openTab({ type: itemType, itemId }, { activate: true });
    return;
  }
  splitPane(tab.id, tab.focusedPaneId, itemId, itemType, "right");
}

function doneMarkerTarget(toolName: string, output: unknown) {
  if (toolName === "hanokiCreateFolder") {
    const folderId = getStringField(output, "id");
    if (!folderId) return null;
    return {
      kind: "folder" as const,
      folderId,
      ancestorFolderIds: getStringArray(output, "ancestorFolderIds"),
    };
  }

  const itemType: OpenableItemType | null =
    toolName === "hanokiCreateChat" || toolName === "hanokiSendMessage"
      ? "chat"
      : toolName === "hanokiCreateMarkdown"
        ? "markdown"
        : null;
  if (!itemType) return null;
  const itemId =
    toolName === "hanokiSendMessage"
      ? getStringField(output, "chatId")
      : getStringField(output, "id");
  if (!itemId) return null;
  return { kind: "item" as const, itemId, itemType };
}

const markerActionClass = "h-6 px-1.5 text-muted-foreground";

function DoneMarkerActions({
  target,
}: {
  target: NonNullable<ReturnType<typeof doneMarkerTarget>>;
}) {
  if (target.kind === "folder") {
    return (
      <div className="mt-0.5">
        <Button
          size="xs"
          variant="ghost"
          className={markerActionClass}
          onClick={() => {
            useWorkspaceStore.getState().setSidebarViewMode("tree");
            requestSidebarFolderReveal({
              folderId: target.folderId,
              ancestorFolderIds: target.ancestorFolderIds,
            });
          }}
        >
          Show in sidebar
        </Button>
      </div>
    );
  }

  return (
    <div className="@container/tool-marker mt-0.5 flex w-full items-center gap-0.5">
      <Button
        size="xs"
        variant="ghost"
        className={markerActionClass}
        onClick={() => openHanokiItem(target.itemId, target.itemType, "focus")}
      >
        Open
      </Button>
      <Button
        size="xs"
        variant="ghost"
        className={cn(markerActionClass, "hidden @min-[240px]/tool-marker:inline-flex")}
        onClick={() => openHanokiItem(target.itemId, target.itemType, "split")}
      >
        Open in split
      </Button>
      <Button
        size="xs"
        variant="ghost"
        className={cn(markerActionClass, "hidden @min-[240px]/tool-marker:inline-flex")}
        aria-label="Open in new tab"
        onClick={() => openHanokiItem(target.itemId, target.itemType, "tab")}
      >
        New tab
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="@min-[240px]/tool-marker:hidden"
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="More open actions"
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => openHanokiItem(target.itemId, target.itemType, "split")}>
            Open in split
          </DropdownMenuItem>
          <DropdownMenuItem
            aria-label="Open in new tab"
            onClick={() => openHanokiItem(target.itemId, target.itemType, "tab")}
          >
            New tab
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const ToolCallMarker = React.memo(function ToolCallMarker({
  part,
}: {
  part: ToolUIPart | DynamicToolUIPart;
}) {
  const toolName = part.type === "dynamic-tool" ? part.toolName : getToolName(part);
  const config = getToolConfig(toolName);
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);

  React.useEffect(() => {
    if (
      !workspaceId ||
      part.state !== "output-available" ||
      (toolName !== "hanokiCreateFolder" &&
        toolName !== "hanokiCreateChat" &&
        toolName !== "hanokiCreateMarkdown" &&
        toolName !== "hanokiMoveItems" &&
        toolName !== "hanokiRenameItem")
    ) {
      return;
    }

    notifyChatTreeChanged(workspaceId);
  }, [part.state, part.toolCallId, toolName, workspaceId]);

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <Marker role="status" className="my-2 text-xs">
        <MarkerIcon>
          <Spinner />
        </MarkerIcon>
        <MarkerContent className="shimmer">{config.pendingLabel(part.input)}</MarkerContent>
      </Marker>
    );
  }

  if (part.state === "approval-requested") {
    // Automatic approvals carry state through the stream without a decision
    // from the user; only manual ones get a card.
    if (part.approval.isAutomatic) {
      return (
        <Marker role="status" className="my-2 text-xs">
          <MarkerIcon>
            <Spinner />
          </MarkerIcon>
          <MarkerContent className="shimmer">{config.pendingLabel(part.input)}</MarkerContent>
        </Marker>
      );
    }

    return (
      <ToolApprovalCard approvalId={part.approval.id} toolName={toolName} input={part.input} />
    );
  }

  if (part.state === "approval-responded") {
    return (
      <Marker role="status" className="my-2 text-xs">
        <MarkerIcon>
          {part.approval.approved ? <Spinner /> : <HugeiconsIcon icon={ShieldBanIcon} />}
        </MarkerIcon>
        <MarkerContent className={part.approval.approved ? "shimmer" : undefined}>
          {part.approval.approved ? config.pendingLabel(part.input) : "You didn't allow this"}
        </MarkerContent>
      </Marker>
    );
  }

  if (part.state === "output-denied") {
    return (
      <Marker className="my-2 text-xs">
        <MarkerIcon>
          <HugeiconsIcon icon={ShieldBanIcon} />
        </MarkerIcon>
        <MarkerContent>You didn&apos;t allow this</MarkerContent>
      </Marker>
    );
  }

  const isError = part.state === "output-error";
  const label = isError ? config.errorLabel : config.doneLabel(part.input, part.output);
  const target = part.state === "output-available" ? doneMarkerTarget(toolName, part.output) : null;

  return (
    <div className="@container/tool-marker w-full">
      <Popover>
        <PopoverTrigger
          render={
            <Marker
              render={<button type="button" />}
              className={cn(
                "my-2 w-fit text-xs transition-colors hover:text-foreground",
                isError && "text-destructive hover:text-destructive",
              )}
            />
          }
        >
          <MarkerIcon>
            <HugeiconsIcon icon={isError ? AlertCircleIcon : config.icon} />
          </MarkerIcon>
          <MarkerContent>{label}</MarkerContent>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-96">
          <PopoverHeader>
            <PopoverTitle className="text-sm">{label}</PopoverTitle>
          </PopoverHeader>
          {isError ? (
            <p className="text-xs text-destructive">{part.errorText || "An error occurred."}</p>
          ) : (
            <config.Details input={part.input} output={part.output} />
          )}
        </PopoverContent>
      </Popover>
      {target ? <DoneMarkerActions target={target} /> : null}
    </div>
  );
});
