// Seed patterns for the empty-state CTA. Deliberately NOT i18n: stream metadata
// is dictated by the station, not by the UI language — a Ukrainian-speaking
// listener of SomaFM gets English ICY tags and vice versa, so every locale gets
// the same bilingual seed. Bulk delete makes pruning the unwanted half cheap.
//
// Every pattern is wrapped in `*…*` because wishlist::matcher::wildcard_match is
// anchored (full-string), not substring — bare `новин` would only match the exact
// string `новин`. The wrapper doubles as a live demo of the syntax.

/** `*новин*` is broader than `*новини*` — it catches Ukrainian case endings. */
export const EXAMPLE_WISHLIST_PATTERNS: readonly string[] = ["*новин*", "*news*"];

export const EXAMPLE_IGNORELIST_PATTERNS: readonly string[] = [
  "*реклама*",
  "*джингл*",
  "*advert*",
  "*jingle*",
  "*promo*",
];
