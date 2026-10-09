import { describe, expect, it } from "vitest";

import {
  rendererContentSecurityPolicy,
  rendererIndexContentSecurityPolicy,
} from "./content-security-policy";

describe("renderer content security policy", () => {
  it("matches the packaged meta tag and blocks remote scripts and objects", () => {
    const prod = rendererContentSecurityPolicy("prod");
    const dev = rendererContentSecurityPolicy("dev");

    expect(rendererIndexContentSecurityPolicy()).toBe(prod);
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("script-src 'self'");
    expect(prod).toContain("script-src-attr 'none'");
    expect(prod).toContain("connect-src 'self' http://127.0.0.1:*");
    expect(prod).not.toContain("https:");
    expect(prod).toContain("script-src 'self';");
    expect(prod).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(dev).toContain("script-src 'self' 'unsafe-inline'");
    expect(dev).not.toContain("https:");
  });
});
