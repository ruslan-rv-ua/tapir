import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("index.html #root", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const rootTag = html.match(/<div id="root"[^>]*>/)?.[0] ?? "";

  it("does not carry role=application (no global focus mode)", () => {
    expect(rootTag).not.toContain('role="application"');
  });

  it("keeps its accessible name", () => {
    expect(rootTag).toContain('aria-label="Tapir"');
  });
});
