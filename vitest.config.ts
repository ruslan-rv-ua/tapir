import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { markdownHelpPlugin } from "./build/markdownHelpPlugin";

// Standalone test config — intentionally does NOT include the paraglide/tailwind
// plugins from vite.config.ts (paraglide messages are generated to disk, so they
// resolve without their plugin). The markdown-help plugin IS required here: the
// `?help` transform is not generated to disk, so HelpDialog/helpContent tests
// would fail to resolve `*.md?help` imports without it.
export default defineConfig({
  plugins: [markdownHelpPlugin(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // `build/` carries Node-side checks (docs links) that must not sit in `src`:
    // tsconfig type-checks `src` against DOM types only, without `@types/node`.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "build/**/*.test.ts"],
  },
});
