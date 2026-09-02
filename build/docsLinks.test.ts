import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/**
 * Relative links in the documentation must point at files that exist.
 *
 * The recurring way they stop doing so is a backlog record moving into
 * `docs/backlog/done/`: it drops one level deeper, so its own `../../src/…`
 * becomes `../../../src/…` and its `done/p1-x.md` becomes `p1-x.md`, while
 * everyone linking *to* it has to gain a `done/`. Skipping that step breaks the
 * links silently — the record still reads fine, and nobody notices until they
 * follow one. A sweep on 2026-09-02 found 36 such links across six files.
 *
 * The test walks the root markdown files plus everything under `docs/`. It lives
 * in `build/` — the shelf for Node-side code — rather than in `src/`: `tsconfig`
 * checks `src` against DOM types only, and this file needs `node:fs`.
 */

const ROOT = process.cwd();

/** `](target)` — skipping absolute URLs and bare in-page anchors. */
const LINK = /\]\((?!https?:|mailto:|#)([^)\s]+?)\)/g;

/** Split `path`, `path:42` and `path#anchor` into the file part and the rest. */
function filePart(target: string): string {
  return /^(.*?)(?::\d+)?(?:#.*)?$/.exec(target)![1];
}

function markdownFiles(): string[] {
  const files = readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(ROOT, e.name));

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".md")) files.push(p);
    }
  };
  walk(join(ROOT, "docs"));
  return files;
}

describe("documentation links", () => {
  it("every relative link points at a file that exists", () => {
    const broken: string[] = [];

    for (const file of markdownFiles()) {
      const text = readFileSync(file, "utf8");
      const dir = join(file, "..");

      for (const match of text.matchAll(LINK)) {
        const path = filePart(match[1]);
        if (!path) continue;

        const target = resolve(dir, path);
        // A link that climbs out of the repo is a GitHub-relative URL, not a
        // file path: README.md's `../../releases` resolves to the project's
        // Releases page, and there is nothing on disk to check.
        if (!target.startsWith(ROOT + sep)) continue;

        if (!existsSync(target)) {
          const line = text.slice(0, match.index).split("\n").length;
          const rel = file.slice(ROOT.length + 1).split(sep).join("/");
          broken.push(`${rel}:${line} → ${match[1]}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
