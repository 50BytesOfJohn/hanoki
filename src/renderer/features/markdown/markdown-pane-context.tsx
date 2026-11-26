import * as React from "react";

export const MARKDOWN_MODES = {
  preview: { label: "Preview", description: "Formatted and read only" },
  "rich-text": { label: "Rich text", description: "Edit formatted content" },
  source: { label: "Markdown", description: "Edit Markdown source" },
} as const;

export type MarkdownMode = keyof typeof MARKDOWN_MODES;
export const MARKDOWN_MODE_IDS: readonly MarkdownMode[] = ["preview", "rich-text", "source"];

export function isMarkdownMode(value: string): value is MarkdownMode {
  return value in MARKDOWN_MODES;
}

interface MarkdownPaneContextValue {
  mode: MarkdownMode;
  setMode: (mode: MarkdownMode) => void;
}

const MarkdownPaneContext = React.createContext<MarkdownPaneContextValue | null>(null);

export function MarkdownPaneProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<MarkdownMode>("rich-text");
  const value = React.useMemo(() => ({ mode, setMode }), [mode]);
  return <MarkdownPaneContext.Provider value={value}>{children}</MarkdownPaneContext.Provider>;
}

export function useMarkdownPane(): MarkdownPaneContextValue {
  const context = React.useContext(MarkdownPaneContext);
  if (!context) throw new Error("useMarkdownPane must be used inside MarkdownPaneProvider.");
  return context;
}
