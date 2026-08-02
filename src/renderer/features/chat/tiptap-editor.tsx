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
import {
  AiWebBrowsingIcon,
  ComputerTerminal01Icon,
  Database02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import {
  CHAT_TOOL_LABELS,
  HANOKI_TOOL_ID,
  HANOKI_TOOL_LABEL,
  TERMINAL_TOOL_ID,
  TERMINAL_TOOL_LABEL,
  WEB_TOOL_ID,
  WEB_TOOL_LABEL,
  isChatToolId,
  parseTiptapDocument,
  type ChatToolId,
  type TiptapDocument,
} from "@shared/tiptap/document";
import { createMessageTiptapExtensions } from "@shared/tiptap/extensions";
import type { ChatFormSubmitBehavior } from "@shared/ipc";

interface ToolSuggestionItem {
  id: ChatToolId;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
}

interface ToolSuggestionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const TOOL_SUGGESTIONS: ToolSuggestionItem[] = [
  { id: WEB_TOOL_ID, label: WEB_TOOL_LABEL, description: "Web search", icon: AiWebBrowsingIcon },
  {
    id: HANOKI_TOOL_ID,
    label: HANOKI_TOOL_LABEL,
    description: "Workspace data",
    icon: Database02Icon,
  },
  {
    id: TERMINAL_TOOL_ID,
    label: TERMINAL_TOOL_LABEL,
    description: "Commands & files",
    icon: ComputerTerminal01Icon,
  },
];

function getComposerToolLabel(toolId: unknown): string {
  return isChatToolId(toolId) ? CHAT_TOOL_LABELS[toolId] : WEB_TOOL_LABEL;
}
const toolSuggestionPluginKey = new PluginKey("hanoki-tool-mention");

const ToolSuggestionList = React.forwardRef<
  ToolSuggestionListHandle,
  SuggestionProps<ToolSuggestionItem, MentionNodeAttrs>
>(function ToolSuggestionList({ command, items }, ref) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => setSelectedIndex(0), [items]);

  const selectItem = React.useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    },
    [command, items],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) {
          return false;
        }
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

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="min-w-48 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
      role="listbox"
      aria-label="Tools"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none",
            index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
          )}
          onMouseDown={(event) => {
            event.preventDefault();
            selectItem(index);
          }}
        >
          <HugeiconsIcon icon={item.icon} className="size-4 text-muted-foreground" />
          <span className="font-medium">{item.label}</span>
          <span className="ml-auto text-xs text-muted-foreground">{item.description}</span>
        </button>
      ))}
    </div>
  );
});

const toolSuggestion: Omit<SuggestionOptions<ToolSuggestionItem, MentionNodeAttrs>, "editor"> = {
  char: "@",
  pluginKey: toolSuggestionPluginKey,
  placement: "top-start",
  offset: { mainAxis: 8 },
  items: ({ query }) => {
    const normalizedQuery = query.trim().toLowerCase();
    return TOOL_SUGGESTIONS.filter((item) => item.label.toLowerCase().startsWith(normalizedQuery));
  },
  render: () => {
    let component: ReactRenderer<
      ToolSuggestionListHandle,
      SuggestionProps<ToolSuggestionItem, MentionNodeAttrs>
    > | null = null;
    let unmount: (() => void) | null = null;

    return {
      onStart(props) {
        component = new ReactRenderer(ToolSuggestionList, {
          editor: props.editor,
          props,
        });
        unmount = props.mount(component.element);
      },
      onUpdate(props) {
        component?.updateProps(props);
      },
      onKeyDown(props) {
        if (props.event.key === "Escape") {
          return false;
        }
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
        class: cn("min-h-10 whitespace-pre-wrap outline-none", className),
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
