import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProviderModelInfo } from "@shared/ipc";
import { resolveReasoningEffortForModel, type ReasoningEffort } from "@shared/models/reasoning";

import { useChatId, useChatModelId, useSetChatModelId } from "@/features/chat/chat-context";
import { useUpdateChatSettings } from "@/mutations/chats";
import { useUpdateModel } from "@/mutations/models";
import { getChatQueryOptions } from "@/queries/chats";
import { listEnabledModelsQueryOptions } from "@/queries/models";

export interface ChatModelSelection {
  model: ProviderModelInfo | null;
  /** What the next request sends; null is the provider default. */
  effort: ReasoningEffort | null;
  /** The effort a model would start with if it were picked now. */
  getEffortFor: (model: ProviderModelInfo) => ReasoningEffort | null;
  /** Switches the chat to `model`; without `effort` it uses `getEffortFor(model)`. */
  selectModel: (model: ProviderModelInfo, effort?: ReasoningEffort | null) => void;
  setEffort: (effort: ReasoningEffort | null) => void;
}

/**
 * Model and effort travel together: picking a model restores the effort last
 * used with it (remembered app-wide on the model), or carries the current
 * effort over to a model that has none yet. Each chat keeps its own pair.
 */
export function useChatModelSelection(): ChatModelSelection {
  const chatId = useChatId();
  const modelId = useChatModelId();
  const setModelId = useSetChatModelId();
  const { data: chat } = useQuery(getChatQueryOptions(chatId));
  const { data: models = [] } = useQuery(listEnabledModelsQueryOptions);
  const updateChatSettings = useUpdateChatSettings();
  const updateModel = useUpdateModel();

  const model = models.find((candidate) => candidate.id === modelId) ?? null;
  const savedEffort = chat?.data.settings.modelConfig?.reasoningEffort ?? null;
  // Mirrors the server, which drops a saved level the model does not offer.
  const effort = savedEffort && model?.reasoningEfforts?.includes(savedEffort) ? savedEffort : null;

  const getEffortFor = React.useCallback(
    (candidate: ProviderModelInfo) =>
      candidate.id === model?.id
        ? effort
        : resolveReasoningEffortForModel({
            offered: candidate.reasoningEfforts ?? [],
            remembered: candidate.rememberedEffort,
            // The raw setting, so a hop through a model that does not reason keeps it.
            carried: savedEffort,
          }),
    [effort, model?.id, savedEffort],
  );

  const { mutate: mutateChatSettings } = updateChatSettings;
  const { mutate: mutateModel } = updateModel;

  const selectModel = React.useCallback(
    (
      candidate: ProviderModelInfo,
      nextEffort: ReasoningEffort | null = getEffortFor(candidate),
    ) => {
      const offersEffort = (candidate.reasoningEfforts?.length ?? 0) > 0;

      if (candidate.id === modelId && nextEffort === effort) {
        return;
      }

      setModelId(candidate.id);
      mutateChatSettings(
        {
          id: chatId,
          input: {
            modelId: candidate.id,
            ...(offersEffort ? { modelConfig: { reasoningEffort: nextEffort } } : {}),
          },
        },
        { onError: () => setModelId(modelId) },
      );

      if (offersEffort && candidate.rememberedEffort !== nextEffort) {
        mutateModel({
          providerId: candidate.providerId,
          modelId: candidate.id,
          input: { rememberedEffort: nextEffort },
        });
      }
    },
    [chatId, effort, getEffortFor, modelId, mutateChatSettings, mutateModel, setModelId],
  );

  const setEffort = React.useCallback(
    (nextEffort: ReasoningEffort | null) => {
      if (model) {
        selectModel(model, nextEffort);
      }
    },
    [model, selectModel],
  );

  return { model, effort, getEffortFor, selectModel, setEffort };
}
