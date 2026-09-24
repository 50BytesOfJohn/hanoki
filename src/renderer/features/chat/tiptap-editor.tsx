import * as React from "react";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Mention, type MentionNodeAttrs } from "@tiptap/extension-mention";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { PluginKey } from "@tiptap/pm/state";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import { cn } from "@/lib/utils";
import {
  CHAT_TOOL_LABELS,
  isChatToolId,
  parseTiptapDocument,
  type TiptapDocument,
} from "@shared/tiptap/document";
import { createMessageTiptapExtensions } from "@shared/tiptap/extensions";
import type { ChatFormSubmitBehavior } from "@shared/ipc";
import {
  ComposerSuggestionList,
  filterComposerSuggestions,
  type ComposerSuggestion,
  type NoteCandidate,
} from "./attached-note-picker";
import { TIPTAP_MESSAGE_PROSE_CLASS } from "./tiptap-message-content";

interface SuggestionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const notesRef: { current: NoteCandidate[] } = { current: [] };
const attachNoteRef: { current: (itemId: string) => void } = { current: () => {} };

export function bindComposerNotes(
  notes: readonly NoteCandidate[],
  attachNote: (itemId: string) => void,
) {
  notesRef.current = [...notes];
  attachNoteRef.current = attachNote;
}

function isNoteSuggestion(
  props: MentionNodeAttrs,
): props is MentionNodeAttrs & { kind: "note"; id: string } {
  return "kind" in props && props.kind === "note" && typeof props.id === "string";
}

function isToolSuggestion(
  props: MentionNodeAttrs,
): props is MentionNodeAttrs & { kind: "tool"; id: string } {
  return "kind" in props && props.kind === "tool" && typeof props.id === "string";
}

function getComposerToolLabel(toolId: unknown): string {
  return isChatToolId(toolId) ? CHAT_TOOL_LABELS[toolId] : "";
}
const toolSuggestionPluginKey = new PluginKey("hanoki-tool-mention");

const ComposerMentionList = React.forwardRef<
  SuggestionListHandle,
  SuggestionProps<ComposerSuggestion, ComposerSuggestion>
>(function ComposerMentionList({ command, items, query }, ref) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => setSelectedIndex(0), [items]);

  const selectItem = React.useCallback(
    (index: number) => {
      const item = items[index];
      if (item) command(item);
    },
    [command, items],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowUp") {
          setSelectedIndex((current) => (current + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((current) => (current + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }),
    [items.length, selectItem, selectedIndex],
  );

  return (
    <ComposerSuggestionList
      items={items}
      query={query}
      notesOnly={false}
      selectedIndex={selectedIndex}
      onSelect={(item) => command(item)}
    />
  );
});

const toolSuggestion: Omit<SuggestionOptions<ComposerSuggestion, MentionNodeAttrs>, "editor"> = {
  char: "@",
  pluginKey: toolSuggestionPluginKey,
  placement: "top-start",
  offset: { mainAxis: 8 },
  items: ({ query }) => filterComposerSuggestions(notesRef.current, query, false),
  command: ({ editor, range, props }) => {
    if (isNoteSuggestion(props)) {
      editor.chain().focus().deleteRange(range).run();
      attachNoteRef.current(props.id);
      return;
    }
    if (!isToolSuggestion(props) || !props.id) return;
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        { type: "mention", attrs: { id: props.id, label: props.label ?? props.id } },
        { type: "text", text: " " },
      ])
      .run();
  },
  render: () => {
    let component: ReactRenderer<
      SuggestionListHandle,
      SuggestionProps<ComposerSuggestion, ComposerSuggestion>
    > | null = null;
    let unmount: (() => void) | null = null;

    return {
      onStart(props) {
        component = new ReactRenderer(ComposerMentionList, {
          editor: props.editor,
          props,
        });
        unmount = props.mount(component.element);
      },
      onUpdate(props) {
        component?.updateProps(props);
      },
      onKeyDown(props) {
        if (props.event.key === "Escape") return false;
        return component?.ref?.onKeyDown(props) ?? false;
      },
      onExit() {
        unmount?.();
        component?.destroy();
        unmount = null;
        component = null;
      },
    };
  },
};

