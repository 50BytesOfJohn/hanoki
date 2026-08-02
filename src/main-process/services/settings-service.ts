import { statSync } from "node:fs";
import { DEFAULT_CONFIG } from "../config/defaults";
import { getConfig, updateConfig } from "../config";
import {
  TERMINAL_TOOL_MODES,
  type ChatFormSubmitBehavior,
  type ChatSidebarViewMode,
  type ChatTabsPosition,
  type GlobalChatSettings,
  type GlobalChatSettingsUpdateInput,
  type SumiModelReference,
  type SumiSettings,
  type SumiSettingsUpdateInput,
  type TerminalToolMode,
  type TerminalToolSettings,
  type TerminalToolSettingsUpdateInput,
  type ToolSettings,
} from "@shared/ipc";
import {
  getDefaultWorkingDirectory,
  getShellDisplayName,
} from "../server/assistant/terminal-tools";
import { listProviders } from "../providers/repository";
import { getModelById } from "../models/repository";
import { AppError } from "../ipc/core/errors";

const CHAT_FORM_SUBMIT_BEHAVIORS: readonly ChatFormSubmitBehavior[] = ["enter", "mod-enter"];
const CHAT_SIDEBAR_VIEW_MODES: readonly ChatSidebarViewMode[] = ["tree", "activity"];
const CHAT_TABS_POSITIONS: readonly ChatTabsPosition[] = ["top", "sidebar"];
const DEFAULT_PROMPT_STICKY_POSITION = DEFAULT_CONFIG.chat.prompt.stickyPosition;
const DEFAULT_FORM_SUBMIT_BEHAVIOR = DEFAULT_CONFIG.chat.form.submitBehavior;
const DEFAULT_SIDEBAR_VIEW_MODE = DEFAULT_CONFIG.chat.sidebar.viewMode;
const DEFAULT_TABS_POSITION = DEFAULT_CONFIG.chat.tabs.position;
const DEFAULT_ACTIVITY_PANEL_ENABLED = DEFAULT_CONFIG.chat.activityPanel.enabled;
const DEFAULT_SUMI_OPENROUTER_MODEL_ID = "~anthropic/claude-haiku-latest";

export interface SettingsService {
  getGlobalChatSettings(): GlobalChatSettings;
  updateGlobalChatSettings(input: GlobalChatSettingsUpdateInput): GlobalChatSettings;
  getSumiSettings(): SumiSettings;
  updateSumiSettings(input: SumiSettingsUpdateInput): SumiSettings;
  getToolSettings(): ToolSettings;
  updateTerminalToolSettings(input: TerminalToolSettingsUpdateInput): TerminalToolSettings;
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
        sidebarViewMode: input.sidebarViewMode ?? current.sidebarViewMode,
        tabsPosition: input.tabsPosition ?? current.tabsPosition,
        activityPanelEnabled: input.activityPanelEnabled ?? current.activityPanelEnabled,
      };

      updateConfig({
        chat: {
          prompt: {
            stickyPosition: next.promptStickyPosition,
          },
          form: {
            submitBehavior: next.formSubmitBehavior,
          },
          sidebar: {
            viewMode: next.sidebarViewMode,
          },
          tabs: {
            position: next.tabsPosition,
          },
          activityPanel: {
            enabled: next.activityPanelEnabled,
          },
        },
      });

      return next;
    },
    getToolSettings() {
      return { terminal: readTerminalToolSettings() };
    },
    updateTerminalToolSettings(input) {
      const current = readTerminalToolSettings();
      const mode = input.mode ?? current.mode;
      if (!TERMINAL_TOOL_MODES.includes(mode)) {
        throw AppError.badRequest(`Unsupported terminal tool mode "${mode}".`);
      }

      let workingDirectory = current.workingDirectory;
      if (input.workingDirectory !== undefined) {
        const candidate = input.workingDirectory.trim();
        if (!candidate) {
          throw AppError.badRequest("The working folder cannot be empty.");
        }
        if (!isExistingDirectory(candidate)) {
          throw AppError.badRequest(`"${candidate}" is not a folder that exists.`);
        }
        workingDirectory = candidate;
      }

      updateConfig({ tools: { terminal: { mode, workingDirectory } } });

      return { mode, workingDirectory, shell: getShellDisplayName() };
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

function isExistingDirectory(candidatePath: string): boolean {
  try {
    return statSync(candidatePath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Reads terminal tool settings, falling back to the home folder when the
 * configured directory has been renamed or deleted since it was chosen.
 */
export function readTerminalToolSettings(): TerminalToolSettings {
  const config = getConfig().tools?.terminal;
  const mode: TerminalToolMode =
    typeof config?.mode === "string" && TERMINAL_TOOL_MODES.includes(config.mode)
      ? config.mode
      : DEFAULT_CONFIG.tools.terminal.mode;
  const configured = config?.workingDirectory?.trim();

  return {
    mode,
    workingDirectory:
      configured && isExistingDirectory(configured) ? configured : getDefaultWorkingDirectory(),
    shell: getShellDisplayName(),
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
    sidebarViewMode: resolveChatSidebarViewMode(config.chat.sidebar?.viewMode),
    tabsPosition: resolveChatTabsPosition(config.chat.tabs?.position),
    activityPanelEnabled:
      typeof config.chat.activityPanel?.enabled === "boolean"
        ? config.chat.activityPanel.enabled
        : DEFAULT_ACTIVITY_PANEL_ENABLED,
  };
}

function resolveChatTabsPosition(rawValue: unknown): ChatTabsPosition {
  if (typeof rawValue === "string" && CHAT_TABS_POSITIONS.includes(rawValue as ChatTabsPosition)) {
    return rawValue as ChatTabsPosition;
  }

  return DEFAULT_TABS_POSITION;
}

function resolveChatSidebarViewMode(rawValue: unknown): ChatSidebarViewMode {
  if (
    typeof rawValue === "string" &&
    CHAT_SIDEBAR_VIEW_MODES.includes(rawValue as ChatSidebarViewMode)
  ) {
    return rawValue as ChatSidebarViewMode;
  }

  return DEFAULT_SIDEBAR_VIEW_MODE;
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
