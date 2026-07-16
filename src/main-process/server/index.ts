import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createChatRoute } from "./routes/chat";
import { createSumiRoute } from "./routes/sumi";
import type { ChatTitleUpdatedEvent } from "@shared/events";

interface CreateAiServerOptions {
  onChatTitleUpdated?: (event: Omit<ChatTitleUpdatedEvent, "type">) => void;
}

export async function createAiServer(options?: CreateAiServerOptions): Promise<{
  port: number;
  close: () => void;
}> {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));
  app.route("/", createChatRoute({ onChatTitleUpdated: options?.onChatTitleUpdated }));
  app.route("/", createSumiRoute({ onChatTitleUpdated: options?.onChatTitleUpdated }));

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
