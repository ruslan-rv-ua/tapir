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

  it("keeps every section inside the word bounds of the style guide", () => {
    // Rule 6 of the help spec (help-content-polish): 200–1000 words per section,
    // measured on the ENGLISH file — Ukrainian comes out shorter on the same
    // content. The two bounds do different jobs:
    //
    //  - FLOOR is the anti-stub guard, NOT rule 6's lower bound. Do not "align"
    //    it with the 200 above: uk/overview.md is 184 words and en/overview.md is
    //    exactly 200, so a floor of 200 goes red on files nobody touched. What it
    //    replaces is a blacklist of placeholder phrases ("coming soon"), which
    //    catches only the wording we happened to use once — and sits
    //    uncomfortably close to "поки що недоступно", a phrase rule 8 of the
    //    style guide REQUIRES settings.md to write. A length floor catches a stub
    //    however it is worded; 120 clears the shortest real section and dwarfs
    //    any plausible stub, so it never fires on prose.
    //  - CEILING is rule 6 itself. Past it a section is meant to be SPLIT into a
    //    new tab, not trimmed, so a failure here is a design prompt.
    //
    // Counted in JS deliberately: `wc -w` returns 0 for Cyrillic in this repo's
    // shell, which makes every uk file look a third of its real length.
    const FLOOR = 120;
    const CEILING = 1000;
    const wordCount = (md: string) => md.split(/\s+/).filter(Boolean).length;

    for (const locale of ["uk", "en"]) {
      const dir = path.join(process.cwd(), "docs/help", locale);
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
        const words = wordCount(fs.readFileSync(path.join(dir, file), "utf-8"));
        expect(words, `${locale}/${file} is too short to be a real section`)
          .toBeGreaterThanOrEqual(FLOOR);
        // The ceiling is stated on the English file, so only en is held to it.
        if (locale === "en") {
          expect(words, `${locale}/${file} is over the ceiling — split it, don't trim`)
            .toBeLessThanOrEqual(CEILING);
        }
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
