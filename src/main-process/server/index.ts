import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createChatRoute } from "./routes/chat";

export async function createAiServer(): Promise<{
  port: number;
  close: () => void;
}> {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));
  app.route("/", createChatRoute());

  return new Promise((resolve) => {
    const server = serve(
      {
        fetch: app.fetch,
        hostname: "127.0.0.1",
        port: 0,
      },
      (info) => {
        const port = info.port;
        console.log(`[ai-server] Listening on 127.0.0.1:${port}`);
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
