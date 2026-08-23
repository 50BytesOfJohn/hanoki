import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type MarkdownApi = Pick<IpcApi, "createMarkdown" | "queueMarkdownContent" | "flushMarkdownContent">;

export function createMarkdownApi(): MarkdownApi {
  return {
    createMarkdown: (workspaceId, title, folderId) =>
      invokeIpc(IPC_CHANNELS.markdown.create, workspaceId, title, folderId),
    queueMarkdownContent: (id, markdown) =>
      invokeIpc(IPC_CHANNELS.markdown.queueContent, id, markdown),
    flushMarkdownContent: (id) => invokeIpc(IPC_CHANNELS.markdown.flushContent, id),
  };
}
