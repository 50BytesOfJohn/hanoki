import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { countMarkdownWords, countPlainTextWords } from "./word-count";

const cases: Array<[string, number]> = [
  ["---\ntitle: Chapter One\ntags: [a, b]\n---\n# Heading here\n\nBody text.", 4],
  ['Hello [two words](https://x.y "t t") and ![alt text](i.png)', 4],
  ["See [[Note Title]] and [[Folder/Deep|alias]]", 5],
  ["```js\nconst a = 1;\n```\nafter `inline code` end", 4],
  ["- item one\n- [ ] task two\n1. first\n2) second", 6],
  ["| a | b |\n|---|:---:|\n| one | two |", 4],
  ['<div class="x">html text</div> <!-- hidden -->', 2],
  ["well-known don't it’s 3.14 1,000 2026-10-09", 6],
  ["🙂 👍🏽 — ** emoji", 1],
  ["visit https://example.com/a-b?c=d now", 3],
  ["Hello 世界", 3],
  ["日本語の文章です。", 8],
  ["안녕하세요 저는 학생입니다", 3],
  ["ไทยภาษา", 2],
  ["> quoted **bold** _it_", 3],
];

describe("countMarkdownWords", () => {
  it.each(cases)("counts %#", (source, expected) => {
    expect(countMarkdownWords(source)).toBe(expected);
  });

  it("does not count emoji-only tokens", () => {
    expect(countMarkdownWords("🙂")).toBe(0);
    expect(countMarkdownWords("👍🏽")).toBe(0);
    expect(countMarkdownWords("—")).toBe(0);
    expect(countPlainTextWords("🙂 👍🏽")).toBe(0);
  });

  it("counts inline code and skips fenced code", () => {
    expect(countMarkdownWords("say `inline code` please")).toBe(4);
    expect(countMarkdownWords("```\nconst secret = 1;\n```")).toBe(0);
    expect(countMarkdownWords("~~~\nnot prose\n~~~")).toBe(0);
    expect(countMarkdownWords("````\n```\ninner\n```\n````\nafter")).toBe(1);
    expect(countMarkdownWords("```\nunclosed fence\nstill code")).toBe(0);
  });

  it("counts an autolink as one word", () => {
    expect(countMarkdownWords("see <https://example.com/a> now")).toBe(3);
    expect(countMarkdownWords("<https://example.com>")).toBe(1);
  });

  it("skips only a closed leading frontmatter block", () => {
    expect(countMarkdownWords("---\ntitle: Chapter One\n# Heading here")).toBe(5);
    expect(countMarkdownWords("Body\n\n---\n\nMore words")).toBe(3);
    expect(countMarkdownWords("\uFEFF---\ntitle: Chapter One\n---\nBody text.")).toBe(2);
    expect(countMarkdownWords("---\ntitle: Chapter One\r\n---\r\nBody text.")).toBe(2);
  });

  it("skips html comments that span lines", () => {
    expect(countMarkdownWords("before <!--\nhidden words\n--> after")).toBe(2);
    expect(countMarkdownWords("visible <!-- hidden\nstill hidden")).toBe(1);
  });

  it("can count a leading fence as text when frontmatter scanning is off", () => {
    expect(countMarkdownWords("---\ntitle: Chapter One\n---\nBody", { frontmatter: false })).toBe(
      4,
    );
  });

  it("does not open a fence when a backtick info string contains a backtick", () => {
    expect(countMarkdownWords("```x``` one two three\n\nfour five")).toBe(6);
  });

  it("skips a fenced block inside a blockquote", () => {
    expect(countMarkdownWords("> ```\n> code words here\n> ```\n> after")).toBe(1);
  });

  it("does not count keycaps, script blocks, nbsp joins, or footnote markers", () => {
    expect(countMarkdownWords("1️⃣")).toBe(0);
    expect(countMarkdownWords("<script>\nhidden words\n</script>\nvisible")).toBe(1);
    expect(countMarkdownWords("a&nbsp;b")).toBe(2);
    expect(countMarkdownWords("fish &amp; chips")).toBe(2);
    expect(countMarkdownWords("&copy;")).toBe(0);
    expect(countMarkdownWords("&#169;")).toBe(0);
    expect(countMarkdownWords("see [^1] note\n\n[^1]: the note text")).toBe(5);
    expect(countMarkdownWords("x<y and z>w")).toBe(3);
  });

  it("decodes letter and apostrophe entities into the word", () => {
    expect(countMarkdownWords("na&iuml;ve")).toBe(1);
    expect(countPlainTextWords("na&iuml;ve")).toBe(1);
    expect(countMarkdownWords("don&rsquo;t")).toBe(1);
    expect(countMarkdownWords("don&lsquo;t")).toBe(1);
    expect(countMarkdownWords("don&apos;t")).toBe(1);
    expect(countMarkdownWords("don&#39;t")).toBe(1);
    expect(countMarkdownWords("don&#8217;t")).toBe(1);
    expect(countMarkdownWords("na&#239;ve")).toBe(1);
    expect(countMarkdownWords("`a&amp;b` x")).toBe(2);
  });

  it("counts Korean by whitespace and Japanese per character", () => {
    expect(countPlainTextWords("안녕하세요 세계")).toBe(2);
    expect(countMarkdownWords("안녕하세요 세계")).toBe(2);
    expect(countMarkdownWords("日本語の文章です。")).toBe(8);
  });

  it("counts 5 MB of prose under a regression bound", () => {
    const paragraph =
      "Lorem ipsum **dolor** sit [amet](https://x.y), consectetur `adipiscing` elit. [[Some Note|alias]] ";
    const unit = `${paragraph.repeat(20)}\n\n`;
    const big = unit.repeat(Math.ceil(5_000_000 / unit.length));
    const started = performance.now();
    const words = countMarkdownWords(big);
    expect(words).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("counts 5 MB of table text without the prose budget", () => {
    const unit = "| one | two | three |\n| --- | --- | --- |\n| alpha | beta | gamma |\n";
    const big = unit.repeat(Math.ceil(5_000_000 / unit.length));
    const started = performance.now();
    const words = countMarkdownWords(big);
    expect(words).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(1_500);
  });
});

describe("countPlainTextWords", () => {
  it("counts wikilink display text, emoji, and mixed CJK", () => {
    expect(countPlainTextWords("Note Title")).toBe(2);
    expect(countPlainTextWords("alias")).toBe(1);
    expect(countPlainTextWords("🙂")).toBe(0);
    expect(countPlainTextWords("Hello 世界")).toBe(3);
    expect(countPlainTextWords("Hello世界")).toBe(3);
  });
});

describe("goal ring source", () => {
  it("does not use Progress, Meter, or success color", () => {
    const source = readFileSync(
      new URL("../../renderer/features/markdown/goal-ring.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/components\/ui\/progress/);
    expect(source).not.toMatch(/components\/ui\/meter/);
    expect(source).not.toMatch(/--success/);
    expect(source).not.toMatch(/\bProgress\b/);
    expect(source).not.toMatch(/\bMeter\b/);
  });
});
