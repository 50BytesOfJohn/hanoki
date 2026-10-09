import { lexer, parser } from "marked";

export function MarkdownPreview({ markdown }: { markdown: string }) {
  return <div dangerouslySetInnerHTML={{ __html: parser(lexer(markdown)) }} />;
}

export function FrontmatterBlock({ source }: { source: string }) {
  return (
    <details open className="mx-auto w-full max-w-3xl px-7 pt-5">
      <summary className="cursor-pointer select-none text-[12px] text-muted-foreground">
        Properties <span className="text-muted-foreground/70">· edit in Markdown</span>
      </summary>
      <pre
        aria-label="Note properties"
        className="mt-2 overflow-auto rounded-md bg-background-secondary px-3 py-2 font-mono text-[12px] leading-5 text-muted-foreground"
      >
        {source.trimEnd()}
      </pre>
    </details>
  );
}
