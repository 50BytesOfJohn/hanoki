import { useLayoutEffect, useRef } from "react";
import {
  mergeAttributes,
  type MarkdownParseHelpers,
  type MarkdownToken,
  type NodeViewRendererProps,
} from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import { TableKit } from "@tiptap/extension-table";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { isHttpImageUrl, isRemoteImageUrl } from "@shared/chat/assistant-images";

import { RemoteImagePlaceholder } from "@/components/remote-image-placeholder";

const parseParagraph = Paragraph.config.parseMarkdown;

const RichTextParagraph = Paragraph.extend({
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    const tokens = token.tokens ?? [];
    const only = tokens[0];
    if (tokens.length === 1 && only?.type === "image") {
      return helpers.createNode("paragraph", undefined, helpers.parseInline(tokens));
    }
    return (
      parseParagraph?.(token, helpers) ??
      helpers.createNode("paragraph", undefined, helpers.parseInline(tokens))
    );
  },
});

export const NOTE_LINK_OPTIONS = {
  openOnClick: false,
  HTMLAttributes: {
    rel: "noopener noreferrer nofollow",
    target: null,
  },
};

function imageIsBlock(
  editor: ReactNodeViewProps["editor"],
  getPos: ReactNodeViewProps["getPos"],
): boolean {
  const pos = getPos();
  if (typeof pos !== "number") return false;
  const parent = editor.state.doc.resolve(pos).parent;
  if (parent.type.name !== "paragraph") return false;
  let count = 0;
  parent.forEach((child) => {
    if (child.isText && !(child.text ?? "").trim()) return;
    count += 1;
  });
  return count === 1;
}

function RemoteImageNode({ node, editor, getPos }: ReactNodeViewProps) {
  const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const block = imageIsBlock(editor, getPos);
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const outer = ref.current?.parentElement;
    if (!outer) return;
    outer.classList.add("cursor-default");
    outer.classList.toggle("block", block);
    outer.classList.toggle("w-full", block);
  }, [block]);

  return (
    <NodeViewWrapper ref={ref} as="span" className={block ? "block w-full" : undefined}>
      <RemoteImagePlaceholder src={src} alt={alt} layout={block ? "block" : "inline"} />
    </NodeViewWrapper>
  );
}

function localImageDom(node: NodeViewRendererProps["node"]): HTMLElement {
  const img = document.createElement("img");
  const src = node.attrs.src;
  const alt = node.attrs.alt;
  const title = node.attrs.title;
  if (typeof src === "string") img.setAttribute("src", src);
  if (typeof alt === "string" && alt.length > 0) img.setAttribute("alt", alt);
  if (typeof title === "string" && title.length > 0) img.setAttribute("title", title);
  return img;
}

const remoteImageView = ReactNodeViewRenderer(RemoteImageNode, { as: "span" });

const RichTextImage = Image.extend({
  addNodeView() {
    return (props: NodeViewRendererProps) => {
      const src = props.node.attrs.src;
      if (typeof src === "string" && isHttpImageUrl(src)) return remoteImageView(props);
      if (typeof src === "string" && isRemoteImageUrl(src))
        return { dom: document.createElement("span") };
      return { dom: localImageDom(props.node) };
    };
  },

  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes.src;
    const attributes =
      typeof src === "string" && isRemoteImageUrl(src)
        ? { ...HTMLAttributes, src: null }
        : HTMLAttributes;
    return ["img", mergeAttributes(this.options.HTMLAttributes, attributes)];
  },
});

export const RICH_TEXT_SCHEMA_EXTENSIONS = [
  StarterKit.configure({ underline: false, paragraph: false, link: NOTE_LINK_OPTIONS }),
  RichTextParagraph,
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  RichTextImage.configure({ inline: true }),
];
