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

  it.each([
    [
      "protocol-relative with alt",
      "![Mountain at dawn](//cdn.example.com/a.png)",
      "Mountain at dawn · cdn.example.com",
      "Image not loaded: Mountain at dawn, from cdn.example.com",
    ],
    [
      "protocol-relative without alt",
      "![](//cdn.example.com/a.png)",
      "Image not loaded · cdn.example.com",
      "Image not loaded, from cdn.example.com",
    ],
    [
      "file host with alt",
      "![scan](file://files.example/a.png)",
      "scan · files.example",
      "Image not loaded: scan, from files.example",
    ],
    [
      "file host without alt",
      "![](file://files.example/a.png)",
      "Image not loaded · files.example",
      "Image not loaded, from files.example",
    ],
  ])("shows a placeholder for %s", async (_name, text, label, aria) => {
    render(<AssistantMessageTextPart isAnimating={false} text={text} />);
    const row = await screen.findByRole("img", { name: aria });
    expect(row.getAttribute("data-layout")).toBe("block");
    expect(row.textContent).toBe(label);
    expect(
      document.querySelector("img[src^='//'], img[src^='file:'], img[src^='http']"),
    ).toBeNull();
  });
});
