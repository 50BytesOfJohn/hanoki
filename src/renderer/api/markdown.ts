import "../lib/electron-api";

export const markdownApi = {
  create: (workspaceId: string, title: string, folderId?: string | null) =>
    window.electronAPI.createMarkdown(workspaceId, title, folderId),
  queueContent: (id: string, markdown: string) =>
    window.electronAPI.queueMarkdownContent(id, markdown),
  flushContent: (id: string) => window.electronAPI.flushMarkdownContent(id),
  listTitles: (workspaceId: string) => window.electronAPI.listMarkdownTitles(workspaceId),
  listBacklinks: (itemId: string) => window.electronAPI.listNoteBacklinks(itemId),
  listOutgoing: (itemId: string) => window.electronAPI.listOutgoingNoteLinks(itemId),
  exportFolder: (workspaceId: string) => window.electronAPI.exportMarkdownNotesFolder(workspaceId),
  importFolder: (workspaceId: string) => window.electronAPI.importMarkdownNotesFolder(workspaceId),
  cancelImport: () => window.electronAPI.cancelMarkdownNotesImport(),
};
