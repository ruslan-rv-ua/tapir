import { atom, computed } from "nanostores";
import type { StationResult, SearchParams, BrowserFilters, StreamInfo } from "../lib/tauri";
import { searchStationsIpc, getBrowserFilters, addStationFromBrowser, addStationsFromBrowser } from "../lib/tauri";
import { replaceSelection } from "./selection";
import { addToast } from "./toasts";
import * as m from "../i18n/paraglide/messages";

// --- State ---

export const $searchResults = atom<StationResult[]>([]);
/**
 * The rows on screen are no longer about the current criteria and a replacement is
 * coming, so the screen shows a loading card INSTEAD of them. Deliberately NOT "a
 * request is in flight": a foreign reply leaves this flag UP, because the fresh
 * request is still on the wire and lowering it would blink the card away and back.
 * The one criteria writer that issues no request of its own — resetSearch — lowers
 * it by hand, which is the whole of the rule and not an exception to it.
 * ADR 2026-09-15 «прапорець заміни належить екрану, а не запиту».
 */
export const $searchLoading = atom<boolean>(false);
/**
 * A further batch is in flight. The list stays on screen; only the button is busy.
 * Unlike $searchLoading this belongs to the PRESS, not to the result set: the press
 * is over the moment its reply lands, foreign or not, so this flag is lowered
 * unconditionally. Guarding it would leave it raised forever — no fresh append
 * follows a foreign one; a person has to press the button, and a busy button
 * cannot be pressed.
 */
export const $appendLoading = atom<boolean>(false);
/**
 * A NEW result set failed. Appending never sets this: an error card here would
 * take away the 50 results already on screen — a failed extra batch is reported
 * as a toast instead (loadMore below).
 */
export const $searchError = atom<string | null>(null);
/**
 * What the result set IS — query, filters, order, batch size. Where reading of it
 * has got to is deliberately not here: that position is the length of the prefix
 * already on screen ($searchResults), counted at request time, so it cannot drift
 * away from what the person sees. ADR 2026-09-04 «прочитаний початок і є курсор
 * пагінації»; vocabulary — CONTEXT.md §«Пошук станцій».
 */
export type SearchCriteria = Omit<SearchParams, "offset">;
export const $searchParams = atom<SearchCriteria>({
  limit: 50,
  order: "clickcount",
});
/**
 * What the rows on screen ANSWER — the very criteria object the replace that put
 * them there flew out with, or null when no answer is on screen. Not a second copy
 * of $searchParams: that one says what was ASKED, this one what the screen shows,
 * and between a keystroke and its debounced request the two deliberately differ
 * («вікно дебаунсу»). "The screen answers the field" is `$resultsFor === $searchParams`,
 * the same reference comparison the ticket makes.
 *
 * Invariant: non-empty $searchResults and $hasMore always belong to this. Writers:
 * an own replace (its criteria on success, null on failure) and resetSearch (null).
 * loadMore grows the same set and does not touch it; updateSearchParam is the window
 * and does not touch it either. ADR 2026-10-04 «Екран показує відповідь, а не поле» §2.
 */
export const $resultsFor = atom<SearchCriteria | null>(null);
export const $browserFilters = atom<BrowserFilters | null>(null);
export const $hasMore = atom<boolean>(false);
export const $popularStations = atom<StationResult[]>([]);
export const $popularLoading = atom<boolean>(false);
export const $popularError = atom<string | null>(null);

export const $isSearchActive = computed($searchParams, (params) =>
  Boolean(params.query || params.country || params.language || params.codec || params.minBitrate)
);

/** Multi-select for browser results (milestone D). Keyed by stationuuid. */
export const $stationSelection = atom<Set<string>>(new Set());

// --- Actions ---

/**
 * One request for a batch of the result set — shared by the two events that ask
 * for one, replacing and appending. Asks the catalogue for one MORE record than it
 * will show: whether that extra record came back IS the answer
 * to "is there more", instead of the guess "a full batch probably means more"
 * (which produced an empty final page). The +1 lives strictly here — `limit` in
 * SearchCriteria means "how many to show".
 */
