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
      // Approve each call by default: this grants unsandboxed shell access.
      mode: "ask",
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
