import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GlobalChatSettings, GlobalChatSettingsUpdateInput } from "@shared/ipc";
import { settingsApi } from "../api/settings";
import { queryKeys } from "../queries/keys";

export function useUpdateGlobalChatSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GlobalChatSettingsUpdateInput) => settingsApi.updateGlobalChat(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings.globalChat(), exact: true });

      const previous = queryClient.getQueryData<GlobalChatSettings>(
        queryKeys.settings.globalChat(),
      );
      if (previous) {
        queryClient.setQueryData(queryKeys.settings.globalChat(), { ...previous, ...input });
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.settings.globalChat(), context.previous);
      }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.settings.globalChat(), next);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.settings.globalChat(),
        exact: true,
      });
    },
  });
}
