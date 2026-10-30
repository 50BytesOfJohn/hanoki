import * as React from "react";
import { getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart } from "ai";
import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowUpRight01Icon,
  ChatAdd01Icon,
  MessageAdd01Icon,
  ComputerTerminal01Icon,
  Database02Icon,
  Delete02Icon,
  DatabaseSearchIcon,
  Edit02Icon,
  File01Icon,
  FileEditIcon,
  FileScriptIcon,
  Folder01Icon,
  MessagesSquare,
  FolderAddIcon,
  FolderTransferIcon,
  GlobalSearchIcon,
  Globe02Icon,
  ShieldBanIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@/components/ui/code-block";
import { ButtonGroup } from "@/components/ui/group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatRespondToToolApproval } from "@/features/chat/chat-context";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";
import { notifyChatTreeChanged } from "@/features/items/item-title-events";
import { useWorkspaceStore } from "@/features/workspace/store";
import type { ChatTreeSnapshot } from "@shared/ipc";
import { APPROVAL_TOOLS, isApprovalToolName } from "@shared/chat/tool-approval";
import {
  formatHanokiDeleteApproval,
  formatHanokiMoveApproval,
  formatHanokiRenameApproval,
} from "./tool-approval-summary";
import { formatHanokiKindCounts } from "./tool-approval-summary";
import { useToolApprovalActions } from "./tool-approval-actions";
import {
  indexChatTree,
  openHanokiItem,
  TOOL_RESULT_CARDS,
  type OpenableItemType,
} from "./tool-result-cards";

export { isToolUIPart };

type ToolIcon = React.ComponentProps<typeof HugeiconsIcon>["icon"];

interface ToolMarkerConfig {
  icon: ToolIcon;
  pendingLabel: (input: unknown) => string;
  doneLabel: (input: unknown, output?: unknown) => string;
  errorLabel: string;
  /** Short result fact shown after the title, such as a count or an outcome. */
  description?: (output: unknown) => string | null;
  /** Plain-language result the row expands into. Without one the row doesn't expand. */
  Summary?: React.ComponentType<{ input: unknown; output: unknown }>;
  /** Raw data for the curious, kept behind the row's technical details button. */
  Details: React.ComponentType<{ input: unknown; output: unknown }>;
}

function getStringField(input: unknown, field: string): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const value = (input as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : null;
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

function ExternalLinkLine({
  url,
  title,
  description,
}: {
  url: string;
  title: string;
  description?: string | null;
}) {
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <TraceLine>
        <TraceIcon>
          <HugeiconsIcon icon={Globe02Icon} />
        </TraceIcon>
        <TraceTitle>
          {title}
          <span className="sr-only"> (opens in a new tab)</span>
        </TraceTitle>
        {description ? <TraceDescription>{description}</TraceDescription> : null}
        <TraceIcon>
          <HugeiconsIcon icon={ArrowUpRight01Icon} />
        </TraceIcon>
      </TraceLine>
    </a>
  );
}

function WebSearchSummary({ output }: { input: unknown; output: unknown }) {
  const results = getWebSearchResults(output);

  if (results.length === 0) {
    return <p>No results returned.</p>;
  }

  return (
    <Trace>
      {results.map((result) => (
        <ExternalLinkLine
          key={result.url}
          url={result.url}
          title={result.title || result.url}
          description={getHostname(result.url)}
        />
      ))}
    </Trace>
  );
}

// --- Workspace lookups ---

function WorkspaceItemLine({ item }: { item: unknown }) {
  const kind = getStringField(item, "kind");
  const id = getStringField(item, "id");
  const name = getStringField(item, "name") ?? getStringField(item, "title") ?? "Untitled";
  const line = (
    <TraceLine>
      <TraceIcon>
        <HugeiconsIcon icon={kind === "folder" ? Folder01Icon : File01Icon} />
      </TraceIcon>
      <TraceTitle>{name}</TraceTitle>
    </TraceLine>
  );

  if (!id || (kind !== "chat" && kind !== "markdown" && kind !== "terminal")) return line;

  return (
    <button type="button" onClick={() => openHanokiItem(id, kind, "focus")}>
      {line}
    </button>
  );
}

