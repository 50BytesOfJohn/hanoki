import type { MarkdownParseHelpers, MarkdownToken } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

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

export const RICH_TEXT_SCHEMA_EXTENSIONS = [
  StarterKit.configure({ underline: false, paragraph: false }),
  RichTextParagraph,
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  Image.configure({ inline: true }),
];
