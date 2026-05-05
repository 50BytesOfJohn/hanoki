import type { AppConfig } from "./types";

export const DEFAULT_CONFIG: AppConfig = {
  app: {
    theme: "dark",
    activeWorkspaceId: "default",
  },
  chat: {
    message: {
      fontSize: 14,
    },
    prompt: {
      stickyPosition: true,
    },
    form: {
      submitBehavior: "enter",
    },
  },
};
