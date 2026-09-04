import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The app version is written in three places and read by three different
 * consumers: `tauri.conf.json` feeds `package_info()` (what the About section
 * shows), while `Cargo.toml` feeds `CARGO_PKG_VERSION` — read both by
 * `tapir --version` and by the `Tapir/<version>` User-Agent every outbound
 * request carries (`USER_AGENT` in `src-tauri/src/lib.rs`). Nothing else keeps
 * them equal — this test is the guard, so a bump that forgets one file fails
 * here instead of shipping two versions.
 */
describe("version is the same in every file that carries it", () => {
  const root = process.cwd();
  const read = (p: string) => fs.readFileSync(path.join(root, p), "utf-8");

  const tauriConf = JSON.parse(read("src-tauri/tauri.conf.json")).version as string;
  const packageJson = JSON.parse(read("package.json")).version as string;
  const cargoToml = packageVersion(read("src-tauri/Cargo.toml"));

  it("tauri.conf.json matches package.json", () => {
    expect(tauriConf).toBe(packageJson);
  });

  it("tauri.conf.json matches src-tauri/Cargo.toml [package].version", () => {
    expect(cargoToml).toBeDefined();
    expect(tauriConf).toBe(cargoToml);
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
