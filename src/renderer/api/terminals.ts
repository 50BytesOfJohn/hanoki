import "../lib/electron-api";

export const terminalsApi = {
  create: (workspaceId: string, title: string, folderId?: string | null) =>
    window.electronAPI.createTerminal(workspaceId, title, folderId),
  start: (id: string) => window.electronAPI.startTerminal(id),
  write: (id: string, data: string) => window.electronAPI.writeTerminal(id, data),
  resize: (id: string, columns: number, rows: number) =>
    window.electronAPI.resizeTerminal(id, columns, rows),
};
