import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const item: { badge?: unknown } = {};
  return {
    item,
    Menu: { getApplicationMenu: () => ({ getMenuItemById: () => item }) },
  };
});

vi.mock("electron", () => ({ Menu: electron.Menu }));
vi.mock("../config", () => ({ getConfig: vi.fn() }));
vi.mock("./updater", () => ({ checkForUpdates: vi.fn() }));

import { setUnreadChatCount } from "./application-menu";

describe.runIf(process.platform === "darwin")("setUnreadChatCount", () => {
  beforeEach(() => {
    electron.item.badge = undefined;
  });

  it("shows a system-localized badge with the count", () => {
    setUnreadChatCount(3);
    expect(electron.item.badge).toEqual({ type: "new-items", count: 3 });
  });

  it("removes the badge when nothing is unread", () => {
    setUnreadChatCount(3);
    setUnreadChatCount(0);
    expect(electron.item.badge).toBeUndefined();
  });
});
