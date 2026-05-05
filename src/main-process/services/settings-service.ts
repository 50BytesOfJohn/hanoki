import { DEFAULT_CONFIG } from "../config/defaults";
import { getConfig, updateConfig } from "../config";
import type {
  ChatFormSubmitBehavior,
  GlobalChatSettings,
  GlobalChatSettingsUpdateInput,
} from "@shared/ipc";

const CHAT_FORM_SUBMIT_BEHAVIORS: readonly ChatFormSubmitBehavior[] = ["enter", "mod-enter"];
const DEFAULT_PROMPT_STICKY_POSITION = DEFAULT_CONFIG.chat.prompt.stickyPosition;
const DEFAULT_FORM_SUBMIT_BEHAVIOR = DEFAULT_CONFIG.chat.form.submitBehavior;

export interface SettingsService {
  getGlobalChatSettings(): GlobalChatSettings;
  updateGlobalChatSettings(input: GlobalChatSettingsUpdateInput): GlobalChatSettings;
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
