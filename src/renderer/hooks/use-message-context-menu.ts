import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import { contextMenuApi } from "@/api/context-menu";
import { getTextContextMenuInput } from "./use-text-context-menu";

export function useMessageContextMenu(messageId: string): React.MouseEventHandler<HTMLElement> {
  const navigate = useNavigate();

  return React.useCallback(
    (event) => {
      const input = getTextContextMenuInput(event);
      if (!input) {
        return;
      }

      event.preventDefault();
      void contextMenuApi.showMessageContextMenu(input).then((action) => {
        if (action !== "show-in-graph") {
          return;
        }

        void navigate({
          search: (prev) => ({
            ...prev,
            graphMessageId: messageId,
          }),
          to: "/chat/graph",
        });
      });
    },
    [messageId, navigate],
  );
}
