import * as React from "react";

import { contextMenuApi } from "@/api/context-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ContextMenuCommand } from "@shared/ipc";

const TEXT_INPUT_TYPES = new Set([
  "",
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

const IS_MAC = navigator.platform.toLowerCase().includes("mac");

interface TextContextMenuState {
  hasSelection: boolean;
  isEditable: boolean;
  selectionText: string;
}

interface SelectionSnapshot {
  restore: () => void;
}

const EMPTY_MENU_STATE: TextContextMenuState = {
  hasSelection: false,
  isEditable: false,
  selectionText: "",
};

type TextControlElement = HTMLInputElement | HTMLTextAreaElement;

function isTextInputElement(target: Element): target is HTMLInputElement {
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type.toLowerCase());
}

function findTextControlElement(target: EventTarget | null): TextControlElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const input = target.closest("input");
  if (input && isTextInputElement(input)) {
    return input;
  }

  const textarea = target.closest("textarea");
  return textarea instanceof HTMLTextAreaElement ? textarea : null;
}

function findContentEditableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  let node: Element | null = target;
  while (node) {
    if (node instanceof HTMLElement && node.isContentEditable) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
}

function getTextControlSelection(textControl: TextControlElement | null): string {
  if (!textControl) {
    return "";
  }

  const selectionStart = textControl.selectionStart;
  const selectionEnd = textControl.selectionEnd;
  if (selectionStart === null || selectionEnd === null || selectionEnd <= selectionStart) {
    return "";
  }

  return textControl.value.slice(selectionStart, selectionEnd);
}

function getWindowSelectionWithin(boundary: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return "";
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode) {
    return "";
  }

  if (!boundary.contains(anchorNode) || !boundary.contains(focusNode)) {
    return "";
  }

  return selection.toString();
}

function getTextContextMenuState(
  target: EventTarget | null,
  boundary: HTMLElement,
): TextContextMenuState | null {
  const textControl = findTextControlElement(target);
  const contentEditable = findContentEditableElement(target);
  const isEditable = textControl
    ? !textControl.readOnly && !textControl.disabled
    : contentEditable !== null;
  const selectionText = getTextControlSelection(textControl) || getWindowSelectionWithin(boundary);
  const hasSelection = selectionText.trim().length > 0;

  if (!isEditable && !hasSelection) {
    return null;
  }

  return { hasSelection, isEditable, selectionText };
}

function captureSelection(target: EventTarget | null): SelectionSnapshot | null {
  const textControl = findTextControlElement(target);
  if (textControl) {
    const start = textControl.selectionStart;
    const end = textControl.selectionEnd;
    const direction = textControl.selectionDirection;

    return {
      restore: () => {
        textControl.focus({ preventScroll: true });
        if (start !== null && end !== null) {
          textControl.setSelectionRange(start, end, direction ?? undefined);
        }
      },
    };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const ranges = Array.from({ length: selection.rangeCount }, (_, index) =>
    selection.getRangeAt(index).cloneRange(),
  );
  const contentEditable = findContentEditableElement(target);

  return {
    restore: () => {
      contentEditable?.focus({ preventScroll: true });
      const currentSelection = window.getSelection();
      currentSelection?.removeAllRanges();
      for (const range of ranges) {
        currentSelection?.addRange(range);
      }
    },
  };
}

function shortcut(key: string): string {
  return IS_MAC ? `⌘${key}` : `Ctrl+${key}`;
}

export function TextContextMenu({
  children,
  extraItems,
  forceOpen = false,
}: {
  children: React.ReactElement;
  extraItems?: React.ReactNode;
  forceOpen?: boolean;
}) {
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const selectionSnapshotRef = React.useRef<SelectionSnapshot | null>(null);
  const [menuState, setMenuState] = React.useState(EMPTY_MENU_STATE);

  const execute = React.useCallback(
    (command: ContextMenuCommand) => {
      const selectionText = menuState.selectionText;
      window.setTimeout(() => {
        selectionSnapshotRef.current?.restore();
        void contextMenuApi.execute({ command, selectionText });
      }, 0);
    },
    [menuState.selectionText],
  );

  return (
    <ContextMenu
      onOpenChange={(open, details) => {
        if (!open) {
          return;
        }

        const boundary = triggerRef.current;
        if (!boundary) {
          details.cancel();
          return;
        }

        const nextState = getTextContextMenuState(details.event.target, boundary);
        if (!nextState && !forceOpen) {
          details.cancel();
          return;
        }

        selectionSnapshotRef.current = captureSelection(details.event.target);
        setMenuState(nextState ?? EMPTY_MENU_STATE);
      }}
    >
      <ContextMenuTrigger ref={triggerRef} render={children} />
      <ContextMenuContent className="w-56">
        {menuState.isEditable ? (
          <>
            <ContextMenuGroup>
              <ContextMenuItem onClick={() => execute("undo")}>
                Undo
                <ContextMenuShortcut>{shortcut("Z")}</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => execute("redo")}>
                Redo
                <ContextMenuShortcut>{IS_MAC ? "⇧⌘Z" : "Ctrl+Y"}</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem disabled={!menuState.hasSelection} onClick={() => execute("cut")}>
                Cut
                <ContextMenuShortcut>{shortcut("X")}</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem disabled={!menuState.hasSelection} onClick={() => execute("copy")}>
                Copy
                <ContextMenuShortcut>{shortcut("C")}</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => execute("paste")}>
                Paste
                <ContextMenuShortcut>{shortcut("V")}</ContextMenuShortcut>
              </ContextMenuItem>
              {IS_MAC ? (
                <ContextMenuItem onClick={() => execute("paste-and-match-style")}>
                  Paste and Match Style
                  <ContextMenuShortcut>⌥⇧⌘V</ContextMenuShortcut>
                </ContextMenuItem>
              ) : null}
              <ContextMenuItem disabled={!menuState.hasSelection} onClick={() => execute("delete")}>
                Delete
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem onClick={() => execute("select-all")}>
                Select All
                <ContextMenuShortcut>{shortcut("A")}</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>
          </>
        ) : (
          <ContextMenuGroup>
            <ContextMenuItem disabled={!menuState.hasSelection} onClick={() => execute("copy")}>
              Copy
              <ContextMenuShortcut>{shortcut("C")}</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuGroup>
        )}

        {menuState.hasSelection ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              {IS_MAC ? (
                <ContextMenuItem onClick={() => execute("look-up")}>Look Up</ContextMenuItem>
              ) : null}
              <ContextMenuItem onClick={() => execute("search-web")}>
                {IS_MAC ? "Search with Google" : "Search the Web"}
              </ContextMenuItem>
            </ContextMenuGroup>
          </>
        ) : null}

        {extraItems ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuGroup>{extraItems}</ContextMenuGroup>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
