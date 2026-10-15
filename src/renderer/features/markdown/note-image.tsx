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
    if (!title) return `![${alt}](${destination})`;
    return `![${alt}](${destination} "${title}")`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView);
  },
}).configure({ allowBase64: true });

function imageDestination(src: string): string {
  if (src.length === 0 || /[\s()]/.test(src)) return `<${src}>`;
  return src;
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
