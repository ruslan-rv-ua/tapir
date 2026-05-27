import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Standalone test config — intentionally does NOT include the paraglide/tailwind
// plugins from vite.config.ts. The composite-list hook has no i18n/CSS imports,
// so tests stay fast and isolated. Add those plugins here if a future test
// renders a component that imports paraglide messages.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
