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

/**
 * A backticked path in a system-description document must exist on disk.
 *
 * These three documents answer "how is this built" and, since
 * [ADR 2026-09-04](../docs/decisions/2026-09-04-docs-reference-rather-than-quote.md),
 * they answer it by *pointing at code* instead of copying it. That trades one
 * drift surface for another: a copied file tree rots visibly, a stale pointer
 * rots silently — `docs/architecture.md` carried `postprocess/` for months, and
 * the link test above never saw it, because a path in backticks is not a link.
 *
 * Scope is deliberately these three files and not all of `docs/`:
 *
 * - backlog records *name files that do not exist yet* — that is their job;
 * - ADRs name rejected and removed things on purpose;
 * - `docs/agents/domain.md` says "there is no `docs/adr/` directory", and being
 *   right about an absence must not fail a test about existence.
 *
 * Skipped inside the three: globs and placeholders (`*`, `<…>`, `{uk,en}`) and
 * anything under `src-tauri/target/`, which exists only after a build.
 */
const SYSTEM_DOCS = [
  "docs/architecture.md",
  "docs/tech-stack.md",
  "docs/data-models.md",
];

/** `` `path` `` — a single-line inline code span. */
const BACKTICKED = /`([^`\n]+)`/g;

/** Repo-relative prefixes worth checking; everything else is prose. */
const CODE_PREFIX = /^(src|src-tauri|build|docs)\//;

/** `foo.rs:42` and `foo.md §3` name a place inside a file, not another file. */
function pathPart(span: string): string {
  return span.split(/[\s:]/)[0];
}

function isPlaceholder(path: string): boolean {
  return /[*<>{}…]/.test(path);
}

describe("paths named in system documentation", () => {
  it("every backticked repo path points at something that exists", () => {
    const missing: string[] = [];

    for (const rel of SYSTEM_DOCS) {
      const file = join(ROOT, rel);
      const text = readFileSync(file, "utf8");

      for (const match of text.matchAll(BACKTICKED)) {
        const path = pathPart(match[1]);
        if (!CODE_PREFIX.test(path)) continue;
        if (isPlaceholder(path)) continue;
        if (path.startsWith("src-tauri/target/")) continue;

        if (!existsSync(resolve(ROOT, path))) {
          const line = text.slice(0, match.index).split("\n").length;
          missing.push(`${rel}:${line} → ${path}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
