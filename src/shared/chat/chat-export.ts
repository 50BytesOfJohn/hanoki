export const CHAT_EXPORT_FORMATS = [
  {
    id: "markdown",
    label: "Markdown",
    extension: "md",
  },
  {
    id: "json",
    label: "JSON",
    extension: "json",
  },
  {
    id: "pdf",
    label: "PDF",
    extension: "pdf",
  },
] as const;

export type ChatExportFormat = (typeof CHAT_EXPORT_FORMATS)[number]["id"];

export const DEFAULT_CHAT_EXPORT_FORMAT: ChatExportFormat = "markdown";

export type ChatExportResult = { status: "canceled" } | { status: "saved"; filePath: string };

export function isChatExportFormat(value: unknown): value is ChatExportFormat {
  return CHAT_EXPORT_FORMATS.some((format) => format.id === value);
}

export function getChatExportFormat(formatId: ChatExportFormat) {
  return CHAT_EXPORT_FORMATS.find((format) => format.id === formatId)!;
}
