import {
  ComputerTerminal01Icon,
  FileScriptIcon,
  FlowConnectionIcon,
  MessagesSquare,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { ItemType } from "@shared/ipc";

export const ITEM_TYPE_ICONS: Record<ItemType, IconSvgElement> = {
  chat: MessagesSquare,
  terminal: ComputerTerminal01Icon,
  markdown: FileScriptIcon,
  workflow: FlowConnectionIcon,
};
