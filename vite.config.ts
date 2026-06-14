import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { paraglideVitePlugin as paraglide } from "@inlang/paraglide-js";
import { markdownHelpPlugin } from "./build/markdownHelpPlugin";

export default defineConfig({
  plugins: [
    markdownHelpPlugin(),
    react(),
    tailwindcss(),
    paraglide({
      project: "./project.inlang",
      outdir: "./src/i18n/paraglide",
    }),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
});
