import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { LOCAL_SERVER_TOKEN_HEADER } from "@shared/local-server";

import { createLocalServerApp } from "./index";
import { localServerGuard } from "./local-server-guard";

const TOKEN = "test-token";
const ORIGIN = "http://localhost:5173";

function chatApp(onChatRequest?: () => void) {
  return createLocalServerApp({ token: TOKEN, origin: ORIGIN, onChatRequest });
}

function post(app: Hono, path: string, headers: Record<string, string>, body: unknown = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("local server auth", () => {
  it("rejects a request with no token before /api/chat prepares model tools", async () => {
    let entered = false;
    const app = chatApp(() => {
      entered = true;
    });

    const response = await post(app, "/api/chat", { origin: ORIGIN });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    // onChatRequest is the first line of POST /api/chat. Model tools are created later in that handler.
    expect(entered).toBe(false);
  });

  it("rejects a request with the wrong token", async () => {
    let entered = false;
    const app = chatApp(() => {
      entered = true;
    });

    const response = await post(app, "/api/chat", {
      origin: ORIGIN,
      [LOCAL_SERVER_TOKEN_HEADER]: "other-token",
    });

    expect(response.status).toBe(401);
    expect(entered).toBe(false);
  });

  it("rejects a request from a different origin and omits CORS headers", async () => {
    let entered = false;
    const app = chatApp(() => {
      entered = true;
    });

    const response = await post(app, "/api/chat", {
      origin: "https://example.com",
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(entered).toBe(false);
  });

  it("rejects a request with no origin", async () => {
    const response = await post(chatApp(), "/api/chat", {
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("accepts the configured origin exactly, including the opaque file origin", async () => {
    const app = new Hono();
    app.use("*", localServerGuard({ token: TOKEN, origin: "null" }));
    app.post("/api/chat", (c) => c.json({ ok: true }));

    const allowed = await post(app, "/api/chat", {
      origin: "null",
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });
    const denied = await post(app, "/api/chat", {
      origin: "file://",
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });

    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("null");
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("lets /api/chat run when the token and origin match", async () => {
    let entered = false;
    const app = chatApp(() => {
      entered = true;
    });

    const response = await post(app, "/api/chat", {
      origin: ORIGIN,
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "modelId is required" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(entered).toBe(true);
  });

  it("rejects /api/sumi and /api/sumi/title without a token", async () => {
    const app = chatApp();

    for (const path of ["/api/sumi", "/api/sumi/title"]) {
      const response = await post(app, path, { origin: ORIGIN });
      expect(response.status, path).toBe(401);
    }
  });

  it("answers a preflight for the app origin and the token header", async () => {
    const response = await chatApp().request("/api/chat", {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-hanoki-token",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      "x-hanoki-token",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("rejects a preflight from another origin", async () => {
    const response = await chatApp().request("/api/sumi", {
      method: "OPTIONS",
      headers: {
        origin: "https://example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": LOCAL_SERVER_TOKEN_HEADER,
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects a preflight that asks for another header", async () => {
    const response = await chatApp().request("/api/chat", {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-hanoki-token, x-other",
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
