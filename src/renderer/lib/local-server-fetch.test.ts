import { afterEach, describe, expect, it } from "vitest";

import { LOCAL_SERVER_TOKEN_HEADER } from "@shared/local-server";

import { useSystemStore } from "@/stores/system-store";
import { localServerFetch } from "./local-server-fetch";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  useSystemStore.setState({
    aiServer: { status: "idle", port: null, token: null, error: null },
  });
});

describe("localServerFetch", () => {
  it("sends the per-launch token and drops a caller user-agent", async () => {
    useSystemStore.setState({
      aiServer: { status: "ready", port: 1, token: "launch-token", error: null },
    });

    const captured: { headers: Headers | null } = { headers: null };
    globalThis.fetch = (async (_input, init) => {
      captured.headers = new Headers(init?.headers);
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await localServerFetch("http://127.0.0.1:1/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "ai-sdk/test" },
    });

    expect(captured.headers?.get(LOCAL_SERVER_TOKEN_HEADER)).toBe("launch-token");
    expect(captured.headers?.get("user-agent")).toBeNull();
  });
});
