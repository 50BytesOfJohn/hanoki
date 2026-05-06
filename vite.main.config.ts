import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import path from "node:path";

const external = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  build: {
    rollupOptions: {
      external,
    },
  },
});