const composerExtensions = [
  Document,
  Paragraph,
  Text,
  HardBreak,
  Mention.configure({
    HTMLAttributes: {
      class: "tiptap-tool-mention",
    },
    renderText: ({ node }) => `@${getComposerToolLabel(node.attrs.id)}`,
    renderHTML: ({ node }) => {
      const label = getComposerToolLabel(node.attrs.id);
      return ["span", { class: "tiptap-tool-mention", "data-tool-id": node.attrs.id }, `@${label}`];
    },
    suggestion: toolSuggestion,
  }),
];

interface ChatComposerEditorProps {
  document: TiptapDocument;
  disabled: boolean;
  submitBehavior: ChatFormSubmitBehavior;
  onChange: (document: TiptapDocument) => void;
  onSubmit: () => boolean;
}

export function ChatComposerEditor({
  document,
  disabled,
  submitBehavior,
  onChange,
  onSubmit,
}: ChatComposerEditorProps) {
  const submitBehaviorRef = React.useRef(submitBehavior);
  const onSubmitRef = React.useRef(onSubmit);
  submitBehaviorRef.current = submitBehavior;
  onSubmitRef.current = onSubmit;

  const editor = useEditor({
    extensions: composerExtensions,
    content: document,
    editable: !disabled,
    autofocus: "end",
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        "aria-label": "Chat message",
        "data-slot": "input-group-control",
        class:
          "min-h-[1.75rem] max-h-[24rem] overflow-y-auto whitespace-pre-wrap px-3 py-1 text-[0.9375rem] leading-7 outline-none scrollbar",
      },
      handleKeyDown: (_view, event) => {
        if (event.isComposing || event.key !== "Enter" || event.shiftKey) {
          return false;
        }
        const suggestionState = toolSuggestionPluginKey.getState(_view.state) as
          | { active?: boolean }
          | undefined;
        if (suggestionState?.active) {
          return false;
        }

        const isModEnter = event.metaKey || event.ctrlKey;
        const shouldSubmit =
          (submitBehaviorRef.current === "enter" && !isModEnter) ||
          (submitBehaviorRef.current === "mod-enter" && isModEnter);

        if (!shouldSubmit) {
          return false;
        }
        return onSubmitRef.current();
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const parsed = parseTiptapDocument(currentEditor.getJSON());
      if (parsed.ok) {
        onChange(parsed.value.document);
      }
    },
  });

  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  React.useEffect(() => {
    if (!editor || JSON.stringify(editor.getJSON()) === JSON.stringify(document)) {
      return;
    }
    editor.commands.setContent(document);
    if (parseTiptapDocument(document).ok && document.content.length === 1) {
      editor.commands.focus("end");
    }
  }, [document, editor]);

  const parsedDocument = parseTiptapDocument(document);
  const isEmpty = !parsedDocument.ok || parsedDocument.value.displayText.length === 0;

  return (
    <div className="relative w-full" data-chat-composer-input="true">
      {isEmpty ? (
        <span className="pointer-events-none absolute left-3 top-1 text-[0.9375rem] leading-7 text-muted-foreground">
          Ask anything…
        </span>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}

interface MessageTiptapEditorProps {
  className?: string;
  document: TiptapDocument;
  onChange: (document: TiptapDocument) => void;
}

export function MessageTiptapEditor({ className, document, onChange }: MessageTiptapEditorProps) {
  const extensions = React.useMemo(
    () => createMessageTiptapExtensions({ suggestion: toolSuggestion }),
    [],
  );
  const editor = useEditor({
    extensions,
    content: document,
    autofocus: "end",
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        "aria-label": "Edit message",
        class: cn(
          TIPTAP_MESSAGE_PROSE_CLASS,
          "min-h-10 whitespace-pre-wrap outline-none",
          className,
        ),
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const parsed = parseTiptapDocument(currentEditor.getJSON());
      if (parsed.ok) {
        onChange(parsed.value.document);
      }
    },
  });

  React.useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(document)) {
      editor.commands.setContent(document);
    }
  }, [document, editor]);

  return <EditorContent editor={editor} />;
}