async function fetchBatch(
  criteria: SearchCriteria,
  offset: number,
): Promise<{ results: StationResult[]; hasMore: boolean }> {
  const limit = criteria.limit ?? 50;
  const batch = await searchStationsIpc({ ...criteria, offset, limit: limit + 1 });
  return { results: batch.slice(0, limit), hasMore: batch.length > limit };
}

/**
 * The ticket both halves carry: a reply belongs to the criteria it flew out with,
 * and if those have changed while it was in the air it is about a result set nobody
 * is reading — «чужа порція», CONTEXT.md §«Пошук станцій». The ticket is the
 * REFERENCE, not a field-by-field comparison: it works because both criteria writers
 * (updateSearchParam, resetSearch) build a NEW object every time, and unchanged
 * criteria stay the very same one. Misfiring is only possible the conservative way —
 * criteria changed and changed back — which costs a discarded reply, never a wrong
 * screen. ADR 2026-09-04 §2.
 *
 * Shared between replacing and appending because «is this still ours» is one
 * question. What follows from a NO is not shared, and deliberately so: the replace
 * writes nothing (it reports to no one — see searchStations), the append REJECTS
 * (the trailing stop reads a resolve as «look at the rows» — see loadMore).
 */
function stillOurs(criteria: SearchCriteria): boolean {
  return $searchParams.get() === criteria;
}

/**
 * REPLACE the result set: a new query, filter or order. May take the list off the
 * screen (loading card, error card) precisely because the rows on it no longer
 * mean anything. Never rejects — the failure is already on screen as $searchError.
 *
 * Takes no criteria: it reads them from the store itself. A parameter here would be
 * a second copy of what $searchParams already holds, free to drift from it — the
 * same reason `offset` was taken out of SearchCriteria (ADR 2026-09-04 §1). It would
 * also make the ticket below a promise the caller has to keep rather than one the
 * function can keep itself.
 *
 * An own reply writes the whole answer: rows, $hasMore and $resultsFor together. An
 * own FAILURE drops the answer — rows, $hasMore, $resultsFor — and leaves only the
 * error: rows of criteria that are gone would lie under the error card to anyone
 * who reaches them («Виділити все»). A foreign reply writes NOTHING — not the rows,
 * not $hasMore, not the error, not the answer, and not the flag. One rule over every
 * field the result set owns, so the error that outlives its own request has nowhere
 * left to land.
 *
 * Until it is called the screen keeps showing the previous answer — the debounce
 * window, by design (ADR 2026-10-04 §1).
 */
export async function searchStations(): Promise<void> {
  const criteria = $searchParams.get();
  $searchLoading.set(true);
  $searchError.set(null);
  try {
    const { results, hasMore } = await fetchBatch(criteria, 0);
    if (!stillOurs(criteria)) return;
    $searchResults.set(results);
    $hasMore.set(hasMore);
    $resultsFor.set(criteria);
  } catch (e) {
    if (!stillOurs(criteria)) return;
    $searchResults.set([]);
    $hasMore.set(false);
    $resultsFor.set(null);
    $searchError.set(String(e));
  } finally {
    if (stillOurs(criteria)) $searchLoading.set(false);
  }
}

/**
 * Rejection value for a batch that landed into criteria nobody is reading any more.
 * It never reaches a person: the trailing stop reads ANY rejection as "nothing was
 * appended, leave the rows and the cursor alone", which is exactly what a foreign
 * batch deserves — resolving would make it read the press as a successful EMPTY
 * append and say "there is nothing more" about a result set that has plenty.
 */
class ForeignBatch extends Error {
  constructor() {
    super("batch landed into criteria that have since changed");
  }
}

