import { defineConfig } from "vitest/config";
import { transformWithOxc } from "vite";
import path from "path";

export default defineConfig({
  plugins: [{
    name: "test-tsx-transform",
    enforce: "pre",
    async transform(code, id) {
      if (!id.endsWith(".tsx")) return null;
      return transformWithOxc(code, id, { lang: "tsx", jsx: "react-jsx" });
    },
  }],
  test: {
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "tests/**/*.test.ts", "client/src/**/*.test.ts", "client/src/**/*.test.tsx"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
});
