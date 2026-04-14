import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
// paraglide-js v2 doesn't expose the vite plugin in its "exports" map yet;
// load via absolute path to bypass the exports check (no sub-path resolution)
import { paraglideVitePlugin as paraglide } from "./node_modules/@inlang/paraglide-js/dist/bundler-plugins/vite.js";

export default defineConfig({
  plugins: [
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
});
