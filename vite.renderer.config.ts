import { defineConfig, type Plugin } from "vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";

import { rendererContentSecurityPolicy } from "./src/main-process/app/content-security-policy";

const ARKTYPE_JITLESS = "jitless: $ark.config?.jitless ?? envHasCsp()";

function arktypeJitless(): Plugin {
  const rewrite = (code: string) =>
    code.includes("jitless: envHasCsp()")
      ? code.replaceAll("jitless: envHasCsp()", ARKTYPE_JITLESS)
      : null;
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
                  build.onLoad({ filter: /kinds\.js$/ }, async (args) => {
                    if (!args.path.includes(`${path.sep}@ark${path.sep}schema${path.sep}`)) return;
                    const { readFileSync } = await import("node:fs");
                    const contents = rewrite(readFileSync(args.path, "utf8"));
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
      if (!id.includes("@ark/schema") || !id.includes("kinds.js")) return;
      const next = rewrite(code);
      if (next == null) return;
      return next;
    },
  };
}

function devContentSecurityPolicy(): Plugin {
  const prod = rendererContentSecurityPolicy("prod");
  const dev = rendererContentSecurityPolicy("dev");
  return {
    name: "hanoki-dev-csp",
    transformIndexHtml(html) {
      return html.replace(prod, dev);
    },
  };
}

export default defineConfig(({ command }) => ({
  root: path.resolve(__dirname, "src/renderer"),
  plugins: [
    TanStackRouterVite({
      target: "react",
      routesDirectory: path.resolve(__dirname, "src/renderer/routes"),
      generatedRouteTree: path.resolve(__dirname, "src/renderer/routeTree.gen.ts"),
      autoCodeSplitting: true,
      quoteStyle: "double",
    }),
    react(),
    tailwindcss(),
    arktypeJitless(),
    ...(command === "serve" ? [devContentSecurityPolicy()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: path.resolve(__dirname, ".vite/renderer/main_window"),
    // xterm 6 uses logical assignment in its mode-query parser. Targeting ES2021 keeps Vite's
    // esbuild pass from downleveling that code into the broken form tracked in xterm.js#5800.
    target: "es2021",
  },
  server: {
    port: 5173,
    strictPort: true,
  },
}));
