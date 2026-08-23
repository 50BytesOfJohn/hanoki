import "../lib/electron-api";

export const markdownApi = {
  create: (workspaceId: string, title: string, folderId?: string | null) =>
    window.electronAPI.createMarkdown(workspaceId, title, folderId),
  queueContent: (id: string, markdown: string) =>
    window.electronAPI.queueMarkdownContent(id, markdown),
  flushContent: (id: string) => window.electronAPI.flushMarkdownContent(id),
};
