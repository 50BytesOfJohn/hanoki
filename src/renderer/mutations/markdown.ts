import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MarkdownInfo } from "@shared/ipc";

import {
  formatNotesFolderExportSummary,
  formatNotesFolderImportSummary,
} from "@shared/markdown/folder-io";

import { markdownApi } from "../api/markdown";
import { toastManager } from "../components/ui/toast";
import { useWorkspaceStore } from "../features/workspace/store";
import { queryKeys } from "../queries/keys";

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
      queryClient.setQueryData<MarkdownInfo>(queryKeys.items.byId(item.id), item);
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
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

export function useImportMarkdownNotesFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId }: { workspaceId: string }) => markdownApi.importFolder(workspaceId),
    onSuccess: (result) => {
      if (result.status !== "imported") return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
      const hasSkips =
        result.skippedOversizedCount > 0 ||
        result.ignoredNonMarkdownCount > 0 ||
        result.ignoredDirectoryNames.length > 0 ||
        result.skippedCount > 0;
      toastManager.add({
        type: hasSkips ? "warning" : "success",
        title: "Markdown notes imported",
        description: formatNotesFolderImportSummary(result),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Markdown notes could not be imported",
        description: error.message,
      });
    },
  });
}
