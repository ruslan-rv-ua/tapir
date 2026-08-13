import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getHelpHtml } from "./helpContent";

describe("getHelpHtml", () => {
  it("compiles the uk overview markdown to sanitized HTML through the plugin", () => {
    const html = getHelpHtml("uk", "overview");
    expect(html).toContain("<h2");
    expect(html).toContain("Огляд і перші кроки");
    // Authored at ## — must NOT emit an <h1> (would break the dialog's heading scale).
    expect(html).not.toContain("<h1");
  });

  it("returns locale-specific content for en", () => {
    expect(getHelpHtml("en", "overview")).toContain("Overview &#x26; first steps");
  });

  it("resolves the stub sections", () => {
    expect(getHelpHtml("en", "recording")).toContain("coming soon");
  });

  it("falls back to uk for an unknown locale", () => {
    expect(getHelpHtml("de", "overview")).toContain("Огляд і перші кроки");
  });

  it("has locale parity (uk files match en files)", () => {
    const ukFiles = fs.readdirSync(path.join(process.cwd(), "docs/help/uk"))
      .filter(f => f.endsWith(".md"))
      .sort();
    const enFiles = fs.readdirSync(path.join(process.cwd(), "docs/help/en"))
      .filter(f => f.endsWith(".md"))
      .sort();
    expect(ukFiles).toEqual(enFiles);
  });

  it("has exactly one tab in HelpDialog for every markdown file except ShortcutsHelp", () => {
    const dialogSrc = fs.readFileSync(path.join(process.cwd(), "src/components/common/HelpDialog.tsx"), "utf-8");
    // Match the id attribute of <Tab id="..."> in HelpDialog.tsx
    const tabMatches = Array.from(dialogSrc.matchAll(/<Tab id="([^"]+)"/g)).map(m => m[1]);
    // The only tab without a file is the generated one (ShortcutsHelp).
    const tabsWithoutShortcuts = tabMatches.filter(t => t !== "shortcuts").sort();

    const ukFiles = fs.readdirSync(path.join(process.cwd(), "docs/help/uk"))
      .filter(f => f.endsWith(".md"))
      .map(f => f.replace(".md", ""))
      .sort();

    expect(tabsWithoutShortcuts).toEqual(ukFiles);
  });
});
