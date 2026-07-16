import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Chat01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { chatTreeApi } from "@/api/chat-tree";
import { queryKeys } from "@/queries/keys";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

import type { ChatInfo, ChatTreeFolderNode, ChatTreeSnapshot } from "@shared/ipc";

interface SearchableChat {
  chat: ChatInfo;
  folderPath: string | null;
}

function flattenSnapshot(snapshot: ChatTreeSnapshot): SearchableChat[] {
  const result: SearchableChat[] = [];

  const walk = (folders: ChatTreeFolderNode[], chats: ChatInfo[], path: string | null) => {
    for (const chat of chats) {
      result.push({ chat, folderPath: path });
    }
    for (const folder of folders) {
      walk(folder.folders, folder.chats, path ? `${path} / ${folder.name}` : folder.name);
    }
  };

  walk(snapshot.rootFolders, snapshot.rootChats, null);
  return result;
}

export function ChatSearchDialog({
  workspaceId,
  open,
  onOpenChange,
  onSelectChat,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectChat: (chatId: string) => void;
}) {
  const { data: chats = [], isPending } = useQuery({
    queryKey: queryKeys.chatTree.snapshot(workspaceId),
    queryFn: async () => flattenSnapshot(await chatTreeApi.getTree(workspaceId)),
    enabled: open,
  });

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search chats"
      description="Search all chats in this workspace"
      className="sm:max-w-md"
    >
      <Command>
        <CommandInput autoFocus placeholder="Search chats…" />
        <CommandList>
          <CommandEmpty>{isPending ? "Loading chats…" : "No matching chats."}</CommandEmpty>
          <CommandGroup>
            {chats.map(({ chat, folderPath }) => (
              <CommandItem
                key={chat.id}
                value={`${chat.title} ${folderPath ?? ""} ${chat.id}`}
                onSelect={() => {
                  onSelectChat(chat.id);
                  onOpenChange(false);
                }}
              >
                <HugeiconsIcon
                  icon={Chat01Icon}
                  className="size-3.5! shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                {folderPath ? (
                  <CommandShortcut className="max-w-[40%] truncate tracking-normal">
                    {folderPath}
                  </CommandShortcut>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
