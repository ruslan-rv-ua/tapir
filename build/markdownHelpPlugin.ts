import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

// Build-time Markdown → sanitized HTML. Shared across every `*.md?help` import.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeStringify);

/**
 * Transforms `*.md?help` imports into a default-exported sanitized HTML string.
 * `enforce: "pre"` so it wins before Vite's default asset handling. Guarded on
 * the `?help` query (parsed via URLSearchParams — Vite may append extra params)
 * and the `.md` extension. The runtime bundle gains no Markdown/sanitizer code.
 */
export function markdownHelpPlugin(): Plugin {
  return {
    name: "markdown-help",
    enforce: "pre",
    async load(id) {
      const [file, rawQuery = ""] = id.split("?");
      if (!new URLSearchParams(rawQuery).has("help")) return null;
      if (!file.endsWith(".md")) return null;
      this.addWatchFile(file); // reliable HMR on .md edits
      const html = String(await processor.process(await readFile(file, "utf8")));
      return `export default ${JSON.stringify(html)};`;
    },
  };
}
