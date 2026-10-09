import { describe, expect, it } from "vitest";

import {
  inspectRichText,
  RICH_TEXT_CHECK_LIMIT,
  richTextRoundTripLosesContent,
} from "./rich-text-safety";

const lossy = {
  footnote: "Text with note[^1].\n\n[^1]: The footnote.",
  "inline footnote": "Hello ^[inline note]",
  "inline html": "Hello <span>hi</span> world",
  "inline html styled": 'Hello <span style="color:red">red</span> world',
  "html block": "<details>\n<summary>More</summary>\n\nHidden\n\n</details>",
  "html comment": "Before\n\n<!-- private -->\n\nAfter",
  callout: "> [!note] Title\n> Body",
  "folded callout": "> [!warning]- Watch\n> Body",
  "math inline": "Inline $\\alpha$ here",
  "math subscript": "Value $a_1$ now",
  "math block": "$$\nE = mc^2\n$$",
  "reference link": "See [docs][1].\n\n[1]: https://example.com",
  "definition only": "[1]: https://example.com",
  "image reference": "![shot][pic]\n\n[pic]: img/a.png",
  escapes: "1\\. not a list and \\*not em\\*",
  "tilde fence around backticks": "~~~\n```\ninner\n```\n~~~",
  "escaped pipe": "| a \\| b | c |\n| --- | --- |\n| 1 | 2 |",
  "ordered task": "1. [ ] a\n2. [x] b",
  "toml frontmatter": "+++\ntitle = 'x'\n+++\nBody",
  "pipe in code": "| a | b |\n| --- | --- |\n| `a\\|b` | c |",
  "hash escape": "\\#notatag",
  "embed escape": "\\![[x]]",
  "extra table cell": "| a | b |\n| --- | --- |\n| 1 | 2 | 3 extra |",
  "custom tag": "<foo>bar</foo>",
  "processing instruction": "<?php echo 1; ?>",
  "cdata section": "<![CDATA[x]]>",
} as const;

const safe = {
  frontmatter: "---\ntitle: x\ntags: [a, b]\n---\nBody text",
  "frontmatter only": "---\ntitle: Trip\n---\n",
  "blank lines": "a\n\n\nb",
  "qa heading": "## Q&A",
  "tilde dollar": "Costs ~$40",
  "bare less-than": "a<b",
  "less and greater": "x<y and y>z",
  arrow: "5 -> 7",
  heart: "I <3 this",
  generic: "List<String>",
  amp: "Tom & Jerry",
  "see bracket": "see [1]",
  "empty box": "[ ] not a list",
  stars: "2 * 3 * 4",
  snake: "snake_case_name",
  "loose list": "- a\n\n- b",
  "paren list": "1) a",
  "backslash break": "line\\\nline",
  "two space break": "line one  \nline two",
  "indent code": "    code",
  "closing hash": "## Title ##",
  "gfm table": "Intro\n\n| a | b |\n| --- | --- |\n| one | two |\n\nOutro",
  "aligned table": "| left | right |\n| :--- | ---: |\n| x | y |",
  "task list": "- [ ] todo\n- [x] done",
  "nested tasks": "- [ ] a\n  - [x] b",
  "image relative": '![alt](img/a.png "t")',
  "image remote": "![alt](https://cdn.example.com/a.png)",
  "image sentence": "See ![alt](img/a.png) here",
  "underscore emph": "_em_ and __strong__",
  "plus bullets": "+ one\n+ two",
  "adjacent bullet styles": "- one\n\n+ two\n\n* three",
  "tilde fence": "~~~\ncode\n~~~",
  "hr ***": "a\n\n***\n\nb",
  autolink: "<https://example.com> and https://bare.example.com",
  "setext heading": "Title\n=====",
  wikilink: "See [[Work/Standup|standup]]",
  "han11 note": "The plan is in [[Topic]].\n\n\n## Details\n\nBring the notes.",
  "html inside a code fence": "```\n<span>hi</span>\n```",
  "image inside a code fence": "```\n![alt](https://cdn.example.com/a.png)\n```",
  "footnote inside a code fence": "```\nnote[^1]\n```",
  "plus plus": "C++ and C++",
  increment: "x++ y++",
  "wikilink heading": "See [[Note#heading|alias]]",
  embed: "![[file.png]]",
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

  it("treats a collapsed image as lossy and a round-tripped image as safe", () => {
    const images = [
      "![alt](img/a.png)",
      "![alt](https://cdn.example.com/a.png)",
      "![cover](Attachments/cover.png)",
      '![alt](img/a.png "t")',
      "![](note.png)",
    ] as const;
    for (const source of images) {
      expect(richTextRoundTripLosesContent(source, "alt")).toBe(true);
      expect(inspectRichText(source).losesContent).toBe(false);
    }
  });

  it("locks notes above the check limit without parsing them", () => {
    const started = performance.now();
    const inspection = inspectRichText(`${"a".repeat(RICH_TEXT_CHECK_LIMIT + 1)}`);
    expect(performance.now() - started).toBeLessThan(50);
    expect(inspection).toEqual({ losesContent: true, summary: null });
    expect(inspectRichText("a".repeat(RICH_TEXT_CHECK_LIMIT)).losesContent).toBe(false);
  });

  it("compares task state, task text, and wikilink parts", () => {
    expect(richTextRoundTripLosesContent("- [x] keep", "- [ ] keep")).toBe(true);
    expect(richTextRoundTripLosesContent("- [ ] keep", "- [ ] ")).toBe(true);
    expect(
      richTextRoundTripLosesContent("See [[Note#heading|alias]]", "See [[Note#heading|other]]"),
    ).toBe(true);
    expect(
      richTextRoundTripLosesContent("See [[Note#heading|alias]]", "See [[Other#heading|alias]]"),
    ).toBe(true);
  });

  it("scans a long math-like line quickly", () => {
    const started = performance.now();
    inspectRichText(`${"\\".repeat(40)}$`);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it("names the detected constructs without putting them in the banner copy", () => {
    const note = [
      "Hello <span>hi</span>",
      "",
      "Text[^1]",
      "",
      "[^1]: Note.",
      "",
      "> [!note] Title",
    ].join("\n");

    expect(inspectRichText(note)).toEqual({
      losesContent: true,
      summary: "Has HTML, a footnote and a callout.",
    });
  });
});
