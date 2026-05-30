import { describe, it, expect } from "vitest";
// Vite `?raw` import: index.html (project root) loaded as a string — no node builtins needed.
import rootHtml from "../../index.html?raw";

describe("index.html #root", () => {
  const rootTag = rootHtml.match(/<div id="root"[^>]*>/)?.[0] ?? "";

  it("does not carry role=application (no global focus mode)", () => {
    expect(rootTag).not.toContain('role="application"');
  });

  it("keeps its accessible name", () => {
    expect(rootTag).toContain('aria-label="Tapir"');
  });
});
