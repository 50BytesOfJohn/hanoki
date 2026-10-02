import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type MarkdownApi = Pick<
  IpcApi,
  | "createMarkdown"
  | "queueMarkdownContent"
  | "flushMarkdownContent"
  | "listMarkdownTitles"
  | "listNoteBacklinks"
  | "listOutgoingNoteLinks"
  | "exportMarkdownNotesFolder"
  | "importMarkdownNotesFolder"
  | "cancelMarkdownNotesImport"
>;

export function createMarkdownApi(): MarkdownApi {
  return {
    createMarkdown: (workspaceId, title, folderId) =>
      invokeIpc(IPC_CHANNELS.markdown.create, workspaceId, title, folderId),
    queueMarkdownContent: (id, markdown) =>
      invokeIpc(IPC_CHANNELS.markdown.queueContent, id, markdown),
    flushMarkdownContent: (id) => invokeIpc(IPC_CHANNELS.markdown.flushContent, id),
    listMarkdownTitles: (workspaceId) => invokeIpc(IPC_CHANNELS.markdown.listTitles, workspaceId),
    listNoteBacklinks: (itemId) => invokeIpc(IPC_CHANNELS.markdown.listBacklinks, itemId),
    listOutgoingNoteLinks: (itemId) => invokeIpc(IPC_CHANNELS.markdown.listOutgoing, itemId),
    exportMarkdownNotesFolder: (workspaceId) =>
      invokeIpc(IPC_CHANNELS.markdown.exportFolder, workspaceId),
    importMarkdownNotesFolder: (workspaceId) =>
      invokeIpc(IPC_CHANNELS.markdown.importFolder, workspaceId),
    cancelMarkdownNotesImport: () => invokeIpc(IPC_CHANNELS.markdown.cancelImport),
  };
}
