import * as React from "react";
import { getToolOrDynamicToolName, isToolUIPart } from "ai";
import type { ChatInfo, ChatSettingsUpdateInput } from "@shared/ipc";
import { normalizeAllowedTools, type ApprovalToolName } from "@shared/chat/tool-approval";

import { useUpdateChatSettings } from "@/mutations/chats";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";
import {
  useChatGetMessages,
  useChatId,
  useChatRespondToToolApproval,
} from "@/features/chat/chat-context";

/**
 * Chat-wide approval choices. Each one persists first and answers the waiting
 * cards second: the last answer resumes the generation, and the server reads
 * the saved choice for every tool call that follows.
 */
export function useToolApprovalActions() {
  const chatId = useChatId();
  const getMessages = useChatGetMessages();
  const respondToToolApproval = useChatRespondToToolApproval();
  const updateChatSettings = useUpdateChatSettings();

  // Only the trailing assistant message can hold unanswered approvals.
  const approvePending = React.useCallback(
    (matches: (toolName: string) => boolean) => {
      const last = getMessages().at(-1);
      if (last?.role !== "assistant") return;
      for (const part of last.parts) {
        if (
          isToolUIPart(part) &&
          part.state === "approval-requested" &&
          !part.approval.isAutomatic &&
          matches(getToolOrDynamicToolName(part))
        ) {
          respondToToolApproval({ id: part.approval.id, approved: true });
        }
      }
    },
    [getMessages, respondToToolApproval],
  );

  const save = React.useCallback(
    (input: ChatSettingsUpdateInput, onSettled?: () => void) => {
      updateChatSettings.mutate({ id: chatId, input }, { onSettled });
    },
    [chatId, updateChatSettings],
  );

  const allowToolForChat = React.useCallback(
    (toolName: ApprovalToolName) => {
      const current =
        queryClient.getQueryData<ChatInfo>(queryKeys.chats.byId(chatId))?.data.settings
          .allowedTools ?? [];
      save({ allowedTools: normalizeAllowedTools([...current, toolName]) }, () =>
        approvePending((name) => name === toolName),
      );
    },
    [approvePending, chatId, save],
  );

  const allowAllForChat = React.useCallback(() => {
    save({ toolApprovalMode: "allow-all" }, () => approvePending(() => true));
  }, [approvePending, save]);

  const askBeforeActions = React.useCallback(() => {
    save({ toolApprovalMode: "ask" });
  }, [save]);

  const forgetAllowedTools = React.useCallback(() => {
    save({ allowedTools: [] });
  }, [save]);

  return {
    allowToolForChat,
    allowAllForChat,
    askBeforeActions,
    forgetAllowedTools,
    isSaving: updateChatSettings.isPending,
  };
}
