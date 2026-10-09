import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { config as zodConfig } from "zod/v4";
import { describe, expect, it } from "vitest";

import "./jitless";
import { ARKTYPE_JITLESS_SOURCE, arktypeJitless } from "./arktype-jitless";

describe("arktype jitless build", () => {
  it("rewrites kinds.js so jitless follows the app config", () => {
    const schemaEntry = createRequire(import.meta.url).resolve("@ark/schema");
    const kindsPath = path.join(path.dirname(schemaEntry), "kinds.js");
    const source = readFileSync(kindsPath, "utf8");
    const transform = arktypeJitless().transform;
    if (typeof transform !== "function") {
      throw new Error("arktype jitless transform is missing");
    }
    const result = transform.call(null as never, source, kindsPath);
    const code = typeof result === "string" ? result : null;
    expect(code).toContain(ARKTYPE_JITLESS_SOURCE);
    expect(code).not.toContain("jitless: envHasCsp()");
    expect(source).toContain("jitless: envHasCsp()");
  });

  it("configures zod without JIT", () => {
    expect(zodConfig().jitless).toBe(true);
  });
});
