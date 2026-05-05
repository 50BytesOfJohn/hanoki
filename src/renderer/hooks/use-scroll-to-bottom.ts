import * as React from "react";

const BOTTOM_THRESHOLD = 100; // px from bottom considered "at bottom"

/**
 * Manages scroll-to-bottom behaviour for a chat-like container.
 *
 * - Scrolls to bottom instantly on mount.
 * - While `isStreaming`: auto-scrolls as content grows.
 * - User scrolling up during streaming disables auto-scroll for that session.
 * - Auto-scroll re-enables automatically at the start of the next session.
 *
 * Attach `containerRef` to the scrollable element and `anchorRef` to an
 * empty `<div>` placed at the very end of the scrollable content.
 */
export function useScrollToBottom(isStreaming: boolean): {
  containerRef: React.RefObject<HTMLDivElement>;
  anchorRef: React.RefObject<HTMLDivElement>;
  scrollToBottom: () => void;
} {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const shouldStickRef = React.useRef(true);
  const prevIsStreamingRef = React.useRef(false);
  const isAtBottom = React.useCallback(() => {
    const el = containerRef.current;

    if (!el) {
      return true;
    }

    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
  }, []);
  const scrollToBottom = React.useCallback(() => {
    const el = containerRef.current;

    if (el) {
      el.scrollTop = el.scrollHeight;
      shouldStickRef.current = true;
    }
  }, []);

  // Keep streaming state in sync and re-enable sticking on each new session.
  React.useLayoutEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;

    if (isStreaming && !wasStreaming) {
      shouldStickRef.current = true;
    }
  });

  // Scroll to absolute bottom on mount (instant, before paint).
  React.useLayoutEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep sticking aligned with the user's current scroll position so
  // non-streaming resizes, like entering edit mode, do not yank the view.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      shouldStickRef.current = isAtBottom();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isAtBottom]);

  // Track streaming state in a ref so the ResizeObserver closure can read it.
  const isStreamingRef = React.useRef(isStreaming);
  React.useLayoutEffect(() => {
    isStreamingRef.current = isStreaming;
  });

  // Observe the content wrapper (anchor's parent) for size changes and
  // scroll to bottom whenever content grows while sticking is enabled.
  // Only auto-scroll during streaming — non-streaming resizes (e.g. entering
  // edit mode) must not yank the viewport away from the edited message.
  React.useEffect(() => {
    const contentEl = anchorRef.current?.parentElement;
    if (!contentEl) return;

    const observer = new ResizeObserver(() => {
      if (shouldStickRef.current && isStreamingRef.current) {
        scrollToBottom();
      }
    });

    observer.observe(contentEl);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { containerRef, anchorRef, scrollToBottom };
}
