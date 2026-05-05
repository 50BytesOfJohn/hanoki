import type { ChatFormSubmitBehavior } from "@shared/ipc";

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
  };
}
