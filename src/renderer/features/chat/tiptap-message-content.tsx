import * as React from "react";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";

import { cn } from "@/lib/utils";
import type { TiptapDocument } from "@shared/tiptap/document";
import { createMessageTiptapExtensions } from "@shared/tiptap/extensions";

const messageExtensions = createMessageTiptapExtensions();

/** Shared so edit mode renders paragraphs, lists and headings exactly like the saved message. */
export const TIPTAP_MESSAGE_PROSE_CLASS =
  "prose prose-sm prose-invert max-w-none break-words text-[0.9375rem] leading-[1.7] prose-p:leading-[1.7] prose-headings:mb-2 prose-headings:mt-5 prose-headings:font-heading prose-li:my-0.5 prose-pre:my-3 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-background-secondary prose-pre:px-4 prose-pre:py-3 prose-code:font-mono prose-code:text-[0.875em] prose-a:text-link";

interface TiptapMessageContentProps {
  className?: string;
  document: TiptapDocument;
}

export const TiptapMessageContent = React.memo(function TiptapMessageContent({
  className,
  document,
}: TiptapMessageContentProps) {
  const content = React.useMemo(
    () => renderToReactElement({ content: document, extensions: messageExtensions }),
    [document],
  );

  return (
    <div className={cn("tiptap-message-content", TIPTAP_MESSAGE_PROSE_CLASS, className)}>
      {content}
    </div>
  );
});
