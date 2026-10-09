import { readFileSync } from "node:fs";
import path from "node:path";

function localServerConnectSrc(port: number | null): string {
  if (port == null || !Number.isInteger(port) || port < 1 || port > 65535) {
    return "connect-src 'self'";
  }
  return `connect-src 'self' http://127.0.0.1:${port}`;
}

function rendererContentSecurityPolicyParts(mode: "dev" | "prod", connectSrc: string): string {
  const scriptSrc = mode === "dev" ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  return [
    "default-src 'self'",
    scriptSrc,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    connectSrc,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function rendererContentSecurityPolicy(mode: "dev" | "prod"): string {
  return rendererContentSecurityPolicyParts(mode, "connect-src 'self' http://127.0.0.1:*");
}

export function rendererHeaderContentSecurityPolicy(
  mode: "dev" | "prod",
  port: number | null,
): string {
  return rendererContentSecurityPolicyParts(mode, localServerConnectSrc(port));
}

export function rendererIndexHtmlPath(): string {
  return path.join(process.cwd(), "src/renderer/index.html");
}

export function rendererIndexContentSecurityPolicy(): string | undefined {
  const html = readFileSync(rendererIndexHtmlPath(), "utf8");
  const match = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
  return match?.[1];
}
