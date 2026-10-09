import { LOCAL_SERVER_TOKEN_HEADER } from "@shared/local-server";

import { useSystemStore } from "@/stores/system-store";

export function localServerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.delete("user-agent");
  const token = useSystemStore.getState().aiServer.token;
  if (token) {
    headers.set(LOCAL_SERVER_TOKEN_HEADER, token);
  }
  return fetch(input, { ...init, headers });
}
