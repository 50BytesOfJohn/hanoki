/**
 * Reuses an existing Codex CLI login as a Hanoki provider credential.
 *
 * `codex login` stores ChatGPT OAuth tokens in `$CODEX_HOME/auth.json`
 * (defaults to `~/.codex/auth.json`). We read that file on demand, refresh the
 * access token right before a request when it is close to expiry, and write the
 * rotated tokens back so the CLI and Hanoki keep sharing a single login.
 *
 * There is no background refresh job: every request path goes through
 * `getCodexCredentials()`, which refreshes only when the token is actually stale.
 */
import { readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Public OAuth client id used by the Codex CLI; refresh only works with it. */
const OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
/** Refresh this long before the token actually expires. */
const REFRESH_SKEW_MS = 5 * 60_000;
const REFRESH_TIMEOUT_MS = 20_000;

export class CodexAuthError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CodexAuthError";
  }
}

export interface CodexCredentials {
  accessToken: string;
  accountId: string;
  planType: string | null;
  email: string | null;
}

interface CodexAuthTokens {
  access_token: string;
  refresh_token: string;
  id_token?: string | null;
  account_id?: string | null;
}

interface CodexAuthFile {
  auth_mode?: string | null;
  OPENAI_API_KEY?: string | null;
  tokens?: CodexAuthTokens | null;
  last_refresh?: string | null;
  [key: string]: unknown;
}

interface AccessTokenClaims {
  exp?: number;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string;
    chatgpt_plan_type?: string;
  };
  "https://api.openai.com/profile"?: {
    email?: string;
  };
}

let inFlightCredentials: Promise<CodexCredentials> | null = null;

export function getCodexHomePath(): string {
  const configured = process.env.CODEX_HOME?.trim();
  return configured || join(homedir(), ".codex");
}

export function getCodexAuthFilePath(): string {
  return join(getCodexHomePath(), "auth.json");
}

/**
 * Returns a usable ChatGPT access token, refreshing it first when needed.
 *
 * Concurrent callers share one refresh so a burst of requests cannot rotate the
 * refresh token several times in parallel.
 */
export function getCodexCredentials(): Promise<CodexCredentials> {
  inFlightCredentials ??= resolveCodexCredentials().finally(() => {
    inFlightCredentials = null;
  });

  return inFlightCredentials;
}

async function resolveCodexCredentials(): Promise<CodexCredentials> {
  const authFile = await readCodexAuthFile();
  const tokens = readAuthTokens(authFile);

  if (!isAccessTokenStale(tokens.access_token, Date.now())) {
    return buildCredentials(tokens);
  }

  return buildCredentials(await refreshCodexTokens(authFile, tokens));
}

async function readCodexAuthFile(): Promise<CodexAuthFile> {
  const authFilePath = getCodexAuthFilePath();
  let raw: string;

  try {
    raw = await readFile(authFilePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CodexAuthError(
        `No Codex login found at ${authFilePath}. Install the Codex CLI and run "codex login" first.`,
      );
    }

    throw new CodexAuthError(`Could not read ${authFilePath}.`, { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CodexAuthError(`${authFilePath} is not valid JSON. Run "codex login" again.`, {
      cause: error,
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CodexAuthError(`${authFilePath} has an unexpected format. Run "codex login" again.`);
  }

  return parsed as CodexAuthFile;
}

function readAuthTokens(authFile: CodexAuthFile): CodexAuthTokens {
  const tokens = authFile.tokens;
  const accessToken = typeof tokens?.access_token === "string" ? tokens.access_token.trim() : "";
  const refreshToken = typeof tokens?.refresh_token === "string" ? tokens.refresh_token.trim() : "";

  if (!accessToken || !refreshToken) {
    if (authFile.auth_mode === "apikey" || authFile.OPENAI_API_KEY) {
      throw new CodexAuthError(
        'Codex is signed in with an API key instead of a ChatGPT account. Add an OpenAI provider with that key, or run "codex login" to sign in with ChatGPT.',
      );
    }

    throw new CodexAuthError('Codex login is incomplete. Run "codex login" again.');
  }

  return {
    ...tokens,
    access_token: accessToken,
    refresh_token: refreshToken,
  };
}

export function isAccessTokenStale(accessToken: string, nowMs: number): boolean {
  const expiresAtMs = decodeAccessTokenClaims(accessToken)?.exp;
  if (typeof expiresAtMs !== "number") {
    // Unreadable expiry: refresh rather than send a token that may already be dead.
    return true;
  }

  return expiresAtMs * 1000 - REFRESH_SKEW_MS <= nowMs;
}

async function refreshCodexTokens(
  authFile: CodexAuthFile,
  tokens: CodexAuthTokens,
): Promise<CodexAuthTokens> {
  let response: Response;
  try {
    response = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: OAUTH_CLIENT_ID,
      }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new CodexAuthError("Could not reach OpenAI to refresh the Codex login.", {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new CodexAuthError(
      `OpenAI rejected the Codex token refresh (status ${response.status}). Run "codex login" again.`,
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
    id_token?: unknown;
  } | null;

  if (typeof payload?.access_token !== "string" || !payload.access_token) {
    throw new CodexAuthError(
      'Codex token refresh returned no access token. Run "codex login" again.',
    );
  }

  const refreshed: CodexAuthTokens = {
    ...tokens,
    access_token: payload.access_token,
    // OpenAI rotates refresh tokens; keep the old one only when none is returned.
    refresh_token:
      typeof payload.refresh_token === "string" && payload.refresh_token
        ? payload.refresh_token
        : tokens.refresh_token,
    id_token: typeof payload.id_token === "string" ? payload.id_token : tokens.id_token,
  };

  await persistRefreshedTokens(authFile, refreshed);

  return refreshed;
}

/**
 * Writes rotated tokens back to `auth.json` so the Codex CLI keeps working too.
 * A failed write is not fatal for this request, but the next refresh will fail
 * if OpenAI invalidated the previous refresh token, so it is logged loudly.
 */
async function persistRefreshedTokens(
  authFile: CodexAuthFile,
  tokens: CodexAuthTokens,
): Promise<void> {
  const authFilePath = getCodexAuthFilePath();
  const temporaryPath = `${authFilePath}.hanoki-${process.pid}.tmp`;
  const contents = JSON.stringify(
    { ...authFile, tokens, last_refresh: new Date().toISOString() },
    null,
    2,
  );

  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, authFilePath);
  } catch (error) {
    console.error(`Failed to write refreshed Codex tokens to ${authFilePath}.`, error);
  }
}

function buildCredentials(tokens: CodexAuthTokens): CodexCredentials {
  const claims = decodeAccessTokenClaims(tokens.access_token);
  const auth = claims?.["https://api.openai.com/auth"];
  const accountId =
    (typeof tokens.account_id === "string" ? tokens.account_id.trim() : "") ||
    auth?.chatgpt_account_id ||
    "";

  if (!accountId) {
    throw new CodexAuthError(
      'Codex login is missing a ChatGPT account id. Run "codex login" again.',
    );
  }

  return {
    accessToken: tokens.access_token,
    accountId,
    planType: auth?.chatgpt_plan_type ?? null,
    email: claims?.["https://api.openai.com/profile"]?.email ?? null,
  };
}

function decodeAccessTokenClaims(accessToken: string): AccessTokenClaims | null {
  const segments = accessToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  try {
    const decoded = Buffer.from(segments[1], "base64url").toString("utf8");
    const claims = JSON.parse(decoded) as unknown;
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
      return null;
    }

    return claims as AccessTokenClaims;
  } catch {
    return null;
  }
}
