import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The app version is written once — in `src-tauri/Cargo.toml` — and every
 * consumer reads it from there:
 *
 * - the `Tapir/<version>` User-Agent every outbound request carries, through
 *   `CARGO_PKG_VERSION` (`src-tauri/src/lib.rs`), and the `--version` flag,
 *   configured from the same constant (`src-tauri/src/cli.rs`) — though that
 *   one displays nothing: the app exits with code 0 and no console text;
 * - the About section, because `tauri-codegen` falls back to
 *   `CARGO_PKG_VERSION` for `package_info()` when the config has no `version`;
 * - the installer, because `tauri-cli` falls back to the Cargo manifest too;
 * - the exe's `FileVersion`/`ProductVersion` *strings*, which `tauri-winres`
 *   defaults from `CARGO_PKG_VERSION` and `tauri-build` never overwrites — it
 *   sets only the numeric `FILEVERSION`/`PRODUCTVERSION`, and only when the
 *   config carries a version of its own.
 *
 * That last asymmetry is why a `version` field in `tauri.conf.json` is not a
 * dormant second copy but a live wire: reinstating it splits what the About
 * section shows from what `--version` prints, and splits an exe's numeric
 * version from the string one Explorer displays. Nothing would fail — which is
 * the whole reason this test exists. `package.json`'s version had no consumer
 * at all, and `"private": true` there says why that manifest carries none.
 *
 * Tauri would also accept `"version": "../package.json"` in the config and read
 * the number out of that file. Deliberately unused: it would make the one copy
 * nobody reads the owner, and leave Cargo — the file every consumer above
 * actually reads — as the follower under guard.
 *
 * The third check faces the other way. Cargo treats `[package].version` as
 * optional and quietly substitutes `0.0.0`, so once the two checks above make
 * Cargo the sole carrier, its own field becomes the only unguarded point left.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("only src-tauri/Cargo.toml carries the app version", () => {
  it("src-tauri/tauri.conf.json declares no version", () => {
    expect(JSON.parse(read("src-tauri/tauri.conf.json"))).not.toHaveProperty("version");
  });

  it("package.json declares no version", () => {
    expect(JSON.parse(read("package.json"))).not.toHaveProperty("version");
  });

  it("src-tauri/Cargo.toml [package].version is a semver number", () => {
    expect(packageVersion(read("src-tauri/Cargo.toml"))).toMatch(/^\d+\.\d+\.\d+(?:[-+].+)?$/);
  });
});

/**
 * `version = "…"` from the `[package]` table only. A dependency entry may carry
 * its own `version` line, and a workspace table could one day sit above
 * `[package]`, so the first `version =` in the file is not the right one.
 */
function packageVersion(toml: string): string | undefined {
  let inPackage = false;
  for (const line of toml.split(/\r?\n/)) {
    if (/^\[/.test(line)) {
      inPackage = line.trim() === "[package]";
      continue;
    }
    if (inPackage && /^version\s*=/.test(line)) {
      return line.match(/"([^"]+)"/)?.[1];
    }
  }
  return undefined;
}
