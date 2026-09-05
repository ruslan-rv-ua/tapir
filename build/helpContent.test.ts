import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getHelpHtml } from "../src/components/common/helpContent";

/** The generated tab — the one `<Tab id>` with no markdown file behind it. */
const GENERATED_TAB = "shortcuts";

/** `<Tab id="…">` values in the order HelpDialog declares them. */
function tabIds(): string[] {
  const dialogSrc = fs.readFileSync(
    path.join(process.cwd(), "src/components/common/HelpDialog.tsx"),
    "utf-8",
  );
  // The word boundary after Tab keeps <TabPanel> out; the id need not be the
  // first attribute, nor on the same line as the tag.
  return Array.from(dialogSrc.matchAll(/<Tab\b[^>]*?\sid="([^"]+)"/g)).map((m) => m[1]);
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
    // Rule 6 of the help spec (help-content-polish): 600–3000 words per section,
    // measured on the ENGLISH file — Ukrainian comes out 10–15% shorter on the
    // same content. Three bounds, each doing a different job:
    //
    //  - FLOOR is rule 6's lower bound itself, enforced since
    //    help-sections-expand rewrote all fourteen sections (2026-09-05). Below
    //    it a section is unfinished: 600 words is what rule 9's three
    //    obligations — a scenario per main action, the explicit "what happens"
    //    including the refusal, and a seam to the owner of every behaviour named
    //    but not owned — come to when they are actually written out. It replaced
    //    an anti-stub floor of 120, which by then could no longer go red.
    //  - RATIO holds the Ukrainian file against its English pair, and it is the
    //    anti-stub guard now: an absolute floor on uk would fire on a flawless
    //    translation, while catching
    //    nothing an English floor of 600 does not already catch. What it does
    //    catch, and what nothing caught before, is the section whose English half
    //    grew and whose Ukrainian half stayed as it was — the failure that hurts
    //    most, because `getHelpHtml` falls back to uk for every unknown locale,
    //    so a half-translated file is seen by MORE people than the English one.
    //    0.75 sits under the measured spread of the fourteen pairs, 0.798
    //    (background) to 0.895 (wishlist), with room for a tighter translation.
    //    It also subsumes the placeholder blacklist this suite once planned: a
    //    stub is caught however it is worded, which matters because rule 8 of the
    //    style guide REQUIRES settings.md to write "поки що недоступно" —
    //    forbidden and mandatory phrasing would have sat side by side.
    //  - CEILING is rule 6's upper bound. Past it a section is meant to be SPLIT
    //    into a new tab, not trimmed, so a failure here is a design prompt.
    //    Raised 1000 → 3000 on 2026-09-05 (help-word-floor) together with the
    //    floor: the 1:5 spread is what keeps the two meaning "unfinished" and
    //    "two sections in one", rather than squeezing every section to a length.
    //
    // Counted in JS deliberately: `wc -w` returns 0 for Cyrillic in this repo's
    // shell, which makes every uk file look a third of its real length.
    const FLOOR = 600;
    const CEILING = 3000;
    const RATIO = 0.75;
    const wordCount = (md: string) => md.split(/\s+/).filter(Boolean).length;
    const wordsIn = (locale: string, file: string) =>
      wordCount(fs.readFileSync(path.join(process.cwd(), "docs/help", locale, file), "utf-8"));

    const enDir = path.join(process.cwd(), "docs/help/en");
    for (const file of fs.readdirSync(enDir).filter((f) => f.endsWith(".md"))) {
      const en = wordsIn("en", file);
      expect(en, `en/${file} is under the floor — finish it, don't pad it (rule 9)`)
        .toBeGreaterThanOrEqual(FLOOR);
      expect(en, `en/${file} is over the ceiling — split it, don't trim`)
        .toBeLessThanOrEqual(CEILING);

      // Same section, the other locale: the pair is what the ratio is about.
      const uk = wordsIn("uk", file);
      expect(uk, `uk/${file} lags its en pair (${uk} vs ${en}) — the translation is behind`)
        .toBeGreaterThanOrEqual(Math.ceil(RATIO * en));
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
