import { useMutation } from "@tanstack/react-query";

import { foldersApi } from "../api/folders";

export function useCreateFolder() {
  return useMutation({
    mutationFn: ({
      workspaceId,
      name,
      parentId,
    }: {
      workspaceId: string;
      name: string;
      parentId?: string | null;
    }) => foldersApi.create(workspaceId, name, parentId),
  });
}

export function useUpdateFolderName() {
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => foldersApi.updateName(id, name),
  });
}

export function useMoveFolder() {
  return useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      foldersApi.move(id, parentId),
  });
}

export function useDeleteFolder() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => foldersApi.delete(id),
  });
}
