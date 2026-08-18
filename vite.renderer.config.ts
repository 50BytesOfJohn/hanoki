import { defineConfig } from "vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
});
