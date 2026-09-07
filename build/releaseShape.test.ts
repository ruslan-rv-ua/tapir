import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The release asset is named in two repositories: `.github/workflows/release.yml`
 * builds and uploads it, and `bucket/tapir.json` in the scoop bucket — seeded from
 * `packaging/scoop/tapir.json` here — tells the bucket's Excavator where to find
 * the next one. Nothing runs between the two: the bucket reads `autoupdate` on its
 * own, and a renamed asset would be discovered only when the first `scoop update`
 * after it fails to download. This test is the place the two names meet before a
 * tag exists.
 *
 * Same idea as `ciGates.test.ts`, one level up: the workflow's build command is the
 * justfile's `build` recipe, so the exe a user downloads is the exe `just build`
 * produces, profile and flags included.
 *
 * The workflow is read textually, like ci.yml in `ciGates.test.ts`: the asset name
 * is one `ASSET:` line in the workflow's `env:` block, and the build is one
 * single-line `run:`. Anything else would need a YAML reader this test does not
 * want to be.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const REPO = "https://github.com/ruslan-rv-ua/tapir";

interface Manifest {
  version: string;
  description: string;
  homepage: string;
  license: string;
  architecture: { "64bit": { url: string; hash: string } };
  bin: string;
  shortcuts: string[][];
  persist: string[];
  checkver: string;
  autoupdate: { architecture: { "64bit": { url: string; hash: { url: string } } } };
}

describe("the release asset has one shape in the workflow and in the scoop manifest", () => {
  const workflow = read(".github/workflows/release.yml");
  const manifest = JSON.parse(read("packaging/scoop/tapir.json")) as Manifest;
  const cargo = read("src-tauri/Cargo.toml");

  /** `tapir-${{ github.ref_name }}-x64.exe` with the tag spelled as scoop spells it. */
  const assetForTag = (tag: string) => assetEnv(workflow).replaceAll("${{ github.ref_name }}", tag);

  it("`autoupdate` downloads exactly the file the workflow uploads", () => {
    const url = manifest.autoupdate.architecture["64bit"].url;
    expect(url).toBe(`${REPO}/releases/download/v$version/${assetForTag("v$version")}#/${manifest.bin}`);
  });

  it("the pinned `url` is the `autoupdate` URL at the manifest's own version", () => {
    const expected = manifest.autoupdate.architecture["64bit"].url.replaceAll("$version", manifest.version);
    expect(manifest.architecture["64bit"].url).toBe(expected);
  });

  it("the hash comes from the sidecar the workflow writes beside the asset", () => {
    expect(manifest.autoupdate.architecture["64bit"].hash.url).toBe("$url.sha256");
    expect(workflow).toContain('"artifacts/$env:ASSET.sha256"');
  });

  it("the `#/` fragment, `bin` and the shortcut all name the binary Cargo builds", () => {
    expect(manifest.bin).toBe("tapir.exe");
    expect(manifest.shortcuts).toEqual([["tapir.exe", "Tapir"]]);
    expect(workflow).toContain("src-tauri/target/release/tapir.exe");
  });

  it("the workflow builds with the justfile's `build` recipe", () => {
    expect(runLines(workflow)).toContain(recipe(read("justfile"), "build"));
  });

  it("the manifest repeats Cargo.toml's description, homepage and license", () => {
    expect(manifest.description).toBe(packageField(cargo, "description"));
    expect(manifest.homepage).toBe(packageField(cargo, "homepage"));
    expect(manifest.license).toBe(packageField(cargo, "license"));
    expect(manifest.homepage).toBe(REPO);
  });

  it("`persist` keeps both folders Tapir writes beside the exe", () => {
    // `data` is settings and profiles; `recordings` is what the app exists for.
    // Under scoop both would otherwise sit in the versioned app directory that
    // `scoop cleanup` deletes — see src-tauri/src/portable.rs for the two roots.
    expect(manifest.persist).toEqual(["data", "recordings"]);
  });

  it("the Excavator can find the next release on its own", () => {
    expect(manifest.checkver).toBe("github");
  });

  it("the placeholder hash is a well-formed SHA-256 until the seeding step fills it", () => {
    expect(manifest.architecture["64bit"].hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

/** The `ASSET:` entry of the workflow's top-level `env:` block. */
function assetEnv(workflow: string): string {
  // `.+?`, not `\S+`: the value carries `${{ github.ref_name }}` with its spaces.
  const match = /^\s+ASSET:\s*(.+?)\s*$/m.exec(workflow);
  if (!match) throw new Error("release.yml has no `ASSET:` env entry");
  return match[1];
}

/** Every single-line `run:` command in the workflow. */
function runLines(workflow: string): string[] {
  return workflow
    .split(/\r?\n/)
    .map((line) => /^\s+run:\s*(.+)$/.exec(line)?.[1])
    .filter((cmd): cmd is string => cmd !== undefined && !/^[|>]/.test(cmd));
}

/** The single command of a one-line justfile recipe, `@`-prefix stripped. */
function recipe(justfile: string, name: string): string {
  const lines = justfile.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `${name}:`);
  if (start === -1) throw new Error(`justfile has no recipe \`${name}\``);
  const body = lines
    .slice(start + 1)
    .filter((line, i, rest) => rest.slice(0, i + 1).every((l) => /^\s/.test(l)))
    .map((l) => l.trim().replace(/^@/, ""))
    .filter(Boolean);
  if (body.length !== 1) throw new Error(`justfile recipe \`${name}\` is not a single command`);
  return body[0];
}

/** A quoted string field from the `[package]` table of a Cargo manifest. */
function packageField(toml: string, field: string): string | undefined {
  let inPackage = false;
  for (const line of toml.split(/\r?\n/)) {
    if (/^\[/.test(line)) {
      inPackage = line.trim() === "[package]";
      continue;
    }
    if (inPackage && new RegExp(`^${field}\\s*=`).test(line)) {
      return line.match(/"([^"]+)"/)?.[1];
    }
  }
  return undefined;
}
