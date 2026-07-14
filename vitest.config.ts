import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Schema-parsing tests do two cold parses of a large SDL fixture (~9s),
    // which exceeds Vitest's 5s default. Raise the ceiling to keep them stable.
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["src/schema-model/**", "src/services/builder.ts", "src/services/fragments.ts", "src/services/mcp-config.ts", "src/errors.ts", "src/context.ts", "src/upload.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
