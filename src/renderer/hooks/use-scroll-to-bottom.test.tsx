// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useScrollToBottom } from "./use-scroll-to-bottom";

const CLIENT_HEIGHT = 500;

let resizeCallbacks: Array<() => void> = [];
let nextChatId = 0;

class ResizeObserverStub {
  private readonly callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
    resizeCallbacks.push(callback);
  }

  observe() {}

  disconnect() {
    resizeCallbacks = resizeCallbacks.filter((callback) => callback !== this.callback);
  }
}

interface ChatProps {
  chatId: string;
  isActive?: boolean;
  isStreaming?: boolean;
  onScrollToBottom?: (scrollToBottom: () => void) => void;
}

function Chat({ chatId, isActive = true, isStreaming = false, onScrollToBottom }: ChatProps) {
  const { anchorRef, containerRef, scrollToBottom } = useScrollToBottom(
    chatId,
    isStreaming,
    isActive,
  );
  onScrollToBottom?.(scrollToBottom);

  return (
    <div ref={containerRef} data-testid="container">
      <div data-testid="content">
        <div data-chat-message-id="message-1" data-testid="message">
          message text
        </div>
        <div data-testid="nested" />
        <div ref={anchorRef} />
      </div>
    </div>
  );
}

/** Renders a chat whose layout the test controls, since jsdom computes no geometry. */
function setup(props: Omit<ChatProps, "chatId"> = {}) {
  const chatId = `chat-${nextChatId++}`;
  let scrollToBottom = () => {};
  const chat = (next: Omit<ChatProps, "chatId">) => (
    <Chat
      chatId={chatId}
      {...props}
      {...next}
      onScrollToBottom={(value) => {
        scrollToBottom = value;
      }}
    />
  );
  const view = render(chat({}));
  const container = view.getByTestId("container") as HTMLDivElement;
  const content = view.getByTestId("content");
  let scrollHeight = 2000;
  let scrollTop = container.scrollTop;

  Object.defineProperties(container, {
    clientHeight: { configurable: true, get: () => CLIENT_HEIGHT },
    scrollHeight: { configurable: true, get: () => scrollHeight },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.min(value, scrollHeight - CLIENT_HEIGHT);
      },
    },
  });
  vi.spyOn(content, "getBoundingClientRect").mockImplementation(
    () => ({ height: scrollHeight }) as DOMRect,
  );

  const resize = (nextScrollHeight: number) => {
    scrollHeight = nextScrollHeight;
    resizeCallbacks.forEach((callback) => callback());
  };

  // Settles on the mocked layout, leaving the reader following at the bottom.
  resize(scrollHeight);

  return {
    container,
    getMaxScrollTop: () => scrollHeight - CLIENT_HEIGHT,
    getScrollTop: () => scrollTop,
    nested: view.getByTestId("nested"),
    message: view.getByTestId("message"),
    rerender: (next: Omit<ChatProps, "chatId">) => view.rerender(chat(next)),
    resize,
    scrollReaderTo: (value: number) => {
      scrollTop = value;
      fireEvent.scroll(container);
    },
    scrollToBottom: () => act(() => scrollToBottom()),
  };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.getSelection()?.removeAllRanges();
  resizeCallbacks = [];
});

describe("useScrollToBottom", () => {
  it("follows new content while streaming", () => {
    const chat = setup({ isStreaming: true });

    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(chat.getMaxScrollTop());
  });

  it("stops following after even a small scroll up", () => {
    const chat = setup({ isStreaming: true });

    chat.scrollReaderTo(chat.getMaxScrollTop() - 10);
    const readerScrollTop = chat.getScrollTop();
    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(readerScrollTop);
  });

  it("stops following on wheel up, before the scroll event arrives", () => {
    const chat = setup({ isStreaming: true });

    fireEvent.wheel(chat.container, { deltaY: -1 });
    const readerScrollTop = chat.getScrollTop();
    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(readerScrollTop);
  });

  it("keeps following when a scrolled nested element consumes the wheel", () => {
    const chat = setup({ isStreaming: true });
    chat.nested.scrollTop = 40;

    fireEvent.wheel(chat.nested, { deltaY: -1 });
    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(chat.getMaxScrollTop());
  });

  it("keeps following when the wheel has nothing to scroll", () => {
    const chat = setup({ isStreaming: true });
    chat.resize(CLIENT_HEIGHT);

    fireEvent.wheel(chat.container, { deltaY: -1 });
    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(chat.getMaxScrollTop());
  });

  it("does not pull the reader down when a stream starts", () => {
    const chat = setup();
    chat.scrollReaderTo(300);

    chat.rerender({ isStreaming: true });
    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(300);
  });

  it("resumes following when the reader scrolls back to the bottom", () => {
    const chat = setup({ isStreaming: true });
    chat.scrollReaderTo(300);

    chat.scrollReaderTo(chat.getMaxScrollTop() - 10);
    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(chat.getMaxScrollTop());
  });

  it("does not resume following on a scroll down that stops short of the bottom", () => {
    const chat = setup({ isStreaming: true });
    chat.scrollReaderTo(300);

    chat.scrollReaderTo(400);
    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(400);
  });

  it("resumes following through scrollToBottom", () => {
    const chat = setup({ isStreaming: true });
    chat.scrollReaderTo(300);

    chat.scrollToBottom();
    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(chat.getMaxScrollTop());
  });

  it("keeps following when shrinking content clamps the scroll position", () => {
    const chat = setup({ isStreaming: true });

    chat.resize(1800);
    fireEvent.scroll(chat.container);
    chat.resize(1900);

    expect(chat.getScrollTop()).toBe(chat.getMaxScrollTop());
  });

  it("resumes following when content shrinks to the reader's position", () => {
    const chat = setup({ isStreaming: true });
    chat.scrollReaderTo(1000);

    chat.resize(1500);
    chat.resize(1600);

    expect(chat.getScrollTop()).toBe(chat.getMaxScrollTop());
  });

  it("stops following while message text is being drag-selected", () => {
    const chat = setup({ isStreaming: true });
    const readerScrollTop = chat.getScrollTop();

    fireEvent.pointerDown(chat.message);
    window.getSelection()?.selectAllChildren(chat.message);
    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(readerScrollTop);
  });

  it("keeps following after a drag selection ends", () => {
    const chat = setup({ isStreaming: true });

    fireEvent.pointerDown(chat.message);
    fireEvent.pointerUp(window);
    window.getSelection()?.selectAllChildren(chat.message);
    chat.resize(2100);

    expect(chat.getScrollTop()).toBe(chat.getMaxScrollTop());
  });

  it("keeps the reading position across a hidden tab collapsing the content", async () => {
    const chat = setup();
    chat.scrollReaderTo(800);
    await new Promise(requestAnimationFrame);

    chat.rerender({ isActive: false });
    chat.resize(CLIENT_HEIGHT);
    fireEvent.scroll(chat.container);
    chat.resize(2000);
    chat.rerender({ isActive: true });

    expect(chat.getScrollTop()).toBe(800);
  });

  it("disables native scroll anchoring only while following", () => {
    const chat = setup({ isStreaming: true });
    expect(chat.container.style.overflowAnchor).toBe("none");

    chat.scrollReaderTo(300);

    expect(chat.container.style.overflowAnchor).toBe("");
  });
});
