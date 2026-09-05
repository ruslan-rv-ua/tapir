import { describe, it, expect, vi } from "vitest";
import { plural } from "./plural";

const runtime = vi.hoisted(() => ({ locale: "uk" }));
vi.mock("../i18n/paraglide/runtime", () => ({ getLocale: () => runtime.locale }));

/** The suffixes a plural family carries in `src/i18n/messages/*.json`. */
const forms = {
  zero: () => "zero",
  one: () => "one",
  few: () => "few",
  many: () => "many",
};

describe("plural", () => {
  it("picks the Ukrainian forms by CLDR category", () => {
    runtime.locale = "uk";
    expect(plural(1, forms)).toBe("one");
    expect(plural(2, forms)).toBe("few");
    expect(plural(5, forms)).toBe("many");
    expect(plural(21, forms)).toBe("one");
    expect(plural(22, forms)).toBe("few");
  });

  it("falls English `other` back to the `_many` key", () => {
    // CLDR gives `en` exactly two categories, `one` and `other`; Tapir's keys
    // have no `_other` in most families, so `other` lands on `_many`.
    runtime.locale = "en";
    expect(plural(1, forms)).toBe("one");
    expect(plural(2, forms)).toBe("many");
  });

  it("prefers a real `other` form over that fallback", () => {
    // `profile_stream_count` is the one family with a genuine `_other` key.
    const withOther = { ...forms, other: () => "other" };
    runtime.locale = "en";
    expect(plural(2, withOther)).toBe("other");
    runtime.locale = "uk";
    expect(plural(2, withOther)).toBe("few");
  });

  it("treats zero as an application case, ahead of Intl.PluralRules", () => {
    runtime.locale = "uk";
    expect(plural(0, forms)).toBe("zero"); // CLDR uk would say `many`
    runtime.locale = "en";
    expect(plural(0, forms)).toBe("zero"); // CLDR en would say `other`
  });

  it("leaves zero to the language when the family has no zero form", () => {
    const noZero = { one: forms.one, few: forms.few, many: forms.many };
    runtime.locale = "uk";
    expect(plural(0, noZero)).toBe("many");
    runtime.locale = "en";
    expect(plural(0, noZero)).toBe("many");
  });
});
