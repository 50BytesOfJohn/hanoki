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
import {
  createTextControlGrammarTarget,
  isGrammarFixableTextControl,
  type TextControlElement,
} from "@/features/sumi/grammar-fix-text-control";
import {
  createTiptapGrammarTarget,
  getTiptapEditorFromElement,
} from "@/features/sumi/grammar-fix-tiptap";
import { useGrammarFix } from "@/features/sumi/use-grammar-fix";
import { isMac, modShortcut } from "@/lib/platform";
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

type GrammarFixElement = TextControlElement | HTMLElement;

interface GrammarFixScope {
  element: GrammarFixElement;
  hasText: boolean;
  selectionOnly: boolean;
}

interface TextContextMenuState {
  grammarFix: GrammarFixScope | null;
  hasSelection: boolean;
  isEditable: boolean;
  selectionText: string;
}

interface SelectionSnapshot {
  editingHost: HTMLElement | null;
  restore: () => void;
}

const EMPTY_MENU_STATE: TextContextMenuState = {
  grammarFix: null,
  hasSelection: false,
  isEditable: false,
  selectionText: "",
};

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

/** The outermost editable element, which is the one an editor listens on and can focus. */
function findContentEditableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  let editingHost: HTMLElement | null = null;
  let node: Element | null = target;
  while (node) {
    if (node instanceof HTMLElement && node.isContentEditable) {
      editingHost = node;
    }

    node = node.parentElement;
  }

  return editingHost;
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

/** Identifies the current selection, without regard to which element it's in. */
function readSelectionMarker(target: EventTarget | null): readonly unknown[] {
  const textControl = findTextControlElement(target);
  if (textControl) {
    return [textControl.selectionStart, textControl.selectionEnd];
  }

  const selection = window.getSelection();
  return [
    selection?.anchorNode,
    selection?.anchorOffset,
    selection?.focusNode,
    selection?.focusOffset,
  ];
}

/**
 * A right-click can select a word by itself, like a misspelled one, and that
 * shouldn't shrink the fix to one word. Only a selection that was already there
 * before the click, and still is, counts as the user's choice.
 */
function getGrammarFixScope(
  target: EventTarget | null,
  selectionBeforeClick: readonly unknown[] | null,
  hasSelection: boolean,
): GrammarFixScope | null {
  const selectionOnly =
    hasSelection &&
    (selectionBeforeClick === null ||
      readSelectionMarker(target).every((value, index) => value === selectionBeforeClick[index]));

  const textControl = findTextControlElement(target);
  if (textControl) {
    return isGrammarFixableTextControl(textControl)
      ? { element: textControl, hasText: textControl.value.trim().length > 0, selectionOnly }
      : null;
  }

  const editingHost = findContentEditableElement(target);
  return editingHost && getTiptapEditorFromElement(editingHost)
    ? {
        element: editingHost,
        hasText: (editingHost.textContent ?? "").trim().length > 0,
        selectionOnly,
      }
    : null;
}

function getTextContextMenuState(
  target: EventTarget | null,
  boundary: HTMLElement,
  selectionBeforeClick: readonly unknown[] | null,
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

  return {
    grammarFix: getGrammarFixScope(target, selectionBeforeClick, hasSelection),
    hasSelection,
    isEditable,
    selectionText,
  };
}

function captureSelection(target: EventTarget | null): SelectionSnapshot | null {
  const textControl = findTextControlElement(target);
  if (textControl) {
    const start = textControl.selectionStart;
    const end = textControl.selectionEnd;
    const direction = textControl.selectionDirection;

    return {
      editingHost: null,
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
    editingHost: contentEditable,
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

function createGrammarFixTarget({ element, selectionOnly }: GrammarFixScope) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return createTextControlGrammarTarget(element, selectionOnly);
  }
  const editor = getTiptapEditorFromElement(element);
  return editor ? createTiptapGrammarTarget(editor, selectionOnly) : null;
}

/**
 * Rich editors keep undo history themselves, and Chromium ignores its undo
 * command while its own stack is empty, as it is after a programmatic change.
 * Sending the input event an editor already listens for reaches its history
 * either way. Returns whether anything handled it.
 */
function dispatchHistoryInput(editingHost: HTMLElement, command: "undo" | "redo"): boolean {
  return !editingHost.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: command === "undo" ? "historyUndo" : "historyRedo",
    }),
  );
}

function GrammarFixMenuItem({
  scope,
  onFix,
}: {
  scope: GrammarFixScope;
  onFix: (fix: NonNullable<ReturnType<typeof useGrammarFix>>) => void;
}) {
  const fixGrammar = useGrammarFix();
  if (!fixGrammar) {
    return null;
  }

  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem disabled={!scope.hasText} onClick={() => onFix(fixGrammar)}>
          {scope.selectionOnly ? "Fix Grammar in Selection" : "Fix Grammar"}
        </ContextMenuItem>
      </ContextMenuGroup>
    </>
  );
}

