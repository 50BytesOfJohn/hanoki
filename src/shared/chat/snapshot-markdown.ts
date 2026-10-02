import type { ChatTreeFolderNode, ChatTreeSnapshot, ItemInfo } from "@shared/ipc";

function omitItemBody(item: ItemInfo): ItemInfo {
  if (item.type !== "markdown" || item.data.markdown.length === 0) return item;
  return { ...item, data: { ...item.data, markdown: "" } };
}

function omitFolderBodies(folder: ChatTreeFolderNode): ChatTreeFolderNode {
  return {
    ...folder,
    folders: folder.folders.map(omitFolderBodies),
    items: folder.items.map(omitItemBody),
  };
}

/** Tree snapshots are names and structure. Note bodies stay on the item read. */
export function omitSnapshotMarkdownBodies(snapshot: ChatTreeSnapshot): ChatTreeSnapshot {
  return {
    workspaceId: snapshot.workspaceId,
    rootFolders: snapshot.rootFolders.map(omitFolderBodies),
    rootItems: snapshot.rootItems.map(omitItemBody),
  };
}
