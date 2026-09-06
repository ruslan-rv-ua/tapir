/**
 * One identity string for a list's RESULT SET, built from the criteria that
 * define it (CONTEXT.md «Вибірка»).
 *
 * Every screen that can replace its result set hands `CompositeList` one of
 * these. A different string means the person asked for a different set — the
 * list forgets its current stop and starts at the first row; the same string
 * with different rows means the data drifted on its own and the stop stays.
 * The rule itself is in
 * docs/decisions/2026-09-06-new-result-set-forgets-the-current-stop.md.
 *
 * JSON rather than a joined string, so the criteria cannot run into each other:
 * a query "ab" beside a station "c" must not read as "a" beside "bc". `null` and
 * `undefined` both mean "this criterion is not set" and encode the same, so a
 * screen may leave a criterion it never sets out of the array entirely — as long
 * as it does so ALWAYS, the position of the rest is what carries the meaning.
 */
export function resultSetKey(
  criteria: ReadonlyArray<string | number | boolean | null | undefined>,
): string {
  return JSON.stringify(criteria.map((c) => c ?? null));
}
