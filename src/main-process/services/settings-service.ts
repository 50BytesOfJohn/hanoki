import { DEFAULT_CONFIG } from "../config/defaults";
import { getConfig, updateConfig } from "../config";
import type {
  ChatFormSubmitBehavior,
  GlobalChatSettings,
  GlobalChatSettingsUpdateInput,
  SumiModelReference,
  SumiSettings,
  SumiSettingsUpdateInput,
} from "@shared/ipc";
import { listProviders } from "../providers/repository";
import { getModelById } from "../models/repository";
import { AppError } from "../ipc/core/errors";

const CHAT_FORM_SUBMIT_BEHAVIORS: readonly ChatFormSubmitBehavior[] = ["enter", "mod-enter"];
const DEFAULT_PROMPT_STICKY_POSITION = DEFAULT_CONFIG.chat.prompt.stickyPosition;
const DEFAULT_FORM_SUBMIT_BEHAVIOR = DEFAULT_CONFIG.chat.form.submitBehavior;
const DEFAULT_SUMI_OPENROUTER_MODEL_ID = "~anthropic/claude-haiku-latest";

export interface SettingsService {
  getGlobalChatSettings(): GlobalChatSettings;
  updateGlobalChatSettings(input: GlobalChatSettingsUpdateInput): GlobalChatSettings;
  getSumiSettings(): SumiSettings;
  updateSumiSettings(input: SumiSettingsUpdateInput): SumiSettings;
}

export function createSettingsService(): SettingsService {
  return {
    getGlobalChatSettings() {
      return readGlobalChatSettings();
    },
    updateGlobalChatSettings(input) {
      const current = readGlobalChatSettings();
      const next: GlobalChatSettings = {
        promptStickyPosition: input.promptStickyPosition ?? current.promptStickyPosition,
        formSubmitBehavior: input.formSubmitBehavior ?? current.formSubmitBehavior,
      };

      updateConfig({
        chat: {
          prompt: {
            stickyPosition: next.promptStickyPosition,
          },
          form: {
            submitBehavior: next.formSubmitBehavior,
          },
        },
      });

      return next;
    },
    getSumiSettings() {
      return readSumiSettings();
    },
    updateSumiSettings(input) {
      const current = readSumiSettings();
      const promptActionsInput = input.promptActions;
      const model = promptActionsInput?.model ?? current.promptActions.model;
      if (promptActionsInput?.model) {
        validateSumiModelReference(promptActionsInput.model);
      }

      const promptActionsEnabled = promptActionsInput?.enabled ?? current.promptActions.enabled;
      if (promptActionsEnabled && !model) {
        throw AppError.badRequest("Select a model before enabling Sumi prompt actions.");
      }

      const titleGenerationInput = input.titleGeneration;
      const titleGenerationModel = titleGenerationInput?.model ?? current.titleGeneration.model;
      if (titleGenerationInput?.model) {
        validateSumiModelReference(titleGenerationInput.model);
      }

      const titleGenerationEnabled =
        titleGenerationInput?.enabled ?? current.titleGeneration.enabled;
      if (titleGenerationEnabled && !titleGenerationModel) {
        throw AppError.badRequest("Select a model before enabling Sumi title generation.");
      }

      const autoGenerate =
        titleGenerationInput?.autoGenerate ?? current.titleGeneration.autoGenerate;

      updateConfig({
        sumi: {
          promptActions: {
            initialized: true,
            enabled: promptActionsEnabled,
            ...(model
              ? {
                  providerId: model.providerId,
                  providerModelId: model.providerModelId,
                }
              : {}),
          },
          titleGeneration: {
            initialized: true,
            enabled: titleGenerationEnabled,
            autoGenerate,
            ...(titleGenerationModel
              ? {
                  providerId: titleGenerationModel.providerId,
                  providerModelId: titleGenerationModel.providerModelId,
                }
              : {}),
          },
        },
      });

      return {
        promptActions: {
          enabled: promptActionsEnabled,
          model,
        },
        titleGeneration: {
          enabled: titleGenerationEnabled,
          autoGenerate,
          model: titleGenerationModel,
        },
      };
    },
  };
}

