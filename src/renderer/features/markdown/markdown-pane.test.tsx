// @vitest-environment jsdom

import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./markdown-pane";

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

  it.each([
    ["rich text", true],
    ["preview", false],
  ])("loads a note-relative image in %s", async (_label, editable) => {
    const onChange = vi.fn();
    render(
      <MarkdownEditor
        itemId="document-a"
        workspaceId="workspace"
        folderId={null}
        markdown={"![Fern](fern.png)"}
        editable={editable}
        onChange={onChange}
        onBlur={vi.fn()}
      />,
    );

    const image = await screen.findByRole("img", { name: "Fern" });
    expect(image.getAttribute("src")).toContain("hanoki-asset:");
    expect(image.getAttribute("src")).toContain("fern.png");
    const saved = onChange.mock.calls.map((call) => String(call[0])).join("\n");
    expect(saved).not.toContain("hanoki-asset:");
    if (editable) expect(saved).toContain("![Fern](fern.png)");

    fireEvent.error(image);
    expect(await screen.findByText("Image not found")).toBeTruthy();
  });

  it("loads an image inside a sentence", async () => {
    render(
      <MarkdownEditor
        itemId="document-a"
        workspaceId="workspace"
        folderId={null}
        markdown={"See ![Fern](fern.png) today."}
        editable={false}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );
    const image = await screen.findByRole("img", { name: "Fern" });
    expect(image.getAttribute("src")).toContain("hanoki-asset:");
    expect(screen.getByLabelText("Markdown preview").textContent).toContain("today");
  });
});
