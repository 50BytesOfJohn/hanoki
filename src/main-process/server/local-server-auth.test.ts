import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { LOCAL_SERVER_TOKEN_HEADER, PACKAGED_RENDERER_ORIGIN } from "@shared/local-server";

import { createLocalServerApp } from "./index";
import { localServerGuard } from "./local-server-guard";

const TOKEN = "test-token";
const ORIGIN = "http://localhost:5173";

function chatApp() {
  return createLocalServerApp({ token: TOKEN, origin: ORIGIN });
}

function post(app: Hono, path: string, headers: Record<string, string>, body: unknown = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function corsOrigin(response: Response): string | null {
  return response.headers.get("access-control-allow-origin");
}

describe("local server auth", () => {
  it("rejects a request with no token before /api/chat returns its own error", async () => {
    const response = await post(chatApp(), "/api/chat", { origin: ORIGIN });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(corsOrigin(response)).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
  });

  it("rejects a request with the wrong token and omits CORS headers", async () => {
    const response = await post(chatApp(), "/api/chat", {
      origin: ORIGIN,
      [LOCAL_SERVER_TOKEN_HEADER]: "other-token",
    });

    expect(response.status).toBe(401);
    expect(corsOrigin(response)).toBeNull();
  });

  it("rejects a request from a different origin and omits CORS headers", async () => {
    const response = await post(chatApp(), "/api/chat", {
      origin: "https://example.com",
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });

    expect(response.status).toBe(403);
    expect(corsOrigin(response)).toBeNull();
  });

  it("rejects a request with no origin when an origin is required", async () => {
    const response = await post(chatApp(), "/api/chat", {
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });

    expect(response.status).toBe(403);
    expect(corsOrigin(response)).toBeNull();
  });

  it("pins the packaged file-page origin to an absent Origin header", async () => {
    expect(PACKAGED_RENDERER_ORIGIN).toBeNull();

    const app = new Hono();
    app.use("*", localServerGuard({ token: TOKEN, origin: PACKAGED_RENDERER_ORIGIN }));
    app.post("/api/chat", (c) => c.json({ ok: true }));

    const allowed = await post(app, "/api/chat", {
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });
    const nullOrigin = await post(app, "/api/chat", {
      origin: "null",
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });
    const fileOrigin = await post(app, "/api/chat", {
      origin: "file://",
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });

    expect(allowed.status).toBe(200);
    expect(corsOrigin(allowed)).toBe("null");
    expect(nullOrigin.status).toBe(403);
    expect(corsOrigin(nullOrigin)).toBeNull();
    expect(fileOrigin.status).toBe(403);
    expect(corsOrigin(fileOrigin)).toBeNull();
  });

  it("lets /api/chat run when the token and origin match", async () => {
    const response = await post(chatApp(), "/api/chat", {
      origin: ORIGIN,
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "modelId is required" });
    expect(corsOrigin(response)).toBe(ORIGIN);
  });

  it("rejects Sumi routes with a missing or wrong token and omits CORS headers", async () => {
    const app = chatApp();

    for (const path of ["/api/sumi", "/api/sumi/title"]) {
      const missing = await post(app, path, { origin: ORIGIN });
      const wrong = await post(app, path, {
        origin: ORIGIN,
        [LOCAL_SERVER_TOKEN_HEADER]: "other-token",
      });

      expect(missing.status, path).toBe(401);
      expect(corsOrigin(missing), path).toBeNull();
      expect(wrong.status, path).toBe(401);
      expect(corsOrigin(wrong), path).toBeNull();
    }
  });

  it("lets Sumi routes run when the token and origin match", async () => {
    const app = chatApp();
    const headers = { origin: ORIGIN, [LOCAL_SERVER_TOKEN_HEADER]: TOKEN };

    const action = await post(app, "/api/sumi", headers);
    const title = await post(app, "/api/sumi/title", headers);

    expect(action.status).toBe(400);
    expect(await action.text()).toBe("Unsupported Sumi feature.");
    expect(corsOrigin(action)).toBe(ORIGIN);
    expect(title.status).toBe(400);
    expect(await title.text()).toBe("Item ID must be a string.");
    expect(corsOrigin(title)).toBe(ORIGIN);
  });

  it("answers a preflight for POST and the token header", async () => {
    const response = await chatApp().request("/api/chat", {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-hanoki-token",
      },
    });

    expect(response.status).toBe(204);
    expect(corsOrigin(response)).toBe(ORIGIN);
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      "x-hanoki-token",
    );
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-max-age")).toBe("600");
  });

  it("rejects a GET preflight", async () => {
    const response = await chatApp().request("/api/chat", {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers": LOCAL_SERVER_TOKEN_HEADER,
      },
    });

    expect(response.status).toBe(403);
    expect(corsOrigin(response)).toBeNull();
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
    expect(corsOrigin(response)).toBeNull();
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
    expect(corsOrigin(response)).toBeNull();
  });

  it("adds CORS headers to an authorized 404 and withholds them when unauthorized", async () => {
    const app = chatApp();

    const missing = await post(app, "/missing", { origin: ORIGIN });
    const found = await post(app, "/missing", {
      origin: ORIGIN,
      [LOCAL_SERVER_TOKEN_HEADER]: TOKEN,
    });

    expect(missing.status).toBe(401);
    expect(corsOrigin(missing)).toBeNull();
    expect(found.status).toBe(404);
    expect(corsOrigin(found)).toBe(ORIGIN);
  });

  it("adds CORS headers to an authorized error response and a streaming response", async () => {
    const app = new Hono();
    app.use("*", localServerGuard({ token: TOKEN, origin: ORIGIN }));
    app.onError((_error, c) => c.json({ error: "Internal server error" }, 500));
    app.post("/boom", () => {
      throw new Error("boom");
    });
    app.post("/stream", () => new Response("hello", { headers: { "content-type": "text/plain" } }));

    const headers = { origin: ORIGIN, [LOCAL_SERVER_TOKEN_HEADER]: TOKEN };
    const failure = await post(app, "/boom", headers);
    const stream = await post(app, "/stream", headers);
    const denied = await post(app, "/boom", { origin: ORIGIN });

    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ error: "Internal server error" });
    expect(corsOrigin(failure)).toBe(ORIGIN);
    expect(stream.status).toBe(200);
    expect(await stream.text()).toBe("hello");
    expect(corsOrigin(stream)).toBe(ORIGIN);
    expect(denied.status).toBe(401);
    expect(corsOrigin(denied)).toBeNull();
  });

  it("accepts only the bound loopback host", async () => {
    const port = 40123;
    const app = new Hono();
    app.use("*", localServerGuard({ token: TOKEN, origin: ORIGIN, port }));
    app.post("/api/chat", (c) => c.json({ ok: true }));

    const headers = { origin: ORIGIN, [LOCAL_SERVER_TOKEN_HEADER]: TOKEN };
    const ipv4 = await post(app, "/api/chat", { ...headers, host: `127.0.0.1:${port}` });
    const localhost = await post(app, "/api/chat", { ...headers, host: `localhost:${port}` });
    const wrongHost = await post(app, "/api/chat", { ...headers, host: `example.com:${port}` });
    const wrongPort = await post(app, "/api/chat", { ...headers, host: "127.0.0.1:9" });
    const missingHost = await post(app, "/api/chat", headers);

    expect(ipv4.status).toBe(200);
    expect(localhost.status).toBe(200);
    expect(wrongHost.status).toBe(403);
    expect(corsOrigin(wrongHost)).toBeNull();
    expect(wrongPort.status).toBe(403);
    expect(corsOrigin(wrongPort)).toBeNull();
    expect(missingHost.status).toBe(403);
  });
});
