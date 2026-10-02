import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MarkdownInfo } from "@shared/ipc";

import { formatNotesFolderExportSummary } from "@shared/markdown/folder-io";

import { markdownApi } from "../api/markdown";
import { toastManager } from "../components/ui/toast";
import { notifyChatTreeChanged } from "../features/items/item-title-events";
import { notesImportUi } from "../features/settings/notes-folder-import-dialog";
import { useWorkspaceStore } from "../features/workspace/store";
import { queryKeys } from "../queries/keys";
import type { NotesFolderImportResult } from "@shared/markdown/folder-io";

export function useCreateMarkdown() {
  const queryClient = useQueryClient();
  const openTab = useWorkspaceStore((state) => state.openTab);

  return useMutation({
    mutationFn: ({
      workspaceId,
      title,
      folderId,
    }: {
      workspaceId: string;
      title: string;
      folderId: string | null;
    }) => markdownApi.create(workspaceId, title, folderId),
    onSuccess: (item) => {
      queryClient.setQueryData(queryKeys.items.byId(item.id), item);
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
      openTab({ type: "markdown", itemId: item.id });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Markdown item could not be created",
        description: error.message,
      });
    },
  });
}

export function useFlushMarkdownContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) => markdownApi.flushContent(id),
    onSuccess: (item) => {
      queryClient.setQueryData<MarkdownInfo>(queryKeys.items.byId(item.id), (current) =>
        current ? { ...item, title: current.title } : item,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}

export function useExportMarkdownNotesFolder() {
  return useMutation({
    mutationFn: ({ workspaceId }: { workspaceId: string }) => markdownApi.exportFolder(workspaceId),
    onSuccess: (result) => {
      if (result.status !== "exported") return;
      const empty = result.noteCount === 0;
      toastManager.add({
        type: empty || result.skippedNonMarkdownCount > 0 ? "warning" : "success",
        title: empty ? "Nothing to export" : "Markdown notes exported",
        description: formatNotesFolderExportSummary(result),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Markdown notes could not be exported",
        description: error.message,
      });
    },
  });
}

export function applyImportedNotesResult(
  result: NotesFolderImportResult,
  workspaceId: string,
  refreshTree: (workspaceId: string) => void = notifyChatTreeChanged,
): void {
  if (result.status !== "imported") {
    notesImportUi.reset();
    return;
  }
  notesImportUi.finish(result);
  requestAnimationFrame(() => {
    refreshTree(workspaceId);
  });
}

export function useImportMarkdownNotesFolder() {
  return useMutation({
    mutationFn: ({ workspaceId }: { workspaceId: string }) => markdownApi.importFolder(workspaceId),
    onMutate: () => {
      notesImportUi.begin();
    },
    onSuccess: (result, { workspaceId }) => {
      applyImportedNotesResult(result, workspaceId);
    },
    onError: (error) => {
      notesImportUi.reset();
      toastManager.add({
        type: "error",
        title: "Markdown notes could not be imported",
        description: error.message,
      });
    },
  });
}
