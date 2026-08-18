import "../lib/electron-api";

export const itemsApi = {
  get: (id: string) => window.electronAPI.getItem(id),
  updateTitle: (id: string, title: string) => window.electronAPI.updateItemTitle(id, title),
  move: (id: string, folderId: string | null) => window.electronAPI.moveItem(id, folderId),
  delete: (id: string) => window.electronAPI.deleteItem(id),
};
