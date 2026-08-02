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
    sidebar: {
      viewMode: "tree",
    },
    tabs: {
      position: "top",
    },
    activityPanel: {
      enabled: true,
    },
  },
  tools: {
    terminal: {
      // Off until the user turns it on: this grants unsandboxed shell access.
      mode: "disabled",
    },
  },
  sumi: {
    promptActions: {
      initialized: false,
      enabled: false,
    },
    titleGeneration: {
      initialized: false,
      enabled: false,
      autoGenerate: false,
    },
  },
};
