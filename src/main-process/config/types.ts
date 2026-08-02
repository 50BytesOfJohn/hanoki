import type {
  ChatFormSubmitBehavior,
  ChatSidebarViewMode,
  ChatTabsPosition,
  TerminalToolMode,
} from "@shared/ipc";

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export type Theme = "dark";

export interface PersistedWindowState {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isMaximized?: boolean;
}

export interface AppConfig {
  app: {
    theme: Theme;
    activeWorkspaceId: string;
  };
  window?: {
    main?: PersistedWindowState;
    [windowId: string]: PersistedWindowState | undefined;
  };
  chat: {
    message: {
      fontSize: number;
    };
    prompt: {
      stickyPosition: boolean;
    };
    form: {
      submitBehavior: ChatFormSubmitBehavior;
    };
    sidebar: {
      viewMode: ChatSidebarViewMode;
    };
    tabs: {
      position: ChatTabsPosition;
    };
    activityPanel: {
      enabled: boolean;
    };
  };
  tools: {
    terminal: {
      mode: TerminalToolMode;
      /** Absolute path; empty means "use the home folder". */
      workingDirectory?: string;
    };
  };
  sumi: {
    promptActions: {
      initialized: boolean;
      enabled: boolean;
      providerId?: string;
      providerModelId?: string;
    };
    titleGeneration: {
      initialized: boolean;
      enabled: boolean;
      autoGenerate: boolean;
      providerId?: string;
      providerModelId?: string;
    };
  };
}
