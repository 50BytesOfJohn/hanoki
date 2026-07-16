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

      if (!promptActionsInput) {
        return current;
      }

      const model = promptActionsInput.model ?? current.promptActions.model;
      if (promptActionsInput.model) {
        validateSumiModelReference(promptActionsInput.model);
      }

      const enabled = promptActionsInput.enabled ?? current.promptActions.enabled;
      if (enabled && !model) {
        throw AppError.badRequest("Select a model before enabling Sumi prompt actions.");
      }

      updateConfig({
        sumi: {
          promptActions: {
            initialized: true,
            enabled,
            ...(model
              ? {
                  providerId: model.providerId,
                  providerModelId: model.providerModelId,
                }
              : {}),
          },
        },
      });

      return {
        promptActions: {
          enabled,
          model,
        },
      };
    },
  };
}

export function readSumiSettings(): SumiSettings {
  let promptActionsConfig = getConfig().sumi.promptActions;

  if (!promptActionsConfig.initialized) {
    const openRouterProvider = listProviders().find(
      (provider) => provider.catalogId === "openrouter",
    );
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

  const model = readSumiModelReference(
    promptActionsConfig.providerId,
    promptActionsConfig.providerModelId,
  );

  return {
    promptActions: {
      enabled: promptActionsConfig.enabled && model !== null,
      model,
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
