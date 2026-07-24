import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import { TextContextMenu } from "@/components/text-context-menu";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { useWorkspaceStore } from "@/features/workspace/store";
import { useOptionalChatPane } from "./chat-pane-context";

export function MessageContextMenu({
  children,
  messageId,
}: {
  children: React.ReactElement;
  messageId: string;
}) {
  const navigate = useNavigate();
  const pane = useOptionalChatPane();
  const setPaneView = useWorkspaceStore((state) => state.setPaneView);

  return (
    <TextContextMenu
      forceOpen
      extraItems={
        <ContextMenuItem
          onClick={() => {
            if (pane) {
              setPaneView(pane.tabId, pane.paneId, "/chat/graph", messageId);
              void navigate({ to: "/chat" });
              return;
            }
            void navigate({
              search: (previous) => ({ ...previous, graphMessageId: messageId }),
              to: "/chat/graph",
            });
          }}
        >
          Show in Graph
        </ContextMenuItem>
      }
    >
      {children}
    </TextContextMenu>
  );
}
