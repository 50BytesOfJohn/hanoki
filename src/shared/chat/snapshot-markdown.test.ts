import { describe, expect, it } from "vitest";

import type { ChatTreeSnapshot } from "@shared/ipc";

import { omitSnapshotMarkdownBodies } from "./snapshot-markdown";

describe("omitSnapshotMarkdownBodies", () => {
  it("drops note bodies from a large snapshot and keeps titles", () => {
    const body = "x".repeat(200);
    const noteCount = 2_000;
    const snapshot: ChatTreeSnapshot = {
      workspaceId: "workspace-1",
      rootFolders: [
        {
          id: "wrap",
          workspaceId: "workspace-1",
          parentId: "imported",
          name: "Vault",
          createdAt: 1,
          updatedAt: 1,
          folders: [],
          items: Array.from({ length: noteCount }, (_, index) => ({
            type: "markdown" as const,
            id: `md-${index}`,
            workspaceId: "workspace-1",
            folderId: "wrap",
            title: `Note ${index}`,
            data: { markdown: `${body}-${index}` },
            metadata: {},
            extensions: {},
            createdAt: index,
            updatedAt: index,
          })),
        },
      ],
      rootItems: [
        {
          type: "chat",
          id: "chat-1",
          workspaceId: "workspace-1",
          folderId: null,
          title: "Chat",
          data: { settings: {}, currentBranchId: "branch-1" },
          metadata: {},
          extensions: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const light = omitSnapshotMarkdownBodies(snapshot);

    expect(light.rootFolders[0]?.items).toHaveLength(noteCount);
    expect(
      light.rootFolders[0]?.items.every(
        (item) => item.type === "markdown" && item.data.markdown === "",
      ),
    ).toBe(true);
    expect(light.rootFolders[0]?.items[0]?.title).toBe("Note 0");
    expect(light.rootItems[0]).toBe(snapshot.rootItems[0]);
    expect(JSON.stringify(light)).not.toContain(body);
  });
});
