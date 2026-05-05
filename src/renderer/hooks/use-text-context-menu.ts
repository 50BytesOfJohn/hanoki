import * as React from "react";
import { contextMenuApi } from "@/api/context-menu";
import type { TextContextMenuInput } from "@shared/ipc";

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
  if (textarea instanceof HTMLTextAreaElement) {
    return textarea;
  }

  return null;
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

function isEditableTextTarget(
  textControl: TextControlElement | null,
  contentEditable: HTMLElement | null,
): boolean {
  if (textControl) {
    return !textControl.readOnly && !textControl.disabled;
  }

  return contentEditable !== null;
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

function getWindowSelectionWithin(currentTarget: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return "";
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode) {
    return "";
  }

  if (!currentTarget.contains(anchorNode) || !currentTarget.contains(focusNode)) {
    return "";
  }

  return selection.toString();
}

export function getTextContextMenuInput(
  event: React.MouseEvent<HTMLElement>,
): TextContextMenuInput | null {
  const textControl = findTextControlElement(event.target);
  const contentEditable = findContentEditableElement(event.target);
  const isEditable = isEditableTextTarget(textControl, contentEditable);
  const selectionText =
    getTextControlSelection(textControl) || getWindowSelectionWithin(event.currentTarget);
  const hasSelection = selectionText.trim().length > 0;
  const hasTextContent = event.currentTarget.textContent?.trim().length;

  if (!isEditable && !hasSelection && !hasTextContent) {
    return null;
  }

  return {
    isEditable,
    hasSelection,
    selectionText,
  };
}

export function useTextContextMenu(): React.MouseEventHandler<HTMLElement> {
  return React.useCallback((event) => {
    const input = getTextContextMenuInput(event);
    if (!input) {
      return;
    }

    event.preventDefault();
    void contextMenuApi.showTextContextMenu(input);
  }, []);
}
