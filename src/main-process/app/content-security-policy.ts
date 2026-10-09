import { readFileSync } from "node:fs";
import path from "node:path";

export function rendererContentSecurityPolicy(mode: "dev" | "prod"): string {
  const scriptSrc = mode === "dev" ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  return [
    "default-src 'self'",
    scriptSrc,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: file:",
    "font-src 'self' data:",
    "connect-src 'self' http://127.0.0.1:*",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function rendererIndexHtmlPath(): string {
  return path.join(process.cwd(), "src/renderer/index.html");
}

export function rendererIndexContentSecurityPolicy(): string | undefined {
  const html = readFileSync(rendererIndexHtmlPath(), "utf8");
  const match = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
  return match?.[1];
}
