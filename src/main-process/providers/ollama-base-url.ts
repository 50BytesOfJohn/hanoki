import type { ProviderHostPortConfigValue } from "@shared/providers/catalog";

export function buildOllamaBaseUrl(endpoint: ProviderHostPortConfigValue): string {
  const host = endpoint.host.trim();
  if (!host) {
    throw new Error('Ollama endpoint "host" is required.');
  }

  const withProtocol = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch (error) {
    throw new Error(`Invalid Ollama host "${host}".`, { cause: error });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported Ollama protocol "${url.protocol}". Use http or https.`);
  }

  url.port = String(endpoint.port);
  url.pathname = "";
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}
