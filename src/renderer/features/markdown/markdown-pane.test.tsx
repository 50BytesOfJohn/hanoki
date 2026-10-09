// @vitest-environment jsdom

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./markdown-pane";

function openedExternalLinks(): string[] {
  const opened: string[] = [];
  Object.assign(window, {
    electronAPI: {
      openExternal(url: string) {
        opened.push(url);
        return Promise.resolve();
      },
    },
  });
  return opened;
}

beforeAll(() => {
  Range.prototype.getClientRects = () => document.createElement("div").getClientRects();
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(cleanup);

describe("MarkdownEditor", () => {
  it("hydrates the selected document without emitting a content update", async () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const view = render(
      <MarkdownEditor
        key="document-a"
        itemId="document-a"
        workspaceId="workspace"
        folderId={null}
        markdown="Alpha persisted content"
        editable
        onChange={onChange}
        onBlur={onBlur}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Markdown rich text editor").textContent).toContain(
        "Alpha persisted content",
      );
    });

    view.rerender(
      <MarkdownEditor
        key="document-b"
        itemId="document-b"
        workspaceId="workspace"
        folderId={null}
        markdown="Beta persisted content"
        editable
        onChange={onChange}
        onBlur={onBlur}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Markdown rich text editor").textContent).toContain(
        "Beta persisted content",
      );
    });

    view.rerender(
      <MarkdownEditor
        key="document-a"
        itemId="document-a"
        workspaceId="workspace"
        folderId={null}
        markdown="Alpha persisted content"
        editable
        onChange={onChange}
        onBlur={onBlur}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Markdown rich text editor").textContent).toContain(
        "Alpha persisted content",
      );
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens an external note link outside the window", async () => {
    const opened = openedExternalLinks();
    render(
      <MarkdownEditor
        itemId="document-link"
        workspaceId="workspace"
        folderId={null}
        markdown="See [the docs](https://example.com/docs)."
        editable={false}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );

    const link = await screen.findByRole("link", { name: "the docs" });
    expect(link.getAttribute("target")).toBeNull();
    link.click();
    expect(opened).toEqual(["https://example.com/docs"]);
  });

  it("keeps a wikilink inside the note", async () => {
    const opened = openedExternalLinks();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MarkdownEditor
          itemId="document-wiki"
          workspaceId="workspace"
          folderId={null}
          markdown="See [[Alpha]]."
          editable={false}
          onChange={vi.fn()}
          onBlur={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Alpha")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(opened).toEqual([]);
  });
});
