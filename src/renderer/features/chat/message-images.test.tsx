// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssistantMessageTextPart } from "./message";

afterEach(cleanup);

describe("assistant remote images", () => {
  it("shows a placeholder for a remote image in a reply", async () => {
    render(
      <AssistantMessageTextPart
        isAnimating={false}
        text={[
          "![Mountain at dawn](https://www.example.com/a.png)",
          "",
          "See ![peak](https://www.example.com/b.png) now.",
        ].join("\n")}
      />,
    );

    const block = await screen.findByRole("img", {
      name: "Image not loaded: Mountain at dawn, from example.com",
    });
    expect(block.getAttribute("data-layout")).toBe("block");
    expect(block.textContent).toBe("Mountain at dawn · example.com");
    expect(block.textContent).not.toContain("www.");
    expect(block.textContent).not.toContain("/a.png");

    const inline = screen.getByRole("img", {
      name: "Image not loaded: peak, from example.com",
    });
    expect(inline.getAttribute("data-layout")).toBe("inline");
    expect(inline.textContent).toBe("peak");
    expect(document.querySelector("img[src^='http']")).toBeNull();
    expect(document.querySelector("a[href^='http']")).toBeNull();
  });
});
