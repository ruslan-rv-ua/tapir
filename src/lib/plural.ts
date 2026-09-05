import { getLocale } from "../i18n/paraglide/runtime";

/**
 * One family of pluralised messages, as thunks the caller closes over its own
 * count and substitutions. `zero` and `other` are optional because not every
 * family has that key — see `plural` for what happens when they are missing.
 */
export interface PluralForms {
  /** `count === 0`. Present only where the app has its own "nothing" sentence. */
  zero?: () => string;
  one: () => string;
  few: () => string;
  many: () => string;
  /** A genuine `_other` key. Only `profile_stream_count` has one today. */
  other?: () => string;
}

/**
 * Pick the plural form for `count` and render it.
 *
 * The locale comes from `getLocale()` and from nowhere else — deliberately no
 * `locale` parameter. `getLocale()` is what `m.*()` uses to choose the **text**,
 * so it is the only input that keeps form and text agreeing inside one sentence.
 * A parameter here would just be a second source again (research
 * `done/p2-paraglide-native-plurals.md`, option (в)).
 */
export function plural(count: number, forms: PluralForms): string {
  // Zero is an application case, not a language form: neither uk nor en has a
  // CLDR `zero` category, yet Tapir wants its own sentence for "none at all".
  if (count === 0 && forms.zero) return forms.zero();

  switch (new Intl.PluralRules(getLocale()).select(count)) {
    case "one":
      return forms.one();
    case "few":
      return forms.few();
    case "many":
      return forms.many();
    default:
      // CLDR's catch-all — and the only category `en` has past `one`. Tapir's
      // keys call that form `_many`; the convention is older than CLDR here and
      // is shared with the Rust tray layer (ADR native-layer-localisation), so
      // it stays until the move to Paraglide variants. A family that does own a
      // real `_other` key gets it; the rest fall back. This is the single place
      // that mapping lives.
      return (forms.other ?? forms.many)();
  }
}
