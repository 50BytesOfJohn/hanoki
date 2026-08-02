import type { HanokiUiMessage } from "../chat/message-metadata";

export const WEB_TOOL_ID = "web" as const;
export const WEB_TOOL_LABEL = "Web" as const;
export const HANOKI_TOOL_ID = "hanoki" as const;
export const HANOKI_TOOL_LABEL = "Hanoki" as const;
export const TERMINAL_TOOL_ID = "terminal" as const;
export const TERMINAL_TOOL_LABEL = "Terminal" as const;

export const CHAT_TOOL_LABELS = {
  [WEB_TOOL_ID]: WEB_TOOL_LABEL,
  [HANOKI_TOOL_ID]: HANOKI_TOOL_LABEL,
  [TERMINAL_TOOL_ID]: TERMINAL_TOOL_LABEL,
} as const;

export type ChatToolId = keyof typeof CHAT_TOOL_LABELS;

export function isChatToolId(value: unknown): value is ChatToolId {
  return typeof value === "string" && value in CHAT_TOOL_LABELS;
}

const BLOCK_NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "codeBlock",
  "horizontalRule",
]);
const INLINE_NODE_TYPES = new Set(["text", "hardBreak", "mention"]);
const MARK_TYPES = new Set(["bold", "italic", "strike", "underline", "code", "link"]);

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

export interface TiptapDocument extends TiptapNode {
  type: "doc";
  content: TiptapNode[];
}

export interface ParsedTiptapDocument {
  document: TiptapDocument;
  displayText: string;
  modelText: string;
  selectedToolIds: ChatToolId[];
  isTextOnly: boolean;
}

export type ParseTiptapDocumentResult =
  | { ok: true; value: ParsedTiptapDocument }
  | { ok: false; error: string };

export function createEmptyTiptapDocument(): TiptapDocument {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function createTiptapDocumentFromText(text: string): TiptapDocument {
  const normalized = text.replace(/\r\n?/g, "\n");
  const paragraphs = normalized.split("\n\n");

  return {
    type: "doc",
    content: paragraphs.map((paragraph) => {
      const lines = paragraph.split("\n");
      const content: TiptapNode[] = [];

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (line) {
          content.push({ type: "text", text: line });
        }
        if (index < lines.length - 1) {
          content.push({ type: "hardBreak" });
        }
      }

      return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
    }),
  };
}

