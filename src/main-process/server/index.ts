import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createChatRoute } from "./routes/chat";
import { createSumiRoute } from "./routes/sumi";
import type { ChatTreeChangedEvent } from "@shared/events";

interface CreateAiServerOptions {
  onChatTreeChanged?: (event: Omit<ChatTreeChangedEvent, "type">) => void;
}

export async function createAiServer(options?: CreateAiServerOptions): Promise<{
  port: number;
  close: () => void;
}> {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));
  app.onError((error, c) => {
    console.error(`[ai-server] ${c.req.method} ${c.req.path} failed.`, error);
    return c.json({ error: "Internal server error" }, 500);
  });
  app.route(
    "/",
    createChatRoute({
      onChatTreeChanged: options?.onChatTreeChanged,
    }),
  );
  app.route("/", createSumiRoute());

  return new Promise((resolve) => {
    const server = serve(
      {
        fetch: app.fetch,
        hostname: "127.0.0.1",
        port: 0,
      },
      (info) => {
        const port = info.port;
        resolve({
          port,
          close: () => {
            server.close();
          },
        });
      },
    );
  });
}
