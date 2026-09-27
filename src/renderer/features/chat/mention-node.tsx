import * as React from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react";

import { cn } from "@/lib/utils";
import type { MentionOptions } from "@tiptap/extension-mention";

import { isAttachedItemKind } from "@shared/chat/attached-items";
import { CHAT_TOOL_LABELS, isChatToolId } from "@shared/tiptap/document";
import { HanokiMention, hanokiMentionOptions } from "@shared/tiptap/extensions";

import { mentionTargetExists, openMentionTarget } from "./mention-context";

function stopMouseDown(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function MentionNodeView({ node, deleteNode, editor }: ReactNodeViewProps) {
  const editable = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isEditable,
  });
  const kind = node.attrs.kind;
  const itemId = node.attrs.itemId;
  const isItem =
    isAttachedItemKind(kind) && typeof itemId === "string" && itemId.length > 0 && !node.attrs.id;
  const [broken, setBroken] = React.useState(false);

  React.useEffect(() => {
    if (!isItem) return;
    let cancelled = false;
    void mentionTargetExists(kind, itemId).then((exists) => {
      if (!cancelled) setBroken(!exists);
    });
    return () => {
      cancelled = true;
    };
  }, [isItem, itemId, kind]);

  if (!isItem) {
    const toolId: unknown = node.attrs.id;
    const label = isChatToolId(toolId) ? CHAT_TOOL_LABELS[toolId] : "";
    return <NodeViewWrapper as="span">@{label}</NodeViewWrapper>;
  }

  const storedLabel = typeof node.attrs.label === "string" ? node.attrs.label : "";
  const label = broken || storedLabel.length === 0 ? "Missing" : storedLabel;

  return (
    <NodeViewWrapper as="span" className={cn(broken && "mention-broken")}>
      <button
        type="button"
        aria-label={`Open ${label}`}
        disabled={broken}
        onMouseDown={stopMouseDown}
        onClick={() => {
          if (!broken) void openMentionTarget(kind, itemId);
        }}
      >
        @{label}
      </button>
      {editable ? (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          className="ml-0.5 text-muted-foreground hover:text-foreground"
          onMouseDown={stopMouseDown}
          onClick={() => deleteNode()}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
        </button>
      ) : null}
    </NodeViewWrapper>
  );
}

export function createEditorMention(suggestion?: MentionOptions["suggestion"]) {
  return HanokiMention.extend({
    addNodeView() {
      return ReactNodeViewRenderer(MentionNodeView, {
        as: "span",
        className: "tiptap-tool-mention",
        stopEvent: ({ event }) =>
          event.target instanceof HTMLElement && Boolean(event.target.closest("button")),
      });
    },
  }).configure(hanokiMentionOptions(suggestion));
}
