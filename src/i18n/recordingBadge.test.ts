import { expect, it } from "vitest";
import en from "./messages/en.json";
import uk from "./messages/uk.json";

/**
 * The player's source badge must not borrow the word that names the process.
 *
 * `player_recording_badge` sits next to `LIVE` in the "Now playing" panel and
 * answers the same question — where the sound comes from: a station on air or a
 * saved file. It renders unconditionally for a file source and never looks at
 * recording statuses. CONTEXT.md §«Запис і Записи» keeps the singular for the
 * process (Tapir writing a stream to disk), so a badge reading «Запис» /
 * "Recording" beside a file name says the wrong thing exactly when it costs the
 * most: while some stream *is* being recorded, it reads as "this one is".
 *
 * Guarded over the JSON rather than through `m.*()`: vitest runs without the
 * paraglide plugin, so the compiled messages can lag behind the JSON, and the
 * JSON is what a translator edits. Both locales carried the process word.
 *
 * The stem is hard-coded per locale and checked against `settings_tab_recording`,
 * the tab that really is about the process — that keeps the test honest about
 * which word it bans. What it cannot pin is that the replacement is the *right*
 * word for a file; that half is held by prose — `docs/help/*\/player.md` quotes
 * the badge verbatim.
 */
const LOCALES = {
  uk: { badge: uk.player_recording_badge, processTab: uk.settings_tab_recording, stem: /запис/iu },
  en: { badge: en.player_recording_badge, processTab: en.settings_tab_recording, stem: /record/iu },
};

it.each(Object.entries(LOCALES))(
  "%s: the file badge does not reuse the recording-process word",
  (_locale, { badge, processTab, stem }) => {
    expect(processTab, "the stem names the process tab").toMatch(stem);
    expect(badge, `«${badge}» reads as the process, not as a file`).not.toMatch(stem);
    expect(badge.trim(), "the badge is not empty").not.toBe("");
  },
);
