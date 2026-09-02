import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The app version is written in three places and read by two different
 * consumers: `tauri.conf.json` feeds `package_info()` (what the About section
 * shows), while `Cargo.toml` feeds `CARGO_PKG_VERSION` (what `tapir --version`
 * prints). Nothing else keeps them equal — this test is the guard, so a bump
 * that forgets one file fails here instead of shipping two versions.
 */
describe("version is the same in every file that carries it", () => {
  const root = process.cwd();
  const read = (p: string) => fs.readFileSync(path.join(root, p), "utf-8");

  const tauriConf = JSON.parse(read("src-tauri/tauri.conf.json")).version as string;
  const packageJson = JSON.parse(read("package.json")).version as string;
  const cargoToml = read("src-tauri/Cargo.toml")
    .split("\n")
    .find((line) => /^version\s*=/.test(line))
    ?.match(/"([^"]+)"/)?.[1];

  it("tauri.conf.json matches package.json", () => {
    expect(tauriConf).toBe(packageJson);
  });

  it("tauri.conf.json matches src-tauri/Cargo.toml [package].version", () => {
    expect(cargoToml).toBeDefined();
    expect(tauriConf).toBe(cargoToml);
  });
});
