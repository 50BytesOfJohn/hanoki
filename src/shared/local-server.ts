export const LOCAL_SERVER_TOKEN_HEADER = "X-Hanoki-Token";

/**
 * Origin header a `loadFile` page sends.
 * Electron 44 file pages omit it. `null` means the header must be absent.
 */
export const PACKAGED_RENDERER_ORIGIN = null;
