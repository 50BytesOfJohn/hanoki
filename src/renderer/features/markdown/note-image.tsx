import * as React from "react";
import type { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { ImageNotFound01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { imageDisplaySrc } from "@shared/assets/protocol";

interface NoteImageContext {
  workspaceId: string;
  itemId: string;
}

const noteImageContext = new WeakMap<Editor, NoteImageContext>();

export function setNoteImageContext(editor: Editor, workspaceId: string, itemId: string): void {
  noteImageContext.set(editor, { workspaceId, itemId });
}

export const NoteImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView);
  },
}).configure({ allowBase64: true });

function NoteImageView({ node, editor }: ReactNodeViewProps) {
  const src = String(node.attrs.src ?? "");
  const alt = String(node.attrs.alt ?? "");
  const context = noteImageContext.get(editor);
  const displaySrc = context ? imageDisplaySrc(src, context) : "";
  return (
    <NodeViewWrapper className="my-3 block max-w-full">
      <NoteImageFrame src={displaySrc} alt={alt} />
    </NodeViewWrapper>
  );
}

export function NoteImageFrame({ src, alt }: { src: string; alt: string }) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const broken = src.length === 0 || failedSrc === src;
  if (broken) {
    const label = alt ? `${alt}, image not found` : "Image not found";
    return (
      <span
        role="img"
        aria-label={label}
        className="inline-flex min-h-8 items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1.5 text-sm text-muted-foreground"
      >
        <HugeiconsIcon icon={ImageNotFound01Icon} className="size-4 shrink-0" />
        <span>{alt || "Image not found"}</span>
        {alt ? <span>Image not found</span> : null}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className="max-w-full rounded-md"
      onError={() => setFailedSrc(src)}
    />
  );
}
