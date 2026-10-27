import { describe, expect, it } from "vitest";

import {
  inspectRichText,
  RICH_TEXT_CHECK_LIMIT,
  richTextRoundTripLosesContent,
} from "./rich-text-safety";

const lossy = {
  frontmatter: "---\ntitle: x\ntags: [a, b]\n---\nBody text",
  "gfm table": "Intro\n\n| a | b |\n| --- | --- |\n| one | two |\n\nOutro",
  "task list": "- [ ] todo\n- [x] done",
  footnote: "Text with note[^1].\n\n[^1]: The footnote.",
  "inline html": "Hello <span>hi</span> world",
  "inline html styled": 'Hello <span style="color:red">red</span> world',
  "html block": "<details>\n<summary>More</summary>\n\nHidden\n\n</details>",
  "html comment": "Before\n\n<!-- private -->\n\nAfter",
  callout: "> [!note] Title\n> Body",
  "image relative": '![alt](img/a.png "t")',
  "image remote": "![alt](https://cdn.example.com/a.png)",
  "image attachment": "![cover](Attachments/cover.png)",
  "image empty alt": "![](note.png)",
  "image reference": "![shot][pic]",
  "reference link": "See [docs][1].\n\n[1]: https://example.com",
  escapes: "1\\. not a list and \\*not em\\*",
  "tilde fence around backticks": "~~~\n```\ninner\n```\n~~~",
} as const;

const safe = {
  "underscore emph": "_em_ and __strong__",
  "plus bullets": "+ one\n+ two",
  "star bullets": "* one\n* two",
  "tilde fence": "~~~\ncode\n~~~",
  "hr ***": "a\n\n***\n\nb",
  "hr ___": "a\n\n___\n\nb",
  "trailing newline": "Body\n",
  autolink: "<https://example.com> and https://bare.example.com",
  "email autolink": "<user@example.com>",
  www: "www.example.com",
  "setext heading": "Title\n=====",
  "setext h2": "Title\n-----",
  crlf: "Hello\r\n\r\n- item\r\n",
  plain: "Hello world",
  heading: "# Title\n\nBody",
  "ends list": "- one\n- two",
  "ends code": "```\ncode\n```",
  "obsidian comment": "Visible %%hidden%% text",
  highlight: "This is ==important==",
  embed: "![[Diagram.png]]",
  "wikilink alias": "See [[Work/Standup|standup]]",
  "nested list": "- a\n  - b\n    - c",
  "ordered start 3": "3. three\n4. four",
  "hard break": "line one  \nline two",
  "blank lines": "a\n\n\n\nb",
  link: "See [docs](https://example.com).",
  "inline code underscore": "use `_em_` literally",
  "code fence underscore": "```\n_em_\n```",
  "html inside a code fence": "```\n<span>hi</span>\n```",
  "image inside a code fence": "```\n![alt](https://cdn.example.com/a.png)\n```",
} as const;

describe("inspectRichText", () => {
  it.each(Object.entries(lossy))("treats %s as lossy", (_name, markdown) => {
    expect(inspectRichText(markdown).losesContent).toBe(true);
  });

  it.each(Object.entries(safe))("treats %s as safe", (_name, markdown) => {
    expect(inspectRichText(markdown).losesContent).toBe(false);
  });

  it("treats stripped and escaped HTML as content loss", () => {
    const inline = "Hello <span>hi</span> world";
    expect(richTextRoundTripLosesContent(inline, "Hello hi world")).toBe(true);
    expect(richTextRoundTripLosesContent(inline, "Hello &lt;span&gt;hi&lt;/span&gt; world")).toBe(
      true,
    );

    const block = "<details>\n<summary>More</summary>\n\nHidden\n\n</details>";
    expect(richTextRoundTripLosesContent(block, "More\n\nHidden")).toBe(true);
    expect(
      richTextRoundTripLosesContent(
        block,
        "&lt;details&gt;\n&lt;summary&gt;More&lt;/summary&gt;\n\nHidden\n\n&lt;/details&gt;",
      ),
    ).toBe(true);

    const comment = "Before\n\n<!-- private -->\n\nAfter";
    expect(richTextRoundTripLosesContent(comment, "Before\n\nAfter")).toBe(true);
    expect(
      richTextRoundTripLosesContent(comment, "Before\n\n&lt;!-- private --&gt;\n\nAfter"),
    ).toBe(true);
  });

  it("treats every image URL as lossy when the picture collapses to its alt text", () => {
    const images = [
      ["![alt](img/a.png)", "alt"],
      ["![alt](https://cdn.example.com/a.png)", "alt"],
      ["![cover](Attachments/cover.png)", "cover"],
      ['![alt](img/a.png "t")', "alt"],
      ["![](note.png)", ""],
      ["![shot][pic]", "shot"],
    ] as const;
    for (const [source, collapsed] of images) {
      expect(richTextRoundTripLosesContent(source, collapsed)).toBe(true);
      expect(inspectRichText(source).losesContent).toBe(true);
    }
  });

  it("locks notes above the check limit without parsing them", () => {
    const started = performance.now();
    const inspection = inspectRichText(`${"a".repeat(RICH_TEXT_CHECK_LIMIT + 1)}`);
    expect(performance.now() - started).toBeLessThan(50);
    expect(inspection).toEqual({ losesContent: true, summary: null });
    expect(inspectRichText("a".repeat(RICH_TEXT_CHECK_LIMIT)).losesContent).toBe(false);
  });

  it("names the detected constructs without putting them in the banner copy", () => {
    const note = [
      "---",
      "title: Trip",
      "---",
      "",
      "| a | b |",
      "| --- | --- |",
      "| one | two |",
      "",
      "- [ ] passport",
      "- [x] tickets",
    ].join("\n");

    expect(inspectRichText(note)).toEqual({
      losesContent: true,
      summary: "Has frontmatter, a table and task boxes.",
    });
  });
});
