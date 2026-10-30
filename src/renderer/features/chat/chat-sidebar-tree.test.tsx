// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatInfo, ChatTreeChildrenSlice } from "@shared/ipc";

const getChildren = vi.fn<() => Promise<ChatTreeChildrenSlice>>();

vi.mock("@/api/workspaces", () => ({
  workspaceApi: { getActive: async () => ({}), updateSettings: async () => ({}) },
}));
vi.mock("@/api/items", () => ({ itemsApi: { get: async () => ({}) } }));
vi.mock("@/api/chat-tree", () => ({
  chatTreeApi: { getChildren, setUiState: async () => ({}) },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => () => {},
}));

const { queryClient } = await import("@/lib/query-client");
const { queryKeys } = await import("@/queries/keys");
const { useWorkspaceStore } = await import("@/features/workspace/store");
const { notifyChatTreeChanged } = await import("../items/item-title-events");
const { ChatSidebarProvider } = await import("./chat-sidebar");
const { ChatSidebarTree } = await import("./chat-sidebar-tree");

const WORKSPACE_ID = "workspace-1";

function chat(id: string, title: string): ChatInfo {
  return {
    type: "chat",
    id,
    workspaceId: WORKSPACE_ID,
    folderId: null,
    title,
    data: { settings: {} } as ChatInfo["data"],
    metadata: {},
    extensions: {},
    createdAt: 1,
    updatedAt: 1,
  };
}

function slice(...items: ChatInfo[]): ChatTreeChildrenSlice {
  return { workspaceId: WORKSPACE_ID, parentFolderId: null, folders: [], items };
}

async function renderSidebar() {
  render(
    <QueryClientProvider client={queryClient}>
      <ChatSidebarProvider>
        <ChatSidebarTree />
      </ChatSidebarProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("First chat");
}

beforeEach(() => {
  window.matchMedia = (() => ({
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  queryClient.clear();
  queryClient.setQueryData(queryKeys.settings.globalChat(), {});
  queryClient.setQueryData(queryKeys.workspaces.settings(WORKSPACE_ID), {});
  useWorkspaceStore.setState({
    workspace: { id: WORKSPACE_ID } as never,
    state: "idle",
    tabs: [],
    activeTabId: null,
    sidebarViewMode: "tree",
  });
  getChildren.mockReset();
});

afterEach(cleanup);

describe("ChatSidebarTree reloads", () => {
  it("keeps every row on screen while a tree change is reloading", async () => {
    getChildren.mockResolvedValue(slice(chat("a", "First chat")));
    await renderSidebar();

    let finishReload!: (value: ChatTreeChildrenSlice) => void;
    getChildren.mockReturnValue(new Promise((resolve) => (finishReload = resolve)));

    act(() => notifyChatTreeChanged(WORKSPACE_ID));

    // The whole point: mid-reload is the frame that used to be blank.
    expect(screen.getByText("First chat")).toBeDefined();
    expect(screen.queryByText("No items or folders yet.")).toBeNull();

    await act(async () => finishReload(slice(chat("a", "Renamed chat"))));
    await waitFor(() => expect(screen.getByText("Renamed chat")).toBeDefined());
  });

  it("ignores an older reload that lands after a newer one", async () => {
    getChildren.mockResolvedValue(slice(chat("a", "First chat")));
    await renderSidebar();

    let finishOlder!: (value: ChatTreeChildrenSlice) => void;
    let finishNewer!: (value: ChatTreeChildrenSlice) => void;
    getChildren.mockReturnValueOnce(new Promise((resolve) => (finishOlder = resolve)));
    getChildren.mockReturnValueOnce(new Promise((resolve) => (finishNewer = resolve)));

    act(() => notifyChatTreeChanged(WORKSPACE_ID));
    act(() => notifyChatTreeChanged(WORKSPACE_ID));

    await act(async () => finishNewer(slice(chat("a", "Newest title"))));
    await act(async () => finishOlder(slice(chat("a", "Stale title"))));

    await waitFor(() => expect(screen.getByText("Newest title")).toBeDefined());
    expect(screen.queryByText("Stale title")).toBeNull();
  });

  it("primes the item cache so a tab opened from a row has its title immediately", async () => {
    getChildren.mockResolvedValue(slice(chat("a", "First chat")));
    await renderSidebar();

    expect(queryClient.getQueryData<ChatInfo>(queryKeys.items.byId("a"))?.title).toBe("First chat");
    expect(queryClient.getQueryData<ChatInfo>(queryKeys.chats.byId("a"))?.title).toBe("First chat");
  });

  it("marks only the active item's row when the active tab changes", async () => {
    getChildren.mockResolvedValue(slice(chat("a", "First chat"), chat("b", "Second chat")));
    await renderSidebar();
    const row = (title: string) => screen.getByText(title).closest("[role=treeitem]");
    expect(row("First chat")?.getAttribute("data-active")).toBeNull();

    act(() => useWorkspaceStore.getState().openItem("a", "chat"));

    expect(row("First chat")?.getAttribute("data-active")).toBe("true");
    expect(row("Second chat")?.getAttribute("data-active")).toBeNull();
  });
});
