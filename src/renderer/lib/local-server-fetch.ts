import { LOCAL_SERVER_TOKEN_HEADER } from "@shared/local-server";

import { useSystemStore } from "@/stores/system-store";

export function localServerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  // AI SDK sets User-Agent. Browsers strip that forbidden header, but a preflight
  // would list it and fail the allowlist (only content-type and X-Hanoki-Token).
  headers.delete("user-agent");
  const token = useSystemStore.getState().aiServer.token;
  if (token) {
    headers.set(LOCAL_SERVER_TOKEN_HEADER, token);
  }
  return fetch(input, { ...init, headers });
}
