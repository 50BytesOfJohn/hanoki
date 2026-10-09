import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

export const RICH_TEXT_SCHEMA_EXTENSIONS = [
  StarterKit,
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  Image.configure({ inline: true }),
];
