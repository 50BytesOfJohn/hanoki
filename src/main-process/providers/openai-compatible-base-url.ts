export function normalizeOpenAiCompatibleBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    throw new Error('OpenAI-compatible "baseUrl" is required.');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (error) {
    throw new Error(`Invalid base URL "${trimmed}".`, { cause: error });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported base URL protocol "${url.protocol}". Use http or https.`);
  }

  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/+$/, "");
}
