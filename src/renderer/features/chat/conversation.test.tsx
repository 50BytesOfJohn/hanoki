// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessageErrorBoundary } from "./conversation";

function ThrowingMessage(): React.ReactNode {
  throw new Error("Cannot read properties of undefined (reading 'type')");
}

afterEach(cleanup);

describe("MessageErrorBoundary", () => {
  it("renders its message untouched when nothing throws", () => {
    render(
      <MessageErrorBoundary messageId="good" resetKey="good:1">
        <div>message body</div>
      </MessageErrorBoundary>,
    );

    expect(screen.getByText("message body")).toBeDefined();
  });

  it("replaces only the failing message and keeps its siblings rendered", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <>
        <MessageErrorBoundary messageId="good-1" resetKey="good-1:1">
          <div>first message</div>
        </MessageErrorBoundary>
        <MessageErrorBoundary messageId="bad" resetKey="bad:1">
          <ThrowingMessage />
        </MessageErrorBoundary>
        <MessageErrorBoundary messageId="good-2" resetKey="good-2:1">
          <div>last message</div>
        </MessageErrorBoundary>
      </>,
    );

    expect(screen.getByText("first message")).toBeDefined();
    expect(screen.getByText("last message")).toBeDefined();
    expect(screen.getByText(/This message could not be displayed/)).toBeDefined();
  });
});
