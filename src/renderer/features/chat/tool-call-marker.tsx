import * as React from "react";
import { getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart } from "ai";
import {
  AlertCircleIcon,
  Database02Icon,
  DatabaseSearchIcon,
  Edit02Icon,
  FolderAddIcon,
  FolderTransferIcon,
  GlobalSearchIcon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
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

export { isToolUIPart };

type ToolIcon = React.ComponentProps<typeof HugeiconsIcon>["icon"];

interface ToolMarkerConfig {
  icon: ToolIcon;
  pendingLabel: (input: unknown) => string;
  doneLabel: (input: unknown) => string;
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

export const ToolCallMarker = React.memo(function ToolCallMarker({
  part,
}: {
  part: ToolUIPart | DynamicToolUIPart;
}) {
  const toolName = part.type === "dynamic-tool" ? part.toolName : getToolName(part);
  const config = getToolConfig(toolName);

  React.useEffect(() => {
    if (
      part.state !== "output-available" ||
      (toolName !== "hanokiCreateFolder" &&
        toolName !== "hanokiMoveItems" &&
        toolName !== "hanokiRenameItem")
    ) {
      return;
    }

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.chats.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all }),
    ]);
  }, [part.state, part.toolCallId, toolName]);

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

  const isError = part.state === "output-error";
  const label = isError ? config.errorLabel : config.doneLabel(part.input);

  return (
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
  );
});
