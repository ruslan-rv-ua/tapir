import { useEffect, type RefObject } from "react";
import { matchShortcut, type ShortcutActions } from "../lib/shortcuts";
import type { ZoneEntry } from "./useZoneNavigation";
import { isInModal } from "../lib/shortcutGuard";
import { $activeSection, $commandPaletteOpen, $helpOpen } from "../stores/navigation";
import { $settings, $settingsDialogOpen, $profileSettingsTarget } from "../stores/settings";
import { $showAddStreamDialog, $statuses, $streams } from "../stores/streams";
import { $showCreateProfileDialog } from "../stores/profileManager";
import { $showAddPatternDialog } from "../stores/wishlist";
import { $showAddScheduleDialog } from "../stores/schedule";
import { $muteState, $playerStatus } from "../stores/player";
import { describePlayback, type PlaybackDescription } from "../lib/playbackAnnounce";
import { isSoundOff, toggleMute } from "../lib/muteControl";
import { formatDuration } from "../lib/formatters";
import { useAnnounce } from "./useAnnounce";
import * as m from "../i18n/paraglide/messages";

/**
 * Localize a playback description (F9). One key per reachable state × source
 * pair, so word order and punctuation belong to the translator; the muted clause
 * wraps a FINISHED sentence, which is why it can be added exactly once to any of
 * them — "nothing is playing" included.
 */
function nowPlayingMessage(description: PlaybackDescription, muted: boolean): string {
  let sentence: string;
  switch (description.kind) {
    case "nothing":
      sentence = m.f9_nothing();
      break;
    case "stream":
      sentence = description.track
        ? m.f9_stream({ station: description.station, track: description.track })
        : m.f9_stream_no_track({ station: description.station });
      break;
    case "preview":
      sentence = m.f9_preview({ name: description.name });
      break;
    case "file": {
      // An unknown position is spoken as "0:00" rather than dropped: §4 of the
      // record fixes seven keys and has none for a positionless file, and the
      // only moment a playing file has `positionMs: null` is before its first
      // progress tick — when 0:00 is what the position actually is.
      const position = formatDuration(description.positionMs ?? 0);
      sentence = description.paused
        ? m.f9_file_paused({ name: description.name, position })
        : m.f9_file({ name: description.name, position });
      break;
    }
  }
  return muted ? m.f9_muted({ sentence }) : sentence;
}

/**
 * Global Tier-2 webview shortcuts (Alt+digit, Ctrl+K, Ctrl+,, Ctrl+Shift+,, Ctrl+N,
 * Ctrl+M, F1, F9), dispatched through the pure `matchShortcut` registry.
 *
 * CAPTURE phase, not bubble: react-aria controls (notably the Browser
 * `SearchField`) swallow keydown in the bubble phase, so a bubble-phase window
 * listener misses shortcuts while such a field is focused. Capturing at the
 * window — the same approach `useZoneNavigation` uses for `F6` — lets the global
 * combo win first; a matched hit then `stopPropagation()`s so the focused
 * control does not also act on the key.
 *
 * Suppressed only while a modal/recorder is open (`isInModal`); every combo here
 * is modified or `F1`, so none collide with text entry — they deliberately fire
 * from a focused text field too (KB-14). Key auto-repeat is dropped (KB-06).
 *
 * Takes App.tsx's `orderedZonesRef` for `Ctrl+F`: it already holds the zones of
 * the CURRENT section plus the permanent ones, so "the search field of this
 * screen" is just the first entry that offers a `focusSearch` — no section→zone
 * map to drift out of sync, and no extra store.
 */
export function useGlobalShortcuts(orderedZonesRef: RefObject<ZoneEntry[]>): void {
  const announce = useAnnounce();
  useEffect(() => {
    const actions: ShortcutActions = {
      setSection: (s) => $activeSection.set(s),
      toggleCommandPalette: () => $commandPaletteOpen.set(!$commandPaletteOpen.get()),
      toggleSettings: () => $settingsDialogOpen.set(!$settingsDialogOpen.get()),
      toggleProfileSettings: () => {
        // Діє на активний профіль; toggle, як і Ctrl+, .
        if ($profileSettingsTarget.get() !== null) { $profileSettingsTarget.set(null); return; }
        const active = $settings.get()?.activeProfile;
        if (active) $profileSettingsTarget.set(active);
      },
      openAddStream: () => $showAddStreamDialog.set(true),
      openHelp: () => $helpOpen.set(true),
      openCreateProfile: () => $showCreateProfileDialog.set(true),
      openAddPattern: () => $showAddPatternDialog.set(true),
      openCreateSchedule: () => $showAddScheduleDialog.set(true),
      // The action, the guard and the wording belong to muteControl — the
      // player's mute button goes through the very same call.
      toggleMute: () => { void toggleMute(announce); },
      // Answers where the user stands: the announce moves no focus, so the
      // reading position in the list is kept. Assertive because it is the
      // reply to a keypress (a background event would be polite).
      announceNowPlaying: () => {
        const status = $playerStatus.get();
        const { description, muted } = describePlayback({
          status,
          statuses: $statuses.get(),
          streams: $streams.get(),
          // The state, not the toggle: a level at zero is the same silence and
          // gets the same clause.
          muted: isSoundOff($muteState.get().muted, status.volume),
        });
        announce(nowPlayingMessage(description, muted), "assertive");
      },
      // Focus the search field of the current screen. Asking the zone to focus
      // itself would land on whatever the user last touched there (the sort
      // <select>, say) — see restoreFocus in useFocusBoundary — hence a method of
      // its own, implemented only by zones that own a search field. Only Browser
      // and Songs do; everywhere else silence would be indistinguishable from a
      // wedged app, so the key answers with a short reply instead.
      focusSearch: () => {
        const zone = orderedZonesRef.current.find((z) => z.focusSearch);
        if (zone?.focusSearch) zone.focusSearch();
        else announce(m.search_none_on_screen(), "assertive");
      },
    };
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isInModal()) return;
      const ctx = { activeSection: $activeSection.get() };
      const hit = matchShortcut(e, ctx);
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        hit.run?.(actions, ctx);
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [announce, orderedZonesRef]);
}
