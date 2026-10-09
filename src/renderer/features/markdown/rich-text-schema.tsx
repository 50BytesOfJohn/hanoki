import { Image02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { isRemoteImageUrl } from "@shared/chat/assistant-images";

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

function remoteImageHost(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = trimmed.startsWith("//") ? new URL(`https:${trimmed}`) : new URL(trimmed);
    return parsed.host;
  } catch {
    return "";
  }
}

function RemoteImagePlaceholder({ node }: ReactNodeViewProps) {
  const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt.trim() : "";
  const label = alt.length > 0 ? alt : "Image";
  return (
    <NodeViewWrapper
      as="span"
      data-remote-image=""
      className="flex w-full items-center gap-1.5 text-[12px] text-muted-foreground"
    >
      <HugeiconsIcon icon={Image02Icon} className="size-3 shrink-0" />
      <span>{`${label} · ${remoteImageHost(src)}`}</span>
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

const remoteImageView = ReactNodeViewRenderer(RemoteImagePlaceholder, {
  as: "span",
  className: "block w-full",
});

const RichTextImage = Image.extend({
  addNodeView() {
    return (props: NodeViewRendererProps) => {
      const src = props.node.attrs.src;
      if (typeof src !== "string" || !isRemoteImageUrl(src)) {
        return { dom: localImageDom(props.node) };
      }
      return remoteImageView(props);
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
