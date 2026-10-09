import { describe, expect, it } from "vitest";

import { stripRemoteAssistantImages } from "./assistant-images";

describe("stripRemoteAssistantImages", () => {
  it("removes remote markdown and html images from assistant output", () => {
    const output = stripRemoteAssistantImages(
      [
        "See ![cat](https://example.com/cat.png) and ![dog](http://example.com/dog.png).",
        'Also <img src="https://cdn.example/a.png" alt="remote">.',
        "Keep ![local](./shot.png) and ![inline](data:image/png;base64,aaaa).",
        '<img src="data:image/png;base64,bbbb" alt="pixels">',
        "![cdn](//cdn.example/x.png)",
      ].join("\n"),
    );

    expect(output).not.toContain("https://example.com/cat.png");
    expect(output).not.toContain("http://example.com/dog.png");
    expect(output).not.toContain("https://cdn.example/a.png");
    expect(output).not.toContain("//cdn.example/x.png");
    expect(output).toContain("cat");
    expect(output).toContain("dog");
    expect(output).toContain("remote");
    expect(output).toContain("![local](./shot.png)");
    expect(output).toContain("![inline](data:image/png;base64,aaaa)");
    expect(output).toContain('src="data:image/png;base64,bbbb"');
  });

  it("strips file images with a host and keeps empty-host file images", () => {
    const output = stripRemoteAssistantImages(
      "![remote](file://evil.example/a.png) ![local](file:///tmp/a.png)",
    );
    expect(output).not.toContain("file://evil.example");
    expect(output).toContain("remote");
    expect(output).toContain("![local](file:///tmp/a.png)");
  });

  it("leaves fenced and inline code alone and consumes parenthesized urls", () => {
    const output = stripRemoteAssistantImages(
      [
        "```",
        "![a](https://example.com/a.png)",
        "```",
        "See `![b](https://example.com/b.png)` then ![c](https://example.com/a(b).png).",
      ].join("\n"),
    );
    expect(output).toContain("![a](https://example.com/a.png)");
    expect(output).toContain("`![b](https://example.com/b.png)`");
    expect(output).not.toContain("example.com/a(b).png");
    expect(output).not.toContain("(b).png)");
    expect(output).toContain("c");
  });
});
