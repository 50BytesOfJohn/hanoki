import * as React from "react";

const BOTTOM_THRESHOLD = 100;
const RESTORE_BOTTOM_THRESHOLD = 2;
const MESSAGE_SELECTOR = "[data-chat-message-id]";

type ChatScrollPosition = {
  anchorMessageId: string | null;
  anchorOffset: number;
  scrollTop: number;
  isAtBottom: boolean;
};

const chatScrollPositions = new Map<string, ChatScrollPosition>();

function getMessageElements(container: HTMLDivElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR));
}

function isContainerAtBottom(container: HTMLDivElement): boolean {
  return container.scrollHeight - container.scrollTop - container.clientHeight <= BOTTOM_THRESHOLD;
}

function captureScrollPosition(container: HTMLDivElement): ChatScrollPosition {
  // Restoring an at-bottom position ignores the anchor, so skip measuring every
  // message — this runs on every frame of a streaming response.
  if (
    container.scrollHeight - container.scrollTop - container.clientHeight <=
    RESTORE_BOTTOM_THRESHOLD
  ) {
    return {
      anchorMessageId: null,
      anchorOffset: 0,
      scrollTop: container.scrollTop,
      isAtBottom: true,
    };
  }

  const containerRect = container.getBoundingClientRect();
  const anchor = getMessageElements(container).find((message) => {
    const rect = message.getBoundingClientRect();
    return rect.bottom > containerRect.top && rect.top < containerRect.bottom;
  });

  return {
    anchorMessageId: anchor?.dataset.chatMessageId ?? null,
    anchorOffset: anchor ? anchor.getBoundingClientRect().top - containerRect.top : 0,
    scrollTop: container.scrollTop,
    isAtBottom:
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      RESTORE_BOTTOM_THRESHOLD,
  };
}

function restoreScrollPosition(container: HTMLDivElement, position: ChatScrollPosition): boolean {
  const messages = getMessageElements(container);
  const anchor = position.anchorMessageId
    ? messages.find((message) => message.dataset.chatMessageId === position.anchorMessageId)
    : null;

  if (position.isAtBottom) {
    container.scrollTop = container.scrollHeight;
  } else if (anchor) {
    const containerTop = container.getBoundingClientRect().top;
    const currentAnchorOffset = anchor.getBoundingClientRect().top - containerTop;
    container.scrollTop += currentAnchorOffset - position.anchorOffset;
  } else {
    container.scrollTop = position.scrollTop;
  }

  return position.anchorMessageId === null || anchor !== null;
}

/**
 * Manages chat scrolling, including per-chat restoration and streaming follow.
 *
 * The saved position uses a visible message as an anchor so delayed rendering
 * and messages prepended by future infinite loading do not shift the viewport.
 */
export function useScrollToBottom(
  chatId: string,
  isStreaming: boolean,
): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
} {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const initialPositionRef = React.useRef(chatScrollPositions.get(chatId) ?? null);
  const isInitialPositionSettledRef = React.useRef(false);
  const shouldStickRef = React.useRef(initialPositionRef.current?.isAtBottom ?? true);
  const prevIsStreamingRef = React.useRef(isStreaming);
  const isStreamingRef = React.useRef(isStreaming);

  const savePosition = React.useCallback(() => {
    const container = containerRef.current;

    if (container) {
      chatScrollPositions.set(chatId, captureScrollPosition(container));
    }
  }, [chatId]);

  const isAtBottom = React.useCallback(() => {
    const container = containerRef.current;
    return container ? isContainerAtBottom(container) : true;
  }, []);

  const scrollToBottom = React.useCallback(() => {
    const container = containerRef.current;

    if (container) {
      container.scrollTop = container.scrollHeight;
      shouldStickRef.current = true;
      savePosition();
    }
  }, [savePosition]);

  const settleInitialPosition = React.useCallback(() => {
    if (isInitialPositionSettledRef.current) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const initialPosition = initialPositionRef.current;

    if (initialPosition) {
      const wasRestored = restoreScrollPosition(container, initialPosition);
      shouldStickRef.current = initialPosition.isAtBottom;

      if (!wasRestored) {
        return;
      }
    } else {
      container.scrollTop = container.scrollHeight;

      if (getMessageElements(container).length === 0) {
        return;
      }
    }

    isInitialPositionSettledRef.current = true;
    savePosition();
  }, [savePosition]);

  // Messages may arrive after the chat shell mounts. Retry before every paint
  // until the saved message anchor is present in the DOM.
  React.useLayoutEffect(() => {
    settleInitialPosition();
  });

  React.useLayoutEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;
    isStreamingRef.current = isStreaming;

    if (isStreaming && !wasStreaming) {
      shouldStickRef.current = true;
    }
  }, [isStreaming]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let captureFrame: number | null = null;

    const onScroll = () => {
      shouldStickRef.current = isAtBottom();

      if (captureFrame !== null) {
        cancelAnimationFrame(captureFrame);
      }

      captureFrame = requestAnimationFrame(() => {
        captureFrame = null;
        savePosition();
      });
    };

    const finishPendingRestoration = () => {
      isInitialPositionSettledRef.current = true;
      initialPositionRef.current = null;
      savePosition();
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("wheel", finishPendingRestoration, { passive: true });
    container.addEventListener("touchstart", finishPendingRestoration, { passive: true });
    container.addEventListener("pointerdown", finishPendingRestoration, { passive: true });
    container.addEventListener("keydown", finishPendingRestoration);

    return () => {
      if (captureFrame !== null) {
        cancelAnimationFrame(captureFrame);
      }

      savePosition();
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("wheel", finishPendingRestoration);
      container.removeEventListener("touchstart", finishPendingRestoration);
      container.removeEventListener("pointerdown", finishPendingRestoration);
      container.removeEventListener("keydown", finishPendingRestoration);
    };
  }, [isAtBottom, savePosition]);

  React.useEffect(() => {
    const content = anchorRef.current?.parentElement;
    if (!content) {
      return;
    }

    let updateFrame: number | null = null;

    const updateScrollPosition = () => {
      if (updateFrame !== null) {
        return;
      }

      updateFrame = requestAnimationFrame(() => {
        updateFrame = null;

        if (!isInitialPositionSettledRef.current) {
          settleInitialPosition();
          return;
        }

        if (isStreamingRef.current) {
          if (shouldStickRef.current) {
            scrollToBottom();
          }
          return;
        }

        const container = containerRef.current;
        const position = chatScrollPositions.get(chatId);

        if (container && position) {
          restoreScrollPosition(container, position);
          savePosition();
        }
      });
    };

    const resizeObserver = new ResizeObserver(updateScrollPosition);
    const mutationObserver = new MutationObserver(updateScrollPosition);

    resizeObserver.observe(content);
    mutationObserver.observe(content, { childList: true, subtree: true });

    return () => {
      if (updateFrame !== null) {
        cancelAnimationFrame(updateFrame);
      }

      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [chatId, savePosition, scrollToBottom, settleInitialPosition]);

  return { containerRef, anchorRef, scrollToBottom };
}
