import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getHelpHtml } from "./helpContent";

/** The generated tab — the one `<Tab id>` with no markdown file behind it. */
const GENERATED_TAB = "shortcuts";

/** `<Tab id="…">` values in the order HelpDialog declares them. */
function tabIds(): string[] {
  const dialogSrc = fs.readFileSync(
    path.join(process.cwd(), "src/components/common/HelpDialog.tsx"),
    "utf-8",
  );
  return Array.from(dialogSrc.matchAll(/<Tab id="([^"]+)"/g)).map((m) => m[1]);
}

describe("getHelpHtml", () => {
  it("compiles the uk overview markdown to sanitized HTML through the plugin", () => {
    const html = getHelpHtml("uk", "overview");
    expect(html).toContain("<h2");
    expect(html).toContain("Огляд і перші кроки");
    // Authored at ## — must NOT emit an <h1> (would break the dialog's heading scale).
    expect(html).not.toContain("<h1");
  });

  it("returns locale-specific content for en", () => {
    // Substring avoids the "&" in the heading: the sanitizer emits it as an HTML
    // entity, and asserting on that couples this test to its escaping choice.
    expect(getHelpHtml("en", "overview")).toContain("first steps");
  });

  it("returns non-empty HTML for every tab in both locales", () => {
    // getHelpHtml falls back to "" for a missing section — silently, so a tab
    // pointing at a file that does not exist (or an empty file) would render a
    // blank panel with nothing failing. Replaces the old "coming soon" assert,
    // which only held while a specific section was still a stub.
    for (const id of tabIds().filter((t) => t !== GENERATED_TAB)) {
      for (const locale of ["uk", "en"]) {
        expect(getHelpHtml(locale, id), `${locale}/${id}`).not.toBe("");
      }
    }
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
    // The only tab without a file is the generated one (ShortcutsHelp).
    const tabsWithoutShortcuts = tabIds().filter(t => t !== GENERATED_TAB).sort();

    const ukFiles = fs.readdirSync(path.join(process.cwd(), "docs/help/uk"))
      .filter(f => f.endsWith(".md"))
      .map(f => f.replace(".md", ""))
      .sort();

    expect(tabsWithoutShortcuts).toEqual(ukFiles);
  });

  it("declares its tabs in the order fixed by the help spec", () => {
    // Order comes from help-content-polish ("Структура довідки"): the six screen
    // tabs follow src/lib/sections.ts, and the rest slot in around them. The test
    // above only compares the SET, so without this one the five records that add
    // tabs one at a time could each land theirs anywhere.
    //
    // Sections not written yet are simply absent — assert on the subsequence, so
    // each new record adds its tab in the right slot without editing this list.
    const SPEC_ORDER = [
      "overview",
      "navigation",
      GENERATED_TAB,
      "profiles",
      "streams",
      "browser",
      "wishlist",
      "scheduling",
      "songs",
      "recording",
      "player",
      "templates",
      "settings",
      "background",
      "troubleshooting",
    ];

    const declared = tabIds();
    const unknown = declared.filter(id => !SPEC_ORDER.includes(id));
    expect(unknown, "tab ids missing from the spec order").toEqual([]);

    expect(declared).toEqual(SPEC_ORDER.filter(id => declared.includes(id)));
  });
});