export function readSumiSettings(): SumiSettings {
  let promptActionsConfig = getConfig().sumi.promptActions;
  let titleGenerationConfig = getConfig().sumi.titleGeneration;
  const openRouterProvider = listProviders().find(
    (provider) => provider.catalogId === "openrouter",
  );

  if (!promptActionsConfig.initialized) {
    const initialFeatureConfig = openRouterProvider
      ? {
          initialized: true,
          enabled: true,
          providerId: openRouterProvider.id,
          providerModelId: DEFAULT_SUMI_OPENROUTER_MODEL_ID,
        }
      : {
          initialized: true,
          enabled: false,
        };

    updateConfig({
      sumi: {
        promptActions: initialFeatureConfig,
      },
    });
    promptActionsConfig = getConfig().sumi.promptActions;
  }

  if (!titleGenerationConfig.initialized) {
    const initialFeatureConfig = openRouterProvider
      ? {
          initialized: true,
          enabled: true,
          autoGenerate: false,
          providerId: openRouterProvider.id,
          providerModelId: DEFAULT_SUMI_OPENROUTER_MODEL_ID,
        }
      : {
          initialized: true,
          enabled: false,
          autoGenerate: false,
        };

    updateConfig({
      sumi: {
        titleGeneration: initialFeatureConfig,
      },
    });
    titleGenerationConfig = getConfig().sumi.titleGeneration;
  }

  const promptActionsModel = readSumiModelReference(
    promptActionsConfig.providerId,
    promptActionsConfig.providerModelId,
  );
  const titleGenerationModel = readSumiModelReference(
    titleGenerationConfig.providerId,
    titleGenerationConfig.providerModelId,
  );

  return {
    promptActions: {
      enabled: promptActionsConfig.enabled && promptActionsModel !== null,
      model: promptActionsModel,
    },
    titleGeneration: {
      enabled: titleGenerationConfig.enabled && titleGenerationModel !== null,
      autoGenerate: titleGenerationConfig.autoGenerate,
      model: titleGenerationModel,
    },
  };
}

function readGlobalChatSettings(): GlobalChatSettings {
  const config = getConfig();

  return {
    promptStickyPosition:
      typeof config.chat.prompt.stickyPosition === "boolean"
        ? config.chat.prompt.stickyPosition
        : DEFAULT_PROMPT_STICKY_POSITION,
    formSubmitBehavior: resolveChatFormSubmitBehavior(config.chat.form.submitBehavior),
  };
}

function resolveChatFormSubmitBehavior(rawValue: unknown): ChatFormSubmitBehavior {
  if (
    typeof rawValue === "string" &&
    CHAT_FORM_SUBMIT_BEHAVIORS.includes(rawValue as ChatFormSubmitBehavior)
  ) {
    return rawValue as ChatFormSubmitBehavior;
  }

  return DEFAULT_FORM_SUBMIT_BEHAVIOR;
}

function readSumiModelReference(
  providerId: unknown,
  providerModelId: unknown,
): SumiModelReference | null {
  if (
    typeof providerId !== "string" ||
    providerId.trim().length === 0 ||
    typeof providerModelId !== "string" ||
    providerModelId.trim().length === 0
  ) {
    return null;
  }

  return {
    providerId: providerId.trim(),
    providerModelId: providerModelId.trim(),
  };
}

function validateSumiModelReference(model: SumiModelReference): void {
  const storedModel = getModelById(`${model.providerId}:${model.providerModelId}`);
  if (!storedModel || storedModel.lifecycleStatus !== "active") {
    throw AppError.badRequest("The selected model is unavailable.");
  }
}
