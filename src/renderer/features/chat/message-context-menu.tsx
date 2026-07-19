import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import { TextContextMenu } from "@/components/text-context-menu";
import { ContextMenuItem } from "@/components/ui/context-menu";

export function MessageContextMenu({
  children,
  messageId,
}: {
  children: React.ReactElement;
  messageId: string;
}) {
  const navigate = useNavigate();

  return (
    <TextContextMenu
      forceOpen
      extraItems={
        <ContextMenuItem
          onClick={() => {
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
