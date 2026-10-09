import { timingSafeEqual } from "node:crypto";

import type { MiddlewareHandler } from "hono";

import { LOCAL_SERVER_TOKEN_HEADER } from "@shared/local-server";

const ALLOWED_METHODS = new Set(["GET", "POST"]);
const ALLOWED_REQUEST_HEADERS = new Set(["content-type", LOCAL_SERVER_TOKEN_HEADER.toLowerCase()]);

function localServerTokensMatch(expected: string, presented: string | undefined): boolean {
  if (presented == null) return false;
  const expectedBytes = Buffer.from(expected);
  const presentedBytes = Buffer.from(presented);
  if (expectedBytes.length !== presentedBytes.length) return false;
  return timingSafeEqual(expectedBytes, presentedBytes);
}

function requestedHeadersAllowed(header: string | undefined): boolean {
  if (!header) return false;
  const names = header
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  if (!names.includes(LOCAL_SERVER_TOKEN_HEADER.toLowerCase())) return false;
  return names.every((name) => ALLOWED_REQUEST_HEADERS.has(name));
}

/**
 * The browser sends the token header on the actual request. OPTIONS only lists it.
 */
export function localServerGuard(options: { token: string; origin: string }): MiddlewareHandler {
  const { token, origin } = options;

  return async (c, next) => {
    const requestOrigin = c.req.header("origin");
    if (requestOrigin !== origin) {
      return c.body(null, 403);
    }

    if (c.req.method === "OPTIONS") {
      const method = c.req.header("access-control-request-method");
      if (
        !method ||
        !ALLOWED_METHODS.has(method.toUpperCase()) ||
        !requestedHeadersAllowed(c.req.header("access-control-request-headers"))
      ) {
        return c.body(null, 403);
      }

      return c.body(null, 204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": `Content-Type, ${LOCAL_SERVER_TOKEN_HEADER}`,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        Vary: "Origin",
      });
    }

    if (!localServerTokensMatch(token, c.req.header(LOCAL_SERVER_TOKEN_HEADER))) {
      return c.json({ error: "Unauthorized" }, 401, {
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
      });
    }

    await next();
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    if (
      !c.res.headers
        .get("Vary")
        ?.split(",")
        .some((part) => part.trim() === "Origin")
    ) {
      c.res.headers.append("Vary", "Origin");
    }
  };
}
