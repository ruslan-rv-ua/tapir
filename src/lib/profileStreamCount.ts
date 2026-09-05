import { plural } from "./plural";
import * as m from "../i18n/paraglide/messages";

/**
 * Localized "{count} streams" for a profile.
 *
 * One owner on purpose: the profile row renders this phrase as visible text,
 * while `StreamTransferDialog` shows only the bare number and keeps the words
 * in an `aria-label`. Two copies could therefore drift into saying different
 * things on the two surfaces with both components' tests still green — each
 * only ever renders its own component. Why it lives here rather than in
 * `plural.ts` or on `ProfileItem`: backlog
 * `done/p3-profile-stream-count-label-duplicated.md`.
 *
 * The `other` form is passed because `profile_stream_count` is the one family
 * with a real `_other` key; every other family lets `plural` fall back to
 * `_many`.
 */
export function streamCountLabel(count: number): string {
  return plural(count, {
    one: () => m.profile_stream_count_one({ count }),
    few: () => m.profile_stream_count_few({ count }),
    many: () => m.profile_stream_count_many({ count }),
    other: () => m.profile_stream_count_other({ count }),
  });
}
