export interface SidebarFolderReveal {
  folderId: string;
  ancestorFolderIds: string[];
}

let pendingReveal: SidebarFolderReveal | null = null;
const listeners = new Set<(reveal: SidebarFolderReveal) => void>();

export function requestSidebarFolderReveal(reveal: SidebarFolderReveal): void {
  pendingReveal = reveal;
  for (const listener of listeners) listener(reveal);
}

export function subscribeSidebarFolderReveal(
  listener: (reveal: SidebarFolderReveal) => void,
): () => void {
  listeners.add(listener);
  if (pendingReveal) listener(pendingReveal);
  return () => listeners.delete(listener);
}

export function clearSidebarFolderReveal(folderId: string): void {
  if (pendingReveal?.folderId === folderId) pendingReveal = null;
}
