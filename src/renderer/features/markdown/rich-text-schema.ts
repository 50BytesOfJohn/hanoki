import { mergeAttributes, type MarkdownParseHelpers, type MarkdownToken } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import { TableKit } from "@tiptap/extension-table";
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

const RichTextImage = Image.extend({
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
