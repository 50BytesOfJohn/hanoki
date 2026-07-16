import { jsonSchema, tool } from "ai";

const FIRECRAWL_API_URL = "https://api.firecrawl.dev";

async function firecrawlRequest(
  path: "/v2/search" | "/v2/scrape",
  body: Record<string, unknown>,
  abortSignal?: AbortSignal,
) {
  const response = await fetch(`${FIRECRAWL_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: abortSignal,
  });
  const result = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : `Firecrawl request failed (${response.status}).`,
    );
  }

  return result;
}

export const webTools = {
  webSearch: tool({
    description:
      "Search the live web for relevant pages. Use webFetch to read a promising result in full.",
    inputSchema: jsonSchema<{ query: string }>({
      type: "object",
      properties: {
        query: { type: "string", minLength: 1 },
      },
      required: ["query"],
      additionalProperties: false,
    }),
    execute: ({ query }, { abortSignal }) =>
      firecrawlRequest("/v2/search", { query, limit: 5 }, abortSignal),
  }),
  webFetch: tool({
    description: "Fetch a public web page as clean markdown after finding or receiving its URL.",
    inputSchema: jsonSchema<{ url: string }>({
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
      },
      required: ["url"],
      additionalProperties: false,
    }),
    execute: ({ url }, { abortSignal }) => {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("Web fetch only supports HTTP and HTTPS URLs.");
      }

      return firecrawlRequest(
        "/v2/scrape",
        {
          url: parsedUrl.toString(),
          formats: ["markdown"],
          onlyMainContent: true,
        },
        abortSignal,
      );
    },
  }),
};
