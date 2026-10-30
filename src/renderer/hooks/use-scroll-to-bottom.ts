import * as React from "react";

// Scrolling back down within this distance of the bottom resumes following.
const BOTTOM_THRESHOLD = 16;
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

function getDistanceFromBottom(container: HTMLDivElement): number {
  return container.scrollHeight - container.scrollTop - container.clientHeight;
}

/** A nested scroller that can still move up consumes the wheel before the chat does. */
function isInsideScrolledElement(target: EventTarget | null, container: HTMLDivElement): boolean {
  let element = target instanceof Element ? target : null;

  while (element && element !== container) {
    if (element.scrollTop > 0) {
      return true;
    }
    element = element.parentElement;
  }

  return false;
}

function hasMessageTextSelection(container: HTMLDivElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return false;
  }

  const node = selection.anchorNode;
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  return container.contains(element) && element?.closest(MESSAGE_SELECTOR) != null;
}

function captureScrollPosition(container: HTMLDivElement): ChatScrollPosition {
  // Restoring an at-bottom position ignores the anchor, so skip measuring every
  // message — this runs on every frame of a streaming response.
  if (getDistanceFromBottom(container) <= RESTORE_BOTTOM_THRESHOLD) {
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
    isAtBottom: false,
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
 *
 * Following stops on scroll intent rather than position: the reader leaves by
 * scrolling up at all, and returns by scrolling back down to the bottom. Callers
 * that start a reply on the reader's behalf opt back in with `scrollToBottom`.
 */
export function useScrollToBottom(
  chatId: string,
  isStreaming: boolean,
  isActive: boolean,
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
  const isStreamingRef = React.useRef(isStreaming);
  const isActiveRef = React.useRef(isActive);
  const lastScrollTopRef = React.useRef(0);
  const isPointerDownRef = React.useRef(false);

  const setShouldStick = React.useCallback((shouldStick: boolean) => {
    shouldStickRef.current = shouldStick;

    // Native anchoring would move scrollTop when rows above shrink, which reads as
    // the reader scrolling up. Anchoring only helps once they have left the bottom.
    if (containerRef.current) {
      containerRef.current.style.overflowAnchor = shouldStick ? "none" : "";
    }
  }, []);

  const savePosition = React.useCallback(() => {
    const container = containerRef.current;

    // A hidden tab's content collapses, so its geometry says nothing about the reader.
    if (container && isActiveRef.current) {
      chatScrollPositions.set(chatId, captureScrollPosition(container));
    }
  }, [chatId]);

  const scrollToBottom = React.useCallback(() => {
    const container = containerRef.current;

    if (container) {
      container.scrollTop = container.scrollHeight;
      lastScrollTopRef.current = container.scrollTop;
      setShouldStick(true);
      savePosition();
    }
  }, [savePosition, setShouldStick]);

  const settleInitialPosition = React.useCallback(() => {
    if (isInitialPositionSettledRef.current) {
      return;
    }

    const container = containerRef.current;
    if (!container || !isActiveRef.current) {
      return;
    }

    const initialPosition = initialPositionRef.current;

    if (initialPosition) {
      const wasRestored = restoreScrollPosition(container, initialPosition);
      lastScrollTopRef.current = container.scrollTop;
      setShouldStick(initialPosition.isAtBottom);

      if (!wasRestored) {
        return;
      }
    } else {
      container.scrollTop = container.scrollHeight;
      lastScrollTopRef.current = container.scrollTop;
      setShouldStick(true);

      if (getMessageElements(container).length === 0) {
        return;
      }
    }

    isInitialPositionSettledRef.current = true;
    savePosition();
  }, [savePosition, setShouldStick]);

  // Runs first so the effects below see the current visibility. Coming back from
  // a hidden tab puts the reader where they left, before the content is painted.
  React.useLayoutEffect(() => {
    const wasActive = isActiveRef.current;
    isActiveRef.current = isActive;

    const container = containerRef.current;
    const position = chatScrollPositions.get(chatId);

    if (isActive && !wasActive && container && position && isInitialPositionSettledRef.current) {
      restoreScrollPosition(container, position);
      lastScrollTopRef.current = container.scrollTop;
    }
  }, [chatId, isActive]);

  // Messages may arrive after the chat shell mounts. Retry before every paint
  // until the saved message anchor is present in the DOM.
  React.useLayoutEffect(() => {
    settleInitialPosition();
  });

  React.useLayoutEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let captureFrame: number | null = null;

    const onScroll = () => {
      if (!isActiveRef.current) {
        return;
      }

      const scrollTop = container.scrollTop;
      const previousScrollTop = lastScrollTopRef.current;
      const distanceFromBottom = getDistanceFromBottom(container);
      lastScrollTopRef.current = scrollTop;

      // Our own writes update lastScrollTopRef, so any movement here is the reader's
      // or the browser clamping shrunken content, which lands exactly at the bottom.
      if (scrollTop < previousScrollTop && distanceFromBottom > RESTORE_BOTTOM_THRESHOLD) {
        setShouldStick(false);
      } else if (scrollTop > previousScrollTop && distanceFromBottom <= BOTTOM_THRESHOLD) {
        setShouldStick(true);
      }

      if (captureFrame !== null) {
        cancelAnimationFrame(captureFrame);
      }

      captureFrame = requestAnimationFrame(() => {
        captureFrame = null;
        savePosition();
      });
    };

    // Fires before the scroll it causes, so the next streamed frame cannot undo it.
    const onWheel = (event: WheelEvent) => {
      if (
        event.deltaY < 0 &&
        container.scrollTop > 0 &&
        !isInsideScrolledElement(event.target, container)
      ) {
        setShouldStick(false);
      }
    };

    const onPointerDown = () => {
      isPointerDownRef.current = true;
    };

    const onPointerUp = () => {
      isPointerDownRef.current = false;
    };

    const finishPendingRestoration = () => {
      // Once settled, scroll events keep the saved position current. Saving here
      // would also run after the composer's Enter handler has already rendered
      // the sent message, pinning the viewport above it.
      if (isInitialPositionSettledRef.current) {
        return;
      }

      isInitialPositionSettledRef.current = true;
      initialPositionRef.current = null;
      savePosition();
    };

    setShouldStick(shouldStickRef.current);
    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
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
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("wheel", finishPendingRestoration);
      container.removeEventListener("touchstart", finishPendingRestoration);
      container.removeEventListener("pointerdown", finishPendingRestoration);
      container.removeEventListener("keydown", finishPendingRestoration);
    };
  }, [savePosition, setShouldStick]);

  React.useEffect(() => {
    const container = containerRef.current;
    const content = anchorRef.current?.parentElement;
    if (!container || !content) {
      return;
    }

    let contentHeight = content.getBoundingClientRect().height;

    // Runs after layout and before paint, so following a stream never shows a frame
    // with the new line below the fold. Writing scrollTop cannot resize these boxes.
    const resizeObserver = new ResizeObserver(() => {
      const previousContentHeight = contentHeight;
      contentHeight = content.getBoundingClientRect().height;

      if (!isActiveRef.current) {
        return;
      }

      if (!isInitialPositionSettledRef.current) {
        settleInitialPosition();
        return;
      }

      // The transcript shrank under the reader, leaving nothing below them to read.
      if (
        contentHeight < previousContentHeight &&
        getDistanceFromBottom(container) <= RESTORE_BOTTOM_THRESHOLD
      ) {
        setShouldStick(true);
      }

      if (isStreamingRef.current) {
        if (!shouldStickRef.current) {
          return;
        }

        // Scrolling would move the text under a drag selection in progress.
        if (isPointerDownRef.current && hasMessageTextSelection(container)) {
          setShouldStick(false);
          return;
        }

        scrollToBottom();
        return;
      }

      const position = chatScrollPositions.get(chatId);

      if (position) {
        restoreScrollPosition(container, position);
        lastScrollTopRef.current = container.scrollTop;
        savePosition();
      }
    });

    // Height changes are all that move the bottom, so text streaming within a line
    // does no work here. The container covers window and pane resizes.
    resizeObserver.observe(content);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [chatId, savePosition, scrollToBottom, setShouldStick, settleInitialPosition]);

  return { containerRef, anchorRef, scrollToBottom };
}
