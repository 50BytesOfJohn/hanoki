import { describe, expect, it } from "vitest";

import { stripRemoteAssistantImages } from "./assistant-images";

describe("stripRemoteAssistantImages", () => {
  it("keeps http images and strips other remote images", () => {
    const output = stripRemoteAssistantImages(
      [
        "See ![cat](https://example.com/cat.png) and ![dog](http://example.com/dog.png).",
        'Also <img src="https://cdn.example/a.png" alt="remote">.',
        "Keep ![local](./shot.png) and ![inline](data:image/png;base64,aaaa).",
        '<img src="data:image/png;base64,bbbb" alt="pixels">',
        "![cdn](//cdn.example/x.png)",
      ].join("\n"),
    );

    expect(output).toContain("![cat](https://example.com/cat.png)");
    expect(output).toContain("![dog](http://example.com/dog.png)");
    expect(output).toContain('src="https://cdn.example/a.png"');
    expect(output).not.toContain("//cdn.example/x.png");
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
        "See `![b](https://example.com/b.png)` then ![c](//cdn.example/a(b).png).",
        "Keep ![d](https://example.com/a(b).png).",
      ].join("\n"),
    );
    expect(output).toContain("![a](https://example.com/a.png)");
    expect(output).toContain("`![b](https://example.com/b.png)`");
    expect(output).not.toContain("//cdn.example/a(b).png");
    expect(output).toContain("then c.");
    expect(output).toContain("![d](https://example.com/a(b).png)");
  });

  it("keeps a private-use placeholder that is not this call's marker", () => {
    const decoy = "\uE0000\uE001";
    const output = stripRemoteAssistantImages(
      `${decoy} ![a](https://example.com/a.png)\n\`\`\`\n${decoy}\n\`\`\``,
    );
    expect(output).toContain(decoy);
    expect(output.match(/\uE0000\uE001/g)).toHaveLength(2);
    expect(output).toContain("![a](https://example.com/a.png)");
    expect(output).toContain("```\n\uE0000\uE001\n```");
  });
});