function getRecordArray(value: unknown, field: string): Record<string, unknown>[] {
  if (typeof value !== "object" || value === null) return [];
  const entries = (value as Record<string, unknown>)[field];
  if (!Array.isArray(entries)) return [];
  return entries.filter(
    (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
  );
}

function countLabel(count: number, one: string, many: string): string | null {
  return count > 0 ? `${count} ${count === 1 ? one : many}` : null;
}

function BrowseSummary({ output }: { input: unknown; output: unknown }) {
  const items = getRecordArray(output, "items");
  if (items.length === 0) return <p>Nothing here.</p>;

  return (
    <Trace>
      {items.map((item, index) => (
        <WorkspaceItemLine key={getStringField(item, "id") ?? index} item={item} />
      ))}
    </Trace>
  );
}

function SearchChatsSummary({ output }: { input: unknown; output: unknown }) {
  const chats = getRecordArray(output, "chats");
  if (chats.length === 0) return <p>No matching chats.</p>;

  return (
    <Trace>
      {chats.map((chat, index) => (
        <WorkspaceItemLine
          key={getStringField(chat, "id") ?? index}
          item={{ ...chat, kind: "chat" }}
        />
      ))}
    </Trace>
  );
}

function ModelsSummary({ output }: { input: unknown; output: unknown }) {
  const models = getRecordArray(output, "models");
  if (models.length === 0) return <p>No models are turned on.</p>;

  return <p>{models.map((model) => getStringField(model, "displayName") ?? "Model").join(", ")}</p>;
}

function describeLocation(output: unknown): string {
  return getStringField(output, "pathString") ?? "Top level";
}

function getChatName(output: unknown): string | null {
  const chat = (output as { chat?: unknown } | null)?.chat;
  return getStringField(chat, "name");
}

function describeMessageCount(output: unknown): string | null {
  return countLabel(getRecordArray(output, "messages").length, "message", "messages");
}

/** Reads of a single item: the row itself opens what was read. */
function getReadTarget(
  toolName: string,
  input: unknown,
  output: unknown,
): { id: string; type: OpenableItemType } | null {
  const noteId = toolName === "hanokiReadNote" ? getStringField(input, "noteId") : null;
  if (noteId) return { id: noteId, type: "markdown" };

  if (toolName === "hanokiReadChat" || toolName === "hanokiGetChatContent") {
    const chatId = getStringField(input, "chatId");
    return chatId ? { id: chatId, type: "chat" } : null;
  }

  if (toolName === "hanokiGetItem") {
    const id = getStringField(output, "id");
    const kind = getStringField(output, "kind");
    if (id && (kind === "chat" || kind === "markdown" || kind === "terminal")) {
      return { id, type: kind };
    }
  }
  return null;
}

// --- Web fetch details (Firecrawl /v2/scrape) ---

function WebFetchSummary({ input, output }: { input: unknown; output: unknown }) {
  const data = (output as { data?: Record<string, unknown> } | null)?.data;
  const metadata =
    typeof data?.metadata === "object" && data.metadata !== null
      ? (data.metadata as Record<string, unknown>)
      : null;
  const url = getStringField(metadata, "sourceURL") ?? getStringField(input, "url");
  const title = getStringField(metadata, "title") ?? url ?? "Fetched page";
  const description = getStringField(metadata, "description");

  return (
    <>
      {url ? (
        <Trace>
          <ExternalLinkLine url={url} title={title} description={getHostname(url)} />
        </Trace>
      ) : (
        <p>{title}</p>
      )}
      {description ? <p className="line-clamp-3">{description}</p> : null}
    </>
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

/** Monospace tool text with a copy action, labelled when it isn't the only block. */
function ToolCode({
  label,
  value,
  children,
  variant,
}: {
  label?: string;
  value: string;
  children?: React.ReactNode;
  variant?: "default" | "destructive";
}) {
  const copy = (
    <CodeBlockActions>
      <CodeBlockCopyButton value={value} />
    </CodeBlockActions>
  );

  return (
    <CodeBlock size="sm" variant={variant}>
      {label ? (
        <CodeBlockHeader>
          <CodeBlockTitle>{label}</CodeBlockTitle>
          {copy}
        </CodeBlockHeader>
      ) : (
        copy
      )}
      <CodeBlockContent wrap className="max-h-64 scrollbar">
        {children ?? value}
      </CodeBlockContent>
    </CodeBlock>
  );
}

function CommandCode({ command }: { command: string }) {
  return (
    <ToolCode value={command}>
      <CodeBlockLine>
        <span className="text-muted-foreground">$ </span>
        {command}
      </CodeBlockLine>
    </ToolCode>
  );
}

function OutputStream({
  label,
  value,
  variant,
}: {
  label: string;
  value: string | null;
  variant?: "default" | "destructive";
}) {
  if (!value?.trim()) return null;

  return <ToolCode label={label} value={value} variant={variant} />;
}

function TerminalRunDetails({ input, output }: { input: unknown; output: unknown }) {
  const command = getStringField(input, "command");
  const exitCode = getNumberField(output, "exitCode");
  const cwd = shortenPath(getStringField(output, "cwd"));
  const status =
    exitCode === null ? null : exitCode === 0 ? "Finished successfully" : `Exit code ${exitCode}`;

  return (
    <>
      {command ? <CommandCode command={command} /> : null}
      <OutputStream
        label="Output"
        value={getStringField(output, "stdout") ?? getStringField(output, "output")}
      />
      {/* Plenty of tools log to stderr on success, so only a failure reads as an error. */}
      <OutputStream
        label="Errors"
        value={getStringField(output, "stderr")}
        variant={exitCode ? "destructive" : "default"}
      />
      {status || cwd ? <p>{[status, cwd].filter(Boolean).join(" · ")}</p> : null}
    </>
  );
}

function TerminalReadFileDetails({ input, output }: { input: unknown; output: unknown }) {
  const filePath = shortenPath(getStringField(output, "path") ?? getStringField(input, "path"));
  const content = getStringField(output, "content");

  if (!content?.trim()) {
    return filePath ? <p className="font-mono break-all">{filePath}</p> : null;
  }

  return <ToolCode label={filePath ?? "Contents"} value={content} />;
}

function TerminalWriteFileDetails({ input, output }: { input: unknown; output: unknown }) {
  const filePath = shortenPath(getStringField(output, "path") ?? getStringField(input, "path"));
  const bytesWritten = getNumberField(output, "bytesWritten");

  return (
    <>
      <OutputStream label={filePath ?? "Written"} value={getStringField(input, "content")} />
      {bytesWritten === null ? null : <p>{bytesWritten.toLocaleString()} bytes written</p>}
    </>
  );
}

// --- Generic fallback details ---

function hasDetailValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value !== "object" || Object.keys(value).length > 0;
}

function GenericToolDetails({ input, output }: { input: unknown; output: unknown }) {
  return (
    <>
      {hasDetailValue(input) ? (
        <ToolCode label="Input" value={JSON.stringify(input, null, 2)} />
      ) : null}
      {hasDetailValue(output) ? (
        <ToolCode label="Output" value={JSON.stringify(output, null, 2)} />
      ) : null}
    </>
  );
}

function describeExitCode(output: unknown): string | null {
  const exitCode = getNumberField(output, "exitCode");
  return exitCode === null || exitCode === 0 ? null : "Finished with a problem";
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
    description: (output) => countLabel(getWebSearchResults(output).length, "result", "results"),
    Summary: WebSearchSummary,
    Details: GenericToolDetails,
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
    Summary: WebFetchSummary,
    Details: GenericToolDetails,
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
    description: describeExitCode,
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
    description: (output) => countLabel(getRecordArray(output, "items").length, "item", "items"),
    Summary: BrowseSummary,
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
    description: (output) => countLabel(getRecordArray(output, "chats").length, "chat", "chats"),
    Summary: SearchChatsSummary,
    Details: GenericToolDetails,
  },
  hanokiGetChatContent: {
    icon: Database02Icon,
    pendingLabel: () => "Reading a Hanoki chat…",
    doneLabel: (_input, output) => {
      const title = getChatName(output);
      return title ? `Read “${title}”` : "Read a chat";
    },
    errorLabel: "Reading Hanoki chat failed",
    description: describeMessageCount,
    Details: GenericToolDetails,
  },
  hanokiFindTools: {
    icon: DatabaseSearchIcon,
    pendingLabel: () => "Finding Hanoki tools…",
    doneLabel: () => "Found Hanoki tools",
    errorLabel: "Finding Hanoki tools failed",
    Details: GenericToolDetails,
  },
  hanokiGetItem: {
    icon: Database02Icon,
    pendingLabel: () => "Reading a Hanoki item…",
    doneLabel: (_input, output) => {
      const title = getStringField(output, "title") ?? getStringField(output, "name");
      return title ? `Read “${title}”` : "Read a Hanoki item";
    },
    errorLabel: "Reading the Hanoki item failed",
    Details: GenericToolDetails,
  },
  hanokiReadNote: {
    icon: FileScriptIcon,
    pendingLabel: () => "Reading a note…",
    doneLabel: (_input, output) => {
      const title = getStringField(output, "title");
      return title ? `Read “${title}”` : "Read a note";
    },
    errorLabel: "Reading the note failed",
    Details: GenericToolDetails,
  },
  hanokiReadChat: {
    icon: MessagesSquare,
    pendingLabel: () => "Reading a chat…",
    doneLabel: (_input, output) => {
      const title = getChatName(output);
      return title ? `Read “${title}”` : "Read a chat";
    },
    errorLabel: "Reading the chat failed",
    description: describeMessageCount,
    Details: GenericToolDetails,
  },
  hanokiGetCurrentFolder: {
    icon: Folder01Icon,
    pendingLabel: () => "Reading this chat’s folder…",
    doneLabel: () => "Read this chat’s folder",
    errorLabel: "Reading this chat’s folder failed",
    description: describeLocation,
    Details: GenericToolDetails,
  },
  hanokiGetItemLocation: {
    icon: Folder01Icon,
    pendingLabel: () => "Reading a Hanoki item location…",
    doneLabel: () => "Read a Hanoki item location",
    errorLabel: "Reading Hanoki item location failed",
    description: describeLocation,
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
      return count > 0 ? `Moved ${count} ${count === 1 ? "item" : "items"}` : "Moved items";
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
  hanokiListModels: {
    icon: Database02Icon,
    pendingLabel: () => "Listing models…",
    doneLabel: () => "Listed models",
    errorLabel: "Listing models failed",
    description: (output) => countLabel(getRecordArray(output, "models").length, "model", "models"),
    Summary: ModelsSummary,
    Details: GenericToolDetails,
  },
  hanokiEditNote: {
    icon: FileEditIcon,
    pendingLabel: () => "Editing a note…",
    doneLabel: (_input, output) => {
      const title = getStringField(output, "title");
      return title ? `Edited “${title}”` : "Edited a note";
    },
    errorLabel: "Editing the note failed",
    Details: GenericToolDetails,
  },
  hanokiDeleteItems: {
    icon: Delete02Icon,
    pendingLabel: (input) => {
      const count = getArrayLength(input, "items");
      return count > 0
        ? `Deleting ${count} Hanoki ${count === 1 ? "item" : "items"}…`
        : "Deleting Hanoki items…";
    },
    doneLabel: (input) => {
      const count = getArrayLength(input, "items");
      return count > 0
        ? `Deleted ${count} Hanoki ${count === 1 ? "item" : "items"}`
        : "Deleted Hanoki items";
    },
    errorLabel: "Deleting Hanoki items failed",
    Details: GenericToolDetails,
  },
  hanokiCreateTerminal: {
    icon: ComputerTerminal01Icon,
    pendingLabel: (input) => {
      const title = getStringField(input, "title");
      return title ? `Creating terminal “${title}”…` : "Creating a Hanoki terminal…";
    },
    doneLabel: (input) => {
      const title = getStringField(input, "title");
      return title ? `Created terminal “${title}”` : "Created a Hanoki terminal";
    },
    errorLabel: "Creating the Hanoki terminal failed",
    Details: GenericToolDetails,
  },
  hanokiTerminalGet: {
    icon: ComputerTerminal01Icon,
    pendingLabel: () => "Reading terminal output…",
    doneLabel: () => "Read terminal output",
    errorLabel: "Reading terminal output failed",
    Details: TerminalRunDetails,
  },
  hanokiTerminalRun: {
    icon: ComputerTerminal01Icon,
    pendingLabel: (input) => {
      const command = getStringField(input, "command");
      return command ? `Running ${command} in terminal…` : "Running a terminal command…";
    },
    doneLabel: (input) => {
      const command = getStringField(input, "command");
      return command ? `Ran ${command} in terminal` : "Ran a terminal command";
    },
    errorLabel: "Terminal command failed",
    description: describeExitCode,
    Details: TerminalRunDetails,
  },
  hanokiTerminalWrite: {
    icon: ComputerTerminal01Icon,
    pendingLabel: () => "Writing to terminal…",
    doneLabel: () => "Wrote to terminal",
    errorLabel: "Writing to the terminal failed",
    Details: TerminalRunDetails,
  },
  hanokiTerminalInterrupt: {
    icon: ComputerTerminal01Icon,
    pendingLabel: () => "Interrupting terminal…",
    doneLabel: () => "Interrupted terminal",
    errorLabel: "Interrupting the terminal failed",
    Details: TerminalRunDetails,
  },
};

function counted(verb: string, one: string, many: string) {
  return (inputs: unknown[]) => `${verb} ${inputs.length} ${inputs.length === 1 ? one : many}`;
}

function kindsFromItems(inputs: unknown[]): string[] {
  return inputs.flatMap((input) => {
    const items = (input as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return [];
    return items.flatMap((item) => getStringField(item, "kind") ?? []);
  });
}

/** Row title when several calls to one tool share a row. */
const GROUP_LABELS: Record<string, (inputs: unknown[]) => string> = {
  webSearch: counted("Searched the web", "time", "times"),
  webFetch: counted("Fetched", "page", "pages"),
  terminalRun: counted("Ran", "command", "commands"),
  terminalReadFile: counted("Read", "file", "files"),
  terminalWriteFile: counted("Saved", "file", "files"),
  hanokiBrowseItems: counted("Browsed Hanoki", "time", "times"),
  hanokiSearchChats: counted("Searched Hanoki", "time", "times"),
  hanokiGetChatContent: counted("Read", "chat", "chats"),
  hanokiReadChat: counted("Read", "chat", "chats"),
  hanokiReadNote: counted("Read", "note", "notes"),
  hanokiGetItem: counted("Read", "item", "items"),
  hanokiCreateFolder: counted("Created", "folder", "folders"),
  hanokiCreateChat: counted("Created", "chat", "chats"),
  hanokiCreateMarkdown: counted("Created", "note", "notes"),
  hanokiCreateTerminal: counted("Created", "terminal", "terminals"),
  hanokiSendMessage: counted("Saved", "draft", "drafts"),
  hanokiEditNote: counted("Edited", "note", "notes"),
  hanokiTerminalRun: counted("Ran", "command", "commands"),
  hanokiRenameItem: (inputs) =>
    `Renamed ${formatHanokiKindCounts(inputs.flatMap((input) => getStringField(input, "kind") ?? []))}`,
  hanokiMoveItems: (inputs) => `Moved ${formatHanokiKindCounts(kindsFromItems(inputs))}`,
  hanokiDeleteItems: (inputs) => `Deleted ${formatHanokiKindCounts(kindsFromItems(inputs))}`,
};

function getGroupLabel(toolName: string, inputs: unknown[]): string {
  return GROUP_LABELS[toolName]?.(inputs) ?? `Used ${toolName} ${inputs.length} times`;
}

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
      body: command ? <CommandCode command={command} /> : null,
    };
  }

  if (toolName === "terminalReadFile") {
    const filePath = shortenPath(getStringField(input, "path"));
    return {
      title: "Read a file from your computer?",
      body: filePath ? <ToolCode value={filePath} /> : null,
    };
  }

  if (toolName === "terminalWriteFile") {
    const filePath = shortenPath(getStringField(input, "path"));
    const content = getStringField(input, "content");
    return {
      title: "Save a file on your computer?",
      body: (
        <div className="flex flex-col gap-1.5">
          {content ? (
            <ToolCode label={filePath ?? "Contents"} value={content} />
          ) : filePath ? (
            <ToolCode value={filePath} />
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

  if (toolName === "hanokiDeleteItems") {
    const deletion = formatHanokiDeleteApproval(input);
    return {
      title: deletion.title,
      body: (
        <p className="rounded-md bg-surface-secondary px-2.5 py-2 text-xs text-foreground">
          {deletion.summary}
        </p>
      ),
    };
  }

  if (toolName === "hanokiEditNote") {
    const content = getStringField(input, "content");
    return {
      title: "Edit this note?",
      body: content ? (
        <p className="max-h-40 overflow-auto rounded-md bg-surface-secondary px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground scrollbar">
          {content}
        </p>
      ) : null,
    };
  }

  if (toolName === "hanokiTerminalRun") {
    const command = getStringField(input, "command");
    return {
      title: "Run this command in a Hanoki terminal?",
      body: command ? <CommandCode command={command} /> : null,
    };
  }

  if (toolName === "hanokiTerminalWrite" || toolName === "hanokiTerminalInterrupt") {
    return {
      title:
        toolName === "hanokiTerminalInterrupt"
          ? "Interrupt this Hanoki terminal?"
          : "Write to this Hanoki terminal?",
      body: null,
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
    body: <ToolCode value={JSON.stringify(input, null, 2)} />,
  };
}

function approvalNamesFromInput(
  input: unknown,
  snapshot: ChatTreeSnapshot | undefined,
): {
  destinationFolderName: string | null;
  currentItemName: string | null;
  targetChatTitle: string | null;
} {
  const { folders, items } = indexChatTree(snapshot);
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
  const respondToToolApproval = useChatRespondToToolApproval();
  const { allowToolForChat, allowAllForChat } = useToolApprovalActions();
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
  const allowableTool = isApprovalToolName(toolName) ? toolName : null;
  const icon = getToolConfig(toolName).icon;

  const respond = (approved: boolean, reason?: string) => {
    setHasResponded(true);
    respondToToolApproval({ id: approvalId, approved, ...(reason ? { reason } : {}) });
  };

  return (
    <Card size="sm" className="rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-sans text-[13px]">
          <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      {body ? <CardContent>{body}</CardContent> : null}
      <CardFooter className="flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={hasResponded}
          onClick={() => respond(false, "The user did not allow this action.")}
        >
          Don&apos;t allow
        </Button>
        <ButtonGroup>
          {allowableTool ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={hasResponded}
                    onClick={() => {
                      setHasResponded(true);
                      allowToolForChat(allowableTool);
                    }}
                  />
                }
              >
                Allow for this chat
              </TooltipTrigger>
              <TooltipContent>
                Stop asking about {APPROVAL_TOOLS[allowableTool].label} in this chat
              </TooltipContent>
            </Tooltip>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="secondary"
                  disabled={hasResponded}
                  aria-label="More ways to allow"
                />
              }
            >
              <HugeiconsIcon icon={ArrowDown01Icon} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem
                onClick={() => {
                  setHasResponded(true);
                  allowAllForChat();
                }}
              >
                <span className="flex flex-col gap-0.5">
                  <span>Allow all actions in this chat</span>
                  <span className="text-xs text-muted-foreground">
                    Nothing asks again until you switch back in the tools menu.
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
        <Button size="sm" disabled={hasResponded} onClick={() => respond(true)}>
          Allow once
        </Button>
      </CardFooter>
    </Card>
  );
}

function ToolDetailsButton({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="-my-1 text-muted-foreground opacity-0 transition-opacity group-hover/tool-row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                  aria-label="Technical details"
                />
              }
            />
          }
        >
          <HugeiconsIcon icon={SourceCodeIcon} />
        </TooltipTrigger>
        <TooltipContent>Technical details</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="max-h-96 w-96 overflow-y-auto scrollbar">
        <PopoverHeader>
          <PopoverTitle className="text-sm">Technical details</PopoverTitle>
        </PopoverHeader>
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

function PendingToolLine({ label }: { label: string }) {
  return (
    <TraceLine role="status" status="running">
      <TraceIcon>
        <Spinner />
      </TraceIcon>
      <TraceTitle>{label}</TraceTitle>
    </TraceLine>
  );
}

function DeniedToolLine() {
  return (
    <TraceLine>
      <TraceIcon>
        <HugeiconsIcon icon={ShieldBanIcon} />
      </TraceIcon>
      <TraceTitle>You didn&apos;t allow this</TraceTitle>
    </TraceLine>
  );
}

const TREE_CHANGING_TOOLS = new Set([
  "hanokiCreateFolder",
  "hanokiCreateChat",
  "hanokiCreateMarkdown",
  "hanokiCreateTerminal",
  "hanokiMoveItems",
  "hanokiRenameItem",
  "hanokiEditNote",
  "hanokiDeleteItems",
]);

function getPartToolName(part: ToolUIPart | DynamicToolUIPart): string {
  return part.type === "dynamic-tool" ? part.toolName : getToolName(part);
}

/** Lives on the row, not the result, because a collapsed result isn't mounted. */
function useNotifyTreeChanges(parts: (ToolUIPart | DynamicToolUIPart)[]) {
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  const finishedCalls = parts
    .filter(
      (part) => part.state === "output-available" && TREE_CHANGING_TOOLS.has(getPartToolName(part)),
    )
    .map((part) => part.toolCallId)
    .join();

  React.useEffect(() => {
    if (workspaceId && finishedCalls) notifyChatTreeChanged(workspaceId);
  }, [finishedCalls, workspaceId]);
}

function ToolCallRow({
  inGroup = false,
  isAnimating,
  part,
}: {
  inGroup?: boolean;
  isAnimating: boolean;
  part: ToolUIPart | DynamicToolUIPart;
}) {
  const toolName = getPartToolName(part);
  const config = getToolConfig(toolName);

  if (part.state === "input-streaming" || part.state === "input-available") {
    // A call left here after the stream ended was cut off and will never finish.
    if (!isAnimating) {
      return (
        <TraceLine>
          <TraceIcon>
            <HugeiconsIcon icon={config.icon} />
          </TraceIcon>
          <TraceTitle>Stopped before finishing</TraceTitle>
        </TraceLine>
      );
    }

    return <PendingToolLine label={config.pendingLabel(part.input)} />;
  }

  if (part.state === "approval-requested") {
    // Automatic approvals carry state through the stream without a decision
    // from the user; only manual ones get a card.
    if (part.approval.isAutomatic) {
      return <PendingToolLine label={config.pendingLabel(part.input)} />;
    }

    return (
      <ToolApprovalCard approvalId={part.approval.id} toolName={toolName} input={part.input} />
    );
  }

  if (part.state === "approval-responded") {
    return part.approval.approved ? (
      <PendingToolLine label={config.pendingLabel(part.input)} />
    ) : (
      <DeniedToolLine />
    );
  }

  if (part.state === "output-denied") {
    return <DeniedToolLine />;
  }

  const isError = part.state === "output-error";
  const label = isError ? config.errorLabel : config.doneLabel(part.input, part.output);
  const details = (
    <ToolDetailsButton>
      {isError ? (
        <>
          <GenericToolDetails input={part.input} output={undefined} />
          <ToolCode
            label="Error"
            value={part.errorText || "An error occurred."}
            variant="destructive"
          />
        </>
      ) : (
        <config.Details input={part.input} output={part.output} />
      )}
      {part.approval?.isAutomatic && part.approval.reason ? (
        <p>Ran without asking. {part.approval.reason}</p>
      ) : null}
    </ToolDetailsButton>
  );

  const ResultCard = isError ? null : TOOL_RESULT_CARDS[toolName];
  const result = ResultCard ? (
    <ResultCard input={part.input} output={part.output} label={label} details={details} />
  ) : null;

  // A group's row already names the action, so its results need no row of their own.
  if (result && inGroup) return result;

  const description = isError ? null : (config.description?.(part.output) ?? null);
  const line = (
    <TraceLine status={isError ? "error" : undefined}>
      <TraceIcon>
        <HugeiconsIcon icon={isError ? AlertCircleIcon : config.icon} />
      </TraceIcon>
      <TraceTitle>{label}</TraceTitle>
      {description ? <TraceDescription>{description}</TraceDescription> : null}
    </TraceLine>
  );
  const Summary = isError ? null : config.Summary;

  if (result) {
    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
        <TraceCollapsibleContent>{result}</TraceCollapsibleContent>
      </TraceCollapsible>
    );
  }

  if (isError || Summary) {
    return (
      <TraceCollapsible className="group/tool-row">
        <div className="flex min-w-0 items-center gap-1">
          <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
          {details}
        </div>
        <TraceCollapsibleContent className="flex flex-col gap-2 text-xs">
          {isError ? (
            <p>{part.errorText || "Something went wrong."}</p>
          ) : Summary ? (
            <Summary input={part.input} output={part.output} />
          ) : null}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    );
  }

  const target = getReadTarget(toolName, part.input, part.output);

  return (
    <div className="group/tool-row flex min-w-0 items-center gap-1">
      {target ? (
        <button
          type="button"
          className="flex w-fit max-w-full min-w-0 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => openHanokiItem(target.id, target.type, "focus")}
        >
          {line}
        </button>
      ) : (
        line
      )}
      {details}
    </div>
  );
}

function isRunning(part: ToolUIPart | DynamicToolUIPart, isAnimating: boolean): boolean {
  if (part.state === "input-streaming" || part.state === "input-available") return isAnimating;
  if (part.state === "approval-requested") return true;
  return part.state === "approval-responded" && part.approval.approved === true;
}

function ToolCallGroup({
  isAnimating,
  parts,
  toolName,
}: {
  isAnimating: boolean;
  parts: (ToolUIPart | DynamicToolUIPart)[];
  toolName: string;
}) {
  const config = getToolConfig(toolName);
  const running = parts.filter((part) => isRunning(part, isAnimating));
  const failedCount = parts.filter((part) => part.state === "output-error").length;
  const finishedCount = parts.length - running.length;
  const current = running.at(-1);

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine status={current ? "running" : failedCount > 0 ? "error" : undefined}>
          <TraceIcon>{current ? <Spinner /> : <HugeiconsIcon icon={config.icon} />}</TraceIcon>
          <TraceTitle>
            {current
              ? config.pendingLabel(current.input)
              : getGroupLabel(
                  toolName,
                  parts.map((part) => part.input),
                )}
          </TraceTitle>
          {current ? (
            <TraceDescription>
              {finishedCount} of {parts.length}
            </TraceDescription>
          ) : failedCount > 0 ? (
            <TraceDescription>{failedCount} failed</TraceDescription>
          ) : null}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent keepMounted>
        <Trace className="gap-1">
          {parts.map((part) => (
            <ToolCallRow key={part.toolCallId} inGroup isAnimating={isAnimating} part={part} />
          ))}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

/** One row for one or more calls to the same tool. */
export const ToolCallMarker = React.memo(function ToolCallMarker({
  isAnimating,
  parts,
  toolName,
}: {
  isAnimating: boolean;
  parts: (ToolUIPart | DynamicToolUIPart)[];
  toolName: string;
}) {
  useNotifyTreeChanges(parts);
  const [only] = parts;

  if (only && parts.length === 1) return <ToolCallRow isAnimating={isAnimating} part={only} />;

  return <ToolCallGroup isAnimating={isAnimating} parts={parts} toolName={toolName} />;
});
