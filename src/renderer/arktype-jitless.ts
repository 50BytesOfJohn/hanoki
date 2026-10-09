import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export const ARKTYPE_JITLESS_SOURCE = "jitless: $ark.config?.jitless ?? envHasCsp()";

const ARKTYPE_JITLESS_DEFAULT = "jitless: envHasCsp()";

export function rewriteArktypeJitless(code: string): string | null {
  if (!code.includes(ARKTYPE_JITLESS_DEFAULT)) return null;
  return code.replaceAll(ARKTYPE_JITLESS_DEFAULT, ARKTYPE_JITLESS_SOURCE);
}

function isArktypeKindsModule(id: string): boolean {
  return id.includes("@ark/schema") && id.includes("kinds.js");
}

export function arktypeJitless(): Plugin {
  return {
    name: "hanoki-arktype-jitless",
    config() {
      return {
        optimizeDeps: {
          esbuildOptions: {
            plugins: [
              {
                name: "hanoki-arktype-jitless",
                setup(build) {
                  build.onLoad({ filter: /kinds\.js$/ }, (args) => {
                    if (!args.path.includes(`${path.sep}@ark${path.sep}schema${path.sep}`)) return;
                    const contents = rewriteArktypeJitless(readFileSync(args.path, "utf8"));
                    if (contents == null) return;
                    return { contents, loader: "js" };
                  });
                },
              },
            ],
          },
        },
      };
    },
    transform(code, id) {
      if (!isArktypeKindsModule(id)) return;
      const next = rewriteArktypeJitless(code);
      if (next == null) return;
      return next;
    },
  };
}
