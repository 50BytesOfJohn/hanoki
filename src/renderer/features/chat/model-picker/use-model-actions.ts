import * as React from "react";
import type { ProviderModelInfo } from "@shared/ipc";
import type { ReasoningEffort } from "@shared/models/reasoning";

import { toastManager } from "@/components/ui/toast";
import { useRemoveRecentModel, useUpdateModel } from "@/mutations/models";

import { getModelLabel, isModelPinned } from "./model-picker-data";

export function useModelActions() {
  const { mutate: updateModel } = useUpdateModel();
  const { mutate: removeRecent } = useRemoveRecentModel();

  const setEnabled = React.useCallback(
    (model: ProviderModelInfo, isEnabled: boolean) => {
      updateModel({ providerId: model.providerId, modelId: model.id, input: { isEnabled } });
    },
    [updateModel],
  );

  const togglePinned = React.useCallback(
    (model: ProviderModelInfo) => {
      updateModel({
        providerId: model.providerId,
        modelId: model.id,
        input: { isPinned: !isModelPinned(model) },
      });
    },
    [updateModel],
  );

  /** Takes a model out of the picker, with an undo for the slip of a shortcut. */
  const hide = React.useCallback(
    (model: ProviderModelInfo) => {
      setEnabled(model, false);
      toastManager.add({
        title: `${getModelLabel(model)} hidden`,
        actionProps: {
          children: "Undo",
          onClick: () => setEnabled(model, true),
        },
      });
    },
    [setEnabled],
  );

  /** The level the model starts with the next time it is picked. */
  const rememberEffort = React.useCallback(
    (model: ProviderModelInfo, effort: ReasoningEffort | null) => {
      if (model.rememberedEffort === effort) return;
      updateModel({
        providerId: model.providerId,
        modelId: model.id,
        input: { rememberedEffort: effort },
      });
    },
    [updateModel],
  );

  const forgetRecent = React.useCallback(
    (model: ProviderModelInfo, reasoningEffort: ReasoningEffort | null) => {
      removeRecent({ modelId: model.id, reasoningEffort });
    },
    [removeRecent],
  );

  return { setEnabled, togglePinned, hide, rememberEffort, forgetRecent };
}
