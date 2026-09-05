import { describe, it, expect, vi } from "vitest";
import { streamCountLabel } from "./profileStreamCount";

const runtime = vi.hoisted(() => ({ locale: "uk" }));
vi.mock("../i18n/paraglide/runtime", () => ({ getLocale: () => runtime.locale }));

// Named after the key each form comes from, so a wrong pick is legible as a
// wrong key rather than as a wrong translation.
vi.mock("../i18n/paraglide/messages", () => ({
  profile_stream_count_one: ({ count }: { count: number }) => `one:${count}`,
  profile_stream_count_few: ({ count }: { count: number }) => `few:${count}`,
  profile_stream_count_many: ({ count }: { count: number }) => `many:${count}`,
  profile_stream_count_other: ({ count }: { count: number }) => `other:${count}`,
}));

describe("streamCountLabel", () => {
  it("picks the Ukrainian form for the count", () => {
    runtime.locale = "uk";
    expect(streamCountLabel(1)).toBe("one:1");
    expect(streamCountLabel(2)).toBe("few:2");
    expect(streamCountLabel(5)).toBe("many:5");
  });

  it("uses the family's own `_other` key where CLDR asks for it", () => {
    // Not a copy of plural.test.ts's `other` case: that one pins the dispatch
    // given an `other` form, this one pins that THIS family supplies a fourth
    // form at all. Drop `other` from the module and only this case goes red —
    // uk never reaches the category.
    runtime.locale = "en";
    expect(streamCountLabel(2)).toBe("other:2");
  });
});
