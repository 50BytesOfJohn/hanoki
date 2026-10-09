import { describe, expect, it } from "vitest";

import { brandIconUrl, getBrandIconSlug } from "./brand-icon";

describe("brand icons", () => {
  it("resolves bundled logos and skips creators that are not in the set", () => {
    expect(getBrandIconSlug("mistralai")).toBe("mistral");
    const color = brandIconUrl("deepseek", "color");
    const mono = brandIconUrl("openai", "mono");
    expect(color).toEqual(expect.any(String));
    expect(mono).toEqual(expect.any(String));
    expect(color).not.toMatch(/^https?:/);
    expect(mono).not.toMatch(/^https?:/);
    expect(brandIconUrl("openai", "color")).toBeNull();
    expect(brandIconUrl("not-a-real-creator-zzz", "mono")).toBeNull();
  });
});
