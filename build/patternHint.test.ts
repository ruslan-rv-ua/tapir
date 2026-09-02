import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `pattern_hint` must lead with the matching rule, not with the wildcard symbols.
 *
 * `wishlist::matcher::wildcard_match` compares a pattern against the *whole*
 * "artist - title" string, so the most natural pattern a person can write — the
 * artist's name — matches nothing at all, silently. The hint under the pattern
 * field is the only place that rule is read at the moment it is needed, so it
 * names the rule first and carries a works/does-not pair before the symbols.
 *
 * Guarded over the JSON rather than through paraglide: a component test compiles
 * one locale, and both locales carried the symbols-only wording.
 *
 * Lives in `build/` — the shelf for Node-side checks — because `tsconfig` checks
 * `src` against DOM types only, without `node:fs`.
 */

const LOCALES = ["uk", "en"] as const;

function patternHint(locale: string): string {
  const path = join(process.cwd(), "src", "i18n", "messages", `${locale}.json`);
  return JSON.parse(readFileSync(path, "utf8")).pattern_hint;
}

it.each(LOCALES)("%s: pattern_hint pairs works/does-not before listing the wildcards", (locale) => {
  const hint = patternHint(locale);
  const works = hint.indexOf("Tycho*");
  expect(works, "a pattern that works").toBeGreaterThan(-1);
  expect(hint, "and the bare one that does not").toMatch(/Tycho(?!\*)/);
  expect(works, "the pair comes before the symbol list").toBeLessThan(hint.indexOf("?"));
});
