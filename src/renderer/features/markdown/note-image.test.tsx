// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NoteImageFrame } from "./note-image";

afterEach(cleanup);

describe("NoteImageFrame", () => {
  it("shows the file name when the file cannot be loaded", async () => {
    render(
      <NoteImageFrame
        src="hanoki-asset://asset/workspace/note?src=missing.png"
        alt="Fern"
        path="notes/missing.png"
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Fern" }));
    const missing = screen.getByRole("img", { name: "Image not found: Fern, missing.png" });
    expect(missing.textContent).toBe("Fern · missing.png");
    expect(missing.className).toContain("text-muted-foreground");
    expect(missing.className).not.toContain("destructive");
    fireEvent.focus(missing);
    expect(await screen.findByText("notes/missing.png")).toBeTruthy();
    expect(screen.getByText("Image not found")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Fern" })).toBeNull();
  });

  it("shows a broken image when there is no source", () => {
    render(<NoteImageFrame src="" alt="" path="" />);
    const missing = screen.getByRole("img", { name: "Image not found" });
    expect(missing.textContent).toContain("Image not found");
    expect(missing.className).not.toContain("destructive");
  });
});
