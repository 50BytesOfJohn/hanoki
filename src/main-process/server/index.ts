import { randomBytes } from "node:crypto";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createChatRoute } from "./routes/chat";
import { localServerGuard } from "./local-server-guard";
import { createSumiRoute } from "./routes/sumi";
import type {
  ChatGenerationRequestedEvent,
  ChatMessagesChangedEvent,
  ChatTreeChangedEvent,
} from "@shared/events";

interface CreateAiServerOptions {
  origin: string;
  onChatRequest?: () => void;
  onChatTreeChanged?: (event: Omit<ChatTreeChangedEvent, "type">) => void;
  onChatMessagesChanged?: (event: Omit<ChatMessagesChangedEvent, "type">) => void;
  onChatGenerationRequested?: (event: Omit<ChatGenerationRequestedEvent, "type">) => void;
  flushMarkdownContent?: (id: string) => {
    id: string;
    workspaceId: string;
    title: string;
    type: "markdown";
    data: { markdown: string };
  };
}

export function createLocalServerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createLocalServerApp(options: CreateAiServerOptions & { token: string }) {
  const app = new Hono();

  app.use("*", localServerGuard({ token: options.token, origin: options.origin }));
  app.onError((error, c) => {
    console.error(`[ai-server] ${c.req.method} ${c.req.path} failed.`, error);
    return c.json({ error: "Internal server error" }, 500);
  });
  app.route(
    "/",
    createChatRoute({
      onChatRequest: options.onChatRequest,
      onChatTreeChanged: options.onChatTreeChanged,
      onChatMessagesChanged: options.onChatMessagesChanged,
      onChatGenerationRequested: options.onChatGenerationRequested,
      flushMarkdownContent: options.flushMarkdownContent,
    }),
  );
  app.route("/", createSumiRoute());

  return app;
}

export async function createAiServer(options: CreateAiServerOptions): Promise<{
  port: number;
  token: string;
  close: () => void;
}> {
  const token = createLocalServerToken();
  const app = createLocalServerApp({ ...options, token });

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
          token,
          close: () => {
            server.close();
          },
        });
      },
    );
  });
}
