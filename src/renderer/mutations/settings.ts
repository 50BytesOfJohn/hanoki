import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GlobalChatSettings, GlobalChatSettingsUpdateInput } from "@shared/ipc";
import type { SumiSettings, SumiSettingsUpdateInput } from "@shared/ipc";
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

export function useUpdateSumiSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SumiSettingsUpdateInput) => settingsApi.updateSumi(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings.sumi(), exact: true });

      const previous = queryClient.getQueryData<SumiSettings>(queryKeys.settings.sumi());
      const promptActionsInput = input.promptActions;
      const titleGenerationInput = input.titleGeneration;
      if (previous && (promptActionsInput || titleGenerationInput)) {
        queryClient.setQueryData<SumiSettings>(queryKeys.settings.sumi(), {
          promptActions: {
            enabled: promptActionsInput?.enabled ?? previous.promptActions.enabled,
            model: promptActionsInput?.model ?? previous.promptActions.model,
          },
          titleGeneration: {
            enabled: titleGenerationInput?.enabled ?? previous.titleGeneration.enabled,
            autoGenerate:
              titleGenerationInput?.autoGenerate ?? previous.titleGeneration.autoGenerate,
            model: titleGenerationInput?.model ?? previous.titleGeneration.model,
          },
        });
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.settings.sumi(), context.previous);
      }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.settings.sumi(), next);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.settings.sumi(),
        exact: true,
      });
    },
  });
}
