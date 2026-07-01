export interface PinnedBranchSummary {
  messageId: string;
  chatId: string;
  chatTitle: string;
  workspaceId: string;
  role: "system" | "user" | "assistant";
  textPreview: string;
  model: string | null;
  provider: string | null;
  createdAt: number;
  pinnedAt: number;
}
