// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NoteImageFrame } from "./note-image";

afterEach(cleanup);

describe("NoteImageFrame", () => {
  it("shows a broken image when the file cannot be loaded", () => {
    render(<NoteImageFrame src="hanoki-asset://asset/workspace/note?src=missing.png" alt="Fern" />);
    fireEvent.error(screen.getByRole("img", { name: "Fern" }));
    expect(screen.getByRole("img", { name: "Fern, image not found" }).textContent).toContain(
      "Image not found",
    );
    expect(screen.queryByRole("img", { name: "Fern" })).toBeNull();
  });

  it("shows a broken image when there is no source", () => {
    render(<NoteImageFrame src="" alt="" />);
    expect(screen.getByRole("img", { name: "Image not found" }).textContent).toContain(
      "Image not found",
    );
  });
});