export function parseTiptapDocument(input: unknown): ParseTiptapDocumentResult {
  const validationError = validateDocument(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const document = input as TiptapDocument;
  const selectedToolIds = new Set<ChatToolId>();
  const displayText = renderDocument(document, "display", selectedToolIds);
  const modelText = renderDocument(document, "model", selectedToolIds);

  return {
    ok: true,
    value: {
      document,
      displayText,
      modelText,
      selectedToolIds: [...selectedToolIds],
      isTextOnly: isTextOnlyDocument(document),
    },
  };
}

export function requireTiptapDocument(input: unknown): ParsedTiptapDocument {
  const parsed = parseTiptapDocument(input);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

export function createTiptapMessageParts(document: TiptapDocument): HanokiUiMessage["parts"] {
  const parsed = requireTiptapDocument(document);
  return parsed.isTextOnly
    ? [{ type: "text", text: parsed.displayText }]
    : [{ type: "data-tiptap", data: parsed.document }];
}

export function getMessageDisplayText(message: Pick<HanokiUiMessage, "parts">): string {
  const blocks: string[] = [];

  for (const part of message.parts) {
    if (part.type === "text") {
      blocks.push(part.text);
      continue;
    }
    if (part.type === "data-tiptap") {
      const parsed = parseTiptapDocument(part.data);
      if (parsed.ok) {
        blocks.push(parsed.value.displayText);
      }
    }
  }

  return blocks.join("\n");
}

export function getSelectedToolIds(message: Pick<HanokiUiMessage, "parts">): string[] {
  const selected = new Set<string>();
  for (const part of message.parts) {
    if (part.type !== "data-tiptap") {
      continue;
    }
    const parsed = parseTiptapDocument(part.data);
    if (parsed.ok) {
      for (const toolId of parsed.value.selectedToolIds) {
        selected.add(toolId);
      }
    }
  }
  return [...selected];
}

export function isWebToolEnabledForRequest(
  chatWideWebEnabled: boolean,
  latestUserMessage: Pick<HanokiUiMessage, "parts"> | undefined,
): boolean {
  return (
    chatWideWebEnabled ||
    Boolean(latestUserMessage && getSelectedToolIds(latestUserMessage).includes(WEB_TOOL_ID))
  );
}

export function isHanokiToolEnabledForRequest(
  chatWideHanokiEnabled: boolean,
  latestUserMessage: Pick<HanokiUiMessage, "parts"> | undefined,
): boolean {
  return (
    chatWideHanokiEnabled ||
    Boolean(latestUserMessage && getSelectedToolIds(latestUserMessage).includes(HANOKI_TOOL_ID))
  );
}

export function isTerminalToolEnabledForRequest(
  chatWideTerminalEnabled: boolean,
  latestUserMessage: Pick<HanokiUiMessage, "parts"> | undefined,
): boolean {
  return (
    chatWideTerminalEnabled ||
    Boolean(latestUserMessage && getSelectedToolIds(latestUserMessage).includes(TERMINAL_TOOL_ID))
  );
}

export function validateTiptapMessageParts(message: unknown): string | null {
  if (!isRecord(message) || !Array.isArray(message.parts)) {
    return "Message parts must be an array.";
  }
  for (const part of message.parts) {
    if (!isRecord(part) || part.type !== "data-tiptap") {
      continue;
    }
    const parsed = parseTiptapDocument(part.data);
    if (!parsed.ok) {
      return parsed.error;
    }
  }
  return null;
}

function validateDocument(input: unknown): string | null {
  if (!isRecord(input) || input.type !== "doc" || !Array.isArray(input.content)) {
    return "Tiptap content must be a document with a content array.";
  }
  if (input.content.length === 0) {
    return "Tiptap documents must contain at least one block.";
  }
  return validateChildren(input.content, "doc", "block");
}

function validateChildren(
  children: unknown[],
  path: string,
  expected: "block" | "inline" | "listItem" | "text",
): string | null {
  for (let index = 0; index < children.length; index += 1) {
    const error = validateNode(children[index], `${path}.content[${index}]`, expected);
    if (error) {
      return error;
    }
  }
  return null;
}

function validateNode(
  input: unknown,
  path: string,
  expected: "block" | "inline" | "listItem" | "text",
): string | null {
  if (!isRecord(input) || typeof input.type !== "string") {
    return `${path} must be a Tiptap node.`;
  }

  const nodeType = input.type;
  const isExpected =
    (expected === "block" && BLOCK_NODE_TYPES.has(nodeType)) ||
    (expected === "inline" && INLINE_NODE_TYPES.has(nodeType)) ||
    (expected === "listItem" && nodeType === "listItem") ||
    (expected === "text" && nodeType === "text");

  if (!isExpected) {
    return `${path} contains unsupported node type "${nodeType}".`;
  }

  const marksError = validateMarks(input.marks, path, nodeType === "text");
  if (marksError) {
    return marksError;
  }

  if (nodeType === "text") {
    if (typeof input.text !== "string" || input.text.length === 0 || input.content !== undefined) {
      return `${path} must contain non-empty text and no children.`;
    }
    return null;
  }

  if (nodeType === "hardBreak" || nodeType === "horizontalRule") {
    return input.content === undefined ? null : `${path} cannot contain children.`;
  }

  if (nodeType === "mention") {
    if (!isRecord(input.attrs) || !isChatToolId(input.attrs.id)) {
      return `${path} contains an unsupported mention ID.`;
    }
    if (input.content !== undefined) {
      return `${path} cannot contain children.`;
    }
    return null;
  }

  if (nodeType === "heading") {
    if (!isRecord(input.attrs) || ![1, 2, 3, 4, 5, 6].includes(input.attrs.level as number)) {
      return `${path} must have a heading level from 1 to 6.`;
    }
  }

  if (nodeType === "orderedList" && input.attrs !== undefined) {
    if (
      !isRecord(input.attrs) ||
      (input.attrs.start !== undefined && typeof input.attrs.start !== "number")
    ) {
      return `${path} has invalid ordered-list attributes.`;
    }
  }

  if (nodeType === "codeBlock" && input.attrs !== undefined) {
    if (
      !isRecord(input.attrs) ||
      (input.attrs.language !== undefined &&
        input.attrs.language !== null &&
        typeof input.attrs.language !== "string")
    ) {
      return `${path} has invalid code-block attributes.`;
    }
  }

  const content = input.content;
  if (content !== undefined && !Array.isArray(content)) {
    return `${path}.content must be an array.`;
  }
  const children = content ?? [];

  if (nodeType === "paragraph" || nodeType === "heading") {
    return validateChildren(children, path, "inline");
  }
  if (nodeType === "codeBlock") {
    return validateChildren(children, path, "text");
  }
  if (nodeType === "bulletList" || nodeType === "orderedList") {
    return validateChildren(children, path, "listItem");
  }
  if (nodeType === "listItem" || nodeType === "blockquote") {
    return validateChildren(children, path, "block");
  }

  return `${path} contains unsupported node type "${nodeType}".`;
}

function validateMarks(input: unknown, path: string, allowed: boolean): string | null {
  if (input === undefined) {
    return null;
  }
  if (!allowed || !Array.isArray(input)) {
    return `${path}.marks is invalid.`;
  }
  for (const [index, mark] of input.entries()) {
    if (!isRecord(mark) || typeof mark.type !== "string" || !MARK_TYPES.has(mark.type)) {
      return `${path}.marks[${index}] contains an unsupported mark.`;
    }
    if (mark.type === "link") {
      if (!isRecord(mark.attrs) || typeof mark.attrs.href !== "string") {
        return `${path}.marks[${index}] has invalid link attributes.`;
      }
    }
  }
  return null;
}

function isTextOnlyDocument(document: TiptapDocument): boolean {
  return document.content.every(
    (block) =>
      block.type === "paragraph" &&
      (block.content ?? []).every(
        (node) =>
          node.type === "hardBreak" ||
          (node.type === "text" && (node.marks === undefined || node.marks.length === 0)),
      ),
  );
}

function renderDocument(
  document: TiptapDocument,
  mode: "display" | "model",
  selectedToolIds: Set<ChatToolId>,
): string {
  return document.content.map((node) => renderNode(node, mode, selectedToolIds)).join("\n\n");
}

function renderNode(
  node: TiptapNode,
  mode: "display" | "model",
  selectedToolIds: Set<ChatToolId>,
): string {
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  if (node.type === "horizontalRule") {
    return "---";
  }
  if (node.type === "mention") {
    const toolId = node.attrs?.id;
    if (!isChatToolId(toolId)) return "";
    selectedToolIds.add(toolId);
    const label = CHAT_TOOL_LABELS[toolId];
    return mode === "display" ? `@${label}` : `${label} tool`;
  }

  const children = node.content ?? [];
  if (node.type === "bulletList" || node.type === "orderedList") {
    const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
    return children
      .map((child, index) => {
        const prefix = node.type === "orderedList" ? `${start + index}. ` : "- ";
        return `${prefix}${renderNode(child, mode, selectedToolIds)}`;
      })
      .join("\n");
  }
  if (node.type === "listItem") {
    return children.map((child) => renderNode(child, mode, selectedToolIds)).join("\n");
  }
  if (node.type === "blockquote") {
    return children.map((child) => renderNode(child, mode, selectedToolIds)).join("\n\n");
  }
  return children.map((child) => renderNode(child, mode, selectedToolIds)).join("");
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
