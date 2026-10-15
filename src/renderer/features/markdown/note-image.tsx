import * as React from "react";
import type { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { imageDisplaySrc } from "@shared/assets/protocol";

import { MissingNoteImage } from "./missing-note-image";

interface NoteImageContext {
  workspaceId: string;
  itemId: string;
}

const noteImageContext = new WeakMap<Editor, NoteImageContext>();

export function setNoteImageContext(editor: Editor, workspaceId: string, itemId: string): void {
  noteImageContext.set(editor, { workspaceId, itemId });
}

export const NoteImage = Image.extend({
  renderMarkdown(node) {
    const attrs = node.attrs ?? {};
    const src = String(attrs.src ?? "");
    const alt = String(attrs.alt ?? "");
    const title = String(attrs.title ?? "");
    const destination = imageDestination(src);
    const label = escapeAlt(alt);
    if (!title) return `![${label}](${destination})`;
    return `![${label}](${destination} "${escapeTitle(title)}")`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView);
  },
}).configure({ allowBase64: true });

function imageDestination(src: string): string {
  if (hasWhitespace(src) || !parenthesesBalanced(src)) return `<${src}>`;
  return src;
}

function escapeAlt(alt: string): string {
  return alt.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
}

function escapeTitle(title: string): string {
  return title.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function hasWhitespace(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 32 || code === 9 || code === 10 || code === 13) return true;
  }
  return false;
}

function parenthesesBalanced(value: string): boolean {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function NoteImageView({ node, editor }: ReactNodeViewProps) {
  const src = String(node.attrs.src ?? "");
  const alt = String(node.attrs.alt ?? "");
  const context = noteImageContext.get(editor);
  const displaySrc = context ? imageDisplaySrc(src, context) : "";
  return (
    <NodeViewWrapper className="block max-w-full">
      <NoteImageFrame src={displaySrc} alt={alt} path={src} />
    </NodeViewWrapper>
  );
}

export function NoteImageFrame({ src, alt, path }: { src: string; alt: string; path: string }) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const broken = src.length === 0 || failedSrc === src;
  if (broken) {
    return <MissingNoteImage path={path} alt={alt} layout="block" />;
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className="my-3 max-w-full rounded-md"
      onError={() => setFailedSrc(src)}
    />
  );
}
