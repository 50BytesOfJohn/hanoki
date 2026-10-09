import { describe, expect, it } from "vitest";

import { joinFrontmatter, splitFrontmatter } from "./frontmatter";

describe("frontmatter", () => {
  it("round-trips a YAML block byte for byte", () => {
    const markdown = "---\ntitle: x\ntags: [a, b]\n---\nBody text";
    const parts = splitFrontmatter(markdown);
    expect(parts.frontmatter).toBe("---\ntitle: x\ntags: [a, b]\n---\n");
    expect(parts.body).toBe("Body text");
    expect(joinFrontmatter(parts.frontmatter, parts.body)).toBe(markdown);
  });

  it("keeps a BOM and CRLF line endings", () => {
    const markdown = "\uFEFF---\r\ntitle: x\r\n---\r\nBody";
    const parts = splitFrontmatter(markdown);
    expect(parts.frontmatter).toBe("\uFEFF---\r\ntitle: x\r\n---\r\n");
    expect(parts.body).toBe("Body");
    expect(joinFrontmatter(parts.frontmatter, parts.body)).toBe(markdown);
  });

  it("accepts a dot closer", () => {
    const markdown = "---\ntitle: x\n...\nBody";
    const parts = splitFrontmatter(markdown);
    expect(parts.frontmatter).toBe("---\ntitle: x\n...\n");
    expect(parts.body).toBe("Body");
  });

  it("leaves an unclosed block in the body", () => {
    const markdown = "---\ntitle: x\nBody";
    expect(splitFrontmatter(markdown)).toEqual({ frontmatter: null, body: markdown });
  });

  it("does not treat a later thematic break as frontmatter", () => {
    const markdown = "Body\n\n---\n\nMore";
    expect(splitFrontmatter(markdown)).toEqual({ frontmatter: null, body: markdown });
  });

  it("splits empty frontmatter and a frontmatter-only note", () => {
    expect(splitFrontmatter("---\n---\nBody")).toEqual({
      frontmatter: "---\n---\n",
      body: "Body",
    });
    const only = "---\ntitle: x\n---\n";
    const parts = splitFrontmatter(only);
    expect(parts.frontmatter).toBe(only);
    expect(parts.body).toBe("");
    expect(joinFrontmatter(parts.frontmatter, "Next")).toBe(`${only}Next`);
  });
});
