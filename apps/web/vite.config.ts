import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        // Emit `download.html`, not `download/index.html`. Cloudflare's asset
        // handler serves a subfolder index only at `/download/` and 307s
        // `/download` to it — the opposite of how this app's own SSR router
        // normalizes URLs. Flat files make `/download` a 200 everywhere, so
        // canonicals, the sitemap and internal links all name a real URL
        // instead of a redirect.
        autoSubfolderIndex: false,
      },
      // Generated sitemaps use an `https://…/schemas/sitemap/0.9` namespace,
      // which is not the namespace the protocol defines. public/sitemap.xml is
      // maintained by hand instead — see the comment in that file.
      sitemap: { enabled: false },
    }),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
});

export default config;
