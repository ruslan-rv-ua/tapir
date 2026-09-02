import { expect, it } from "vitest";
import en from "./messages/en.json";
import uk from "./messages/uk.json";

/**
 * `pattern_hint` must lead with the matching rule, not with the wildcard symbols.
 *
 * `wishlist::matcher::wildcard_match` compares a pattern against the *whole*
 * "artist - title" string, so the most natural pattern a person can write — the
 * artist's name — matches nothing at all, and matches it silently. The hint under
 * the pattern field is the only place that rule is read at the moment it is
 * needed, so it carries a works/does-not pair before the symbol list.
 *
 * Guarded over the JSON rather than through `m.pattern_hint()`: paraglide compiles
 * one locale per run, and both locales carried the symbols-only wording.
 *
 * The example artist is deliberately not pinned — rewording is a translator's
 * business. What is pinned is the shape: some `X*` that works, the bare `X` that
 * does not, and both of them before `*` and `?` get explained.
 */

/** `Tycho*` in `… назвою: Tycho* працює …` — a name, then the star. */
const WORKING_EXAMPLE = /(\p{L}[\p{L}\d]*)\*/u;

it.each(Object.entries({ uk: uk.pattern_hint, en: en.pattern_hint }))(
  "%s: pattern_hint pairs works/does-not before listing the wildcards",
  (_locale, hint) => {
    const example = WORKING_EXAMPLE.exec(hint);
    expect(example, "an example pattern that works, e.g. Tycho*").not.toBeNull();
    const [works, bare] = example!;

    // The same name standing alone — neither `Tycho*` again nor `Tychonaut`.
    const alone = hint
      .split(bare)
      .slice(1)
      .some((rest) => !/^[*\p{L}]/u.test(rest));
    expect(alone, `${bare} on its own, the pattern that does not`).toBe(true);

    expect(hint, "the wildcard symbols").toContain("?");
    expect(hint.indexOf(works), "the pair comes before the symbols")
      .toBeLessThan(hint.indexOf("?"));
  },
);