function resolveCopyAllText(copyAllText: string | (() => string) | undefined): string {
  if (copyAllText == null) {
    return "";
  }
  return typeof copyAllText === "function" ? copyAllText() : copyAllText;
}

export function TextContextMenu({
  children,
  copyAllText,
  extraItems,
  forceOpen = false,
}: {
  children: React.ReactElement;
  /** When there is no selection, Copy uses this full text instead of staying disabled. */
  copyAllText?: string | (() => string);
  extraItems?: React.ReactNode;
  forceOpen?: boolean;
}) {
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const selectionSnapshotRef = React.useRef<SelectionSnapshot | null>(null);
  const selectionBeforeClickRef = React.useRef<readonly unknown[] | null>(null);
  const [menuState, setMenuState] = React.useState(EMPTY_MENU_STATE);

  const canCopyAll = copyAllText != null;
  const canCopy = menuState.hasSelection || canCopyAll;

  const execute = React.useCallback(
    (command: ContextMenuCommand) => {
      const selectionText = menuState.selectionText;
      window.setTimeout(() => {
        const snapshot = selectionSnapshotRef.current;
        snapshot?.restore();
        if (
          (command === "undo" || command === "redo") &&
          snapshot?.editingHost &&
          dispatchHistoryInput(snapshot.editingHost, command)
        ) {
          return;
        }
        void contextMenuApi.execute({ command, selectionText });
      }, 0);
    },
    [menuState.selectionText],
  );

  const handleFixGrammar = React.useCallback(
    (fixGrammar: NonNullable<ReturnType<typeof useGrammarFix>>) => {
      const scope = menuState.grammarFix;
      if (!scope) {
        return;
      }
      window.setTimeout(() => {
        selectionSnapshotRef.current?.restore();
        const target = createGrammarFixTarget(scope);
        if (target) {
          void fixGrammar(scope.element, target);
        }
      }, 0);
    },
    [menuState.grammarFix],
  );

  const handleCopy = React.useCallback(() => {
    if (menuState.hasSelection) {
      execute("copy");
      return;
    }

    const text = resolveCopyAllText(copyAllText);
    if (text.length > 0) {
      void navigator.clipboard.writeText(text);
    }
  }, [copyAllText, execute, menuState.hasSelection]);

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

        const nextState = getTextContextMenuState(
          details.event.target,
          boundary,
          selectionBeforeClickRef.current,
        );
        if (!nextState && !forceOpen) {
          details.cancel();
          return;
        }

        selectionSnapshotRef.current = captureSelection(details.event.target);
        setMenuState(nextState ?? EMPTY_MENU_STATE);
      }}
    >
      <ContextMenuTrigger
        ref={triggerRef}
        render={children}
        onPointerDownCapture={(event) => {
          // Right button, or Control-click on a Mac. Keyboard-opened menus skip this.
          selectionBeforeClickRef.current =
            event.button === 2 || event.ctrlKey ? readSelectionMarker(event.target) : null;
        }}
      />
      <ContextMenuContent className="w-56">
        {menuState.isEditable ? (
          <>
            <ContextMenuGroup>
              <ContextMenuItem onClick={() => execute("undo")}>
                Undo
                <ContextMenuShortcut>{modShortcut("Z")}</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => execute("redo")}>
                Redo
                <ContextMenuShortcut>{isMac ? "⇧⌘Z" : "Ctrl+Y"}</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem disabled={!menuState.hasSelection} onClick={() => execute("cut")}>
                Cut
                <ContextMenuShortcut>{modShortcut("X")}</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem disabled={!canCopy} onClick={handleCopy}>
                Copy
                <ContextMenuShortcut>{modShortcut("C")}</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => execute("paste")}>
                Paste
                <ContextMenuShortcut>{modShortcut("V")}</ContextMenuShortcut>
              </ContextMenuItem>
              {isMac ? (
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
                <ContextMenuShortcut>{modShortcut("A")}</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>
            {menuState.grammarFix ? (
              <GrammarFixMenuItem scope={menuState.grammarFix} onFix={handleFixGrammar} />
            ) : null}
          </>
        ) : (
          <ContextMenuGroup>
            <ContextMenuItem disabled={!canCopy} onClick={handleCopy}>
              {menuState.hasSelection ? "Copy" : "Copy as Text"}
              <ContextMenuShortcut>{modShortcut("C")}</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuGroup>
        )}

        {menuState.hasSelection ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              {isMac ? (
                <ContextMenuItem onClick={() => execute("look-up")}>Look Up</ContextMenuItem>
              ) : null}
              <ContextMenuItem onClick={() => execute("search-web")}>
                {isMac ? "Search with Google" : "Search the Web"}
              </ContextMenuItem>
            </ContextMenuGroup>
          </>
        ) : null}

        {extraItems ? (
          <>
            <ContextMenuSeparator />
            {extraItems}
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
