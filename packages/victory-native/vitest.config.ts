import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // One React identity at test time: the vendored code's `react` imports
      // and the shims' `@lynx-js/react` imports must be the same module.
      react: "@lynx-js/react",
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
