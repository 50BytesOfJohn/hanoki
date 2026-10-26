// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatInfo, ProviderModelInfo } from "@shared/ipc";
import { queryKeys } from "@/queries/keys";
import { ChatSettingsPage } from "./chat-settings-page";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/mutations/chats", () => ({
  useUpdateChatSettings: () => ({ mutate, isPending: false }),
}));
vi.mock("@/features/workspace/store", () => ({ useWorkspaceStore: () => null }));

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function renderSettings(temperatureMax: number | null, temperature?: number) {
  const chat: ChatInfo = {
    type: "chat",
    id: "chat",
    workspaceId: "workspace",
    folderId: null,
    title: "Chat",
    data: { settings: { modelId: "model", modelConfig: { temperature } } },
    metadata: {},
    extensions: {},
    createdAt: 0,
    updatedAt: 0,
  };
  const model: ProviderModelInfo = {
    id: "model",
    providerId: "provider",
    providerModelId: "test/model",
    displayName: null,
    isEnabled: true,
    status: "active",
    temperatureMax,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(queryKeys.chats.byId(chat.id), chat);
  client.setQueryData(queryKeys.models.list(), [model]);
  return render(
    <QueryClientProvider client={client}>
      <ChatSettingsPage chatId={chat.id} />
    </QueryClientProvider>,
  );
}

describe("temperature control", () => {
  it("commits a value above one from the OpenRouter slider", () => {
    renderSettings(2, 1.6);
    const slider = screen.getByRole("slider", { hidden: true });
    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.keyUp(slider, { key: "End" });
    expect(mutate).toHaveBeenCalledWith(
      { id: "chat", input: { modelConfig: { temperature: 2 } } },
      expect.any(Object),
    );
  });

  it("shows OpenRouter's full range and resets to provider default", () => {
    renderSettings(2, 1.6);
    const slider = screen.getByRole("slider", { hidden: true });
    expect(slider.getAttribute("max")).toBe("2");
    expect(slider.getAttribute("aria-valuenow")).toBe("1.6");
    fireEvent.click(screen.getByRole("switch", { name: "Use custom temperature" }));
    expect(mutate).toHaveBeenCalledWith(
      { id: "chat", input: { modelConfig: { temperature: null } } },
      expect.any(Object),
    );
  });

  it("keeps an explicit zero custom", () => {
    renderSettings(2, 0);
    expect(screen.getByRole("slider", { hidden: true }).getAttribute("aria-valuenow")).toBe("0");
    expect(
      screen.getByRole("switch", { name: "Use custom temperature" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("disables an unsupported override but lets an existing override be reset", () => {
    const view = renderSettings(null);
    expect(
      screen.getByRole("switch", { name: "Use custom temperature" }).getAttribute("aria-disabled"),
    ).toBe("true");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByText(/selected model does not support custom temperature/)).toBeDefined();
    view.unmount();
    renderSettings(null, 0.7);
    fireEvent.click(screen.getByRole("switch", { name: "Use custom temperature" }));
    expect(mutate).toHaveBeenCalledWith(
      { id: "chat", input: { modelConfig: { temperature: null } } },
      expect.any(Object),
    );
  });

  it("explains an incompatible saved value after switching to a direct provider", () => {
    renderSettings(1, 1.6);
    expect(screen.getByRole("slider", { hidden: true }).getAttribute("max")).toBe("1");
    expect(screen.getByText(/Saved temperature 1.6 exceeds this model's limit of 1/)).toBeDefined();
  });
});