/**
 * Rejection value for a press refused at the door: the rows on screen answer
 * criteria the field no longer holds (the debounce window), so there is no offset
 * that means anything for the new ones. Rejected for the same reason ForeignBatch
 * is — the trailing stop must read it as "nothing was appended".
 */
class ScreenBehindField extends Error {
  constructor() {
    super("the rows on screen answer criteria that have since changed");
  }
}

/**
 * APPEND the next batch of the SAME result set. Must not take the list away — the
 * cursor is standing in those rows — so a failure is a toast, and the state is
 * left exactly as it was: the next press asks for the very same page again.
 * Rejects so the caller (the trailing stop) can keep focus on the button it pressed.
 *
 * Refuses at the door, with no request, unless the screen answers the field. In the
 * debounce window the criteria are already new while the rows — the offset — are
 * still the old answer's; asking with both would glue the second page of one result
 * set onto the first of another, and the ticket could not catch it: the criteria are
 * genuinely the ones the batch flew out with. The new answer is on its way, so the
 * refusal is silent. The ticket on landing stays with the field: an append that left
 * while the screen answered the field and lands after a change is foreign, as before.
 * ADR 2026-10-04 §5.
 */
export async function loadMore(): Promise<void> {
  const criteria = $searchParams.get();
  if ($resultsFor.get() !== criteria) throw new ScreenBehindField();
  const offset = $searchResults.get().length;
  $appendLoading.set(true);
  try {
    const { results, hasMore } = await fetchBatch(criteria, offset);
    if (!stillOurs(criteria)) throw new ForeignBatch();
    $searchResults.set([...$searchResults.get(), ...results]);
    $hasMore.set(hasMore);
  } catch (e) {
    // Nothing to tell someone already reading another result set — so a batch that
    // FAILED after the criteria changed is silent too.
    if (stillOurs(criteria)) addToast(String(e), "error");
    throw e;
  } finally {
    // Unconditional: this flag belongs to the press, not to the set. See its docstring.
    $appendLoading.set(false);
  }
}

export async function loadFilters(): Promise<void> {
  try {
    const filters = await getBrowserFilters();
    $browserFilters.set(filters);
  } catch (e) {
    console.error("Failed to load browser filters:", e);
    addToast(m.browser_filters_load_error(), "error");
  }
}

export async function loadPopularStations(): Promise<void> {
  $popularLoading.set(true);
  $popularError.set(null);
  try {
    const results = await searchStationsIpc({ limit: 50, order: "clickcount" });
    $popularStations.set(results);
  } catch (e) {
    $popularError.set(String(e));
  } finally {
    $popularLoading.set(false);
  }
}

/** Returns the stream as it landed in the profile — the caller needs its codec
 *  verdict to say, in the same breath, that Tapir will not record it. */
export async function addStation(station: StationResult): Promise<StreamInfo> {
  return addStationFromBrowser(station);
}

/** Bulk add: backend appends in one save+emit (streams-changed reloads $streams). */
export async function addStations(stations: StationResult[]): Promise<StreamInfo[]> {
  return addStationsFromBrowser(stations);
}

export function updateSearchParam<K extends keyof SearchCriteria>(
  key: K,
  value: SearchCriteria[K],
): void {
  $searchParams.set({ ...$searchParams.get(), [key]: value });
  replaceSelection($stationSelection, new Set()); // new result set → drop selection
}

export function resetSearch(): void {
  $searchParams.set({ limit: 50, order: "clickcount" });
  $searchResults.set([]);
  $hasMore.set(false);
  $resultsFor.set(null);
  $searchError.set(null);
  // Not dead code, and not somebody else's field. This is the ONE criteria write
  // with no request behind it, so it is the one place that has to say «nothing is
  // coming» — a replace still in the air will land foreign and, by the rule above,
  // touch nothing at all, this flag included. Guarded by the store test «право
  // гасити»; delete this line and nothing looks wrong until someone presses
  // «Скинути фільтри» during a search.
  $searchLoading.set(false);
  replaceSelection($stationSelection, new Set());
}
