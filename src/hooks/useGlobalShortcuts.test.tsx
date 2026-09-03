import { useEffect, useRef, type ReactNode } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { useGlobalShortcuts } from "./useGlobalShortcuts";
import type { ZoneEntry } from "./useZoneNavigation";
import { $activeSection, $commandPaletteOpen } from "../stores/navigation";
import { $showAddStreamDialog, $streams, $statuses } from "../stores/streams";
import { $showCreateProfileDialog } from "../stores/profileManager";
import { $showAddPatternDialog } from "../stores/wishlist";
import { $showAddScheduleDialog } from "../stores/schedule";
import { $settings, $settingsDialogOpen, $profileSettingsTarget } from "../stores/settings";
import { $muteState, $playerStatus } from "../stores/player";
import { $announcer } from "../stores/announcer";
import * as tauri from "../lib/tauri";
import * as m from "../i18n/paraglide/messages";
import type { StreamInfo } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({ setVolume: vi.fn().mockResolvedValue(undefined) }));

function Harness({ children, zones = [] }: { children?: ReactNode; zones?: ZoneEntry[] }) {
  // Stands in for App.tsx's orderedZonesRef: already section-scoped, permanent
  // zones included.
  const zonesRef = useRef<ZoneEntry[]>(zones);
  zonesRef.current = zones;
  useGlobalShortcuts(zonesRef);
  return <>{children}</>;
}

/** A zone with no search field — the ordinary case (lists, toolbars). */
const plainZone = (id: string, focus = vi.fn()): ZoneEntry => ({
  id,
  el: document.createElement("div"),
  focus,
});

/** A zone that owns a search field, i.e. one that implements focusSearch. */
const searchZone = (id: string, focusSearch: () => void): ZoneEntry => ({
  ...plainZone(id),
  focusSearch,
});

// A field that swallows keydown in the BUBBLE phase via a native listener —
// reproduces react-aria's SearchField, which is why the old bubble-phase global
// listener missed Alt+digit/Ctrl+K while such a field was focused. A capture-
// phase global listener must still win.
function SwallowingField() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const stop = (e: KeyboardEvent) => e.stopPropagation();
    el.addEventListener("keydown", stop);
    return () => el.removeEventListener("keydown", stop);
  }, []);
  return <input data-testid="field" ref={ref} />;
}

const mkStream = (id: string, name: string): StreamInfo => ({
  id, url: `http://${id}`, name, format: "mp3", unsupportedCodec: null, bitrate: 128,
  icyName: null, icyGenre: null, icyUrl: null, ignorelist: [],
  username: null, password: null, addedAt: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
  $muteState.set({ muted: false, savedVolume: 0.75, restoring: false });
  $announcer.set(null);
  $streams.set([]);
  $statuses.set({});
  $activeSection.set("browser");
  $commandPaletteOpen.set(false);
  $showAddStreamDialog.set(false);
  $showCreateProfileDialog.set(false);
  $showAddPatternDialog.set(false);
  $showAddScheduleDialog.set(false);
  $settingsDialogOpen.set(false);
  $profileSettingsTarget.set(null);
  $settings.set({ activeProfile: "Jazz" } as never);
});

describe("useGlobalShortcuts", () => {
  it("switches section on Alt+digit even when the focused field swallows bubbling keydown", () => {
    render(
      <Harness>
        <SwallowingField />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Digit1", altKey: true });
    expect($activeSection.get()).toBe("streams");
  });

  it("opens the command palette on Ctrl+K from a swallowing field", () => {
    render(
      <Harness>
        <SwallowingField />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyK", ctrlKey: true });
    expect($commandPaletteOpen.get()).toBe(true);
  });

  it("does nothing while focus is inside a modal", () => {
    render(
      <Harness>
        <div role="dialog">
          <input data-testid="field" />
        </div>
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Digit1", altKey: true });
    expect($activeSection.get()).toBe("browser");
  });

  it("ignores key auto-repeat", () => {
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Digit1", altKey: true, repeat: true });
    expect($activeSection.get()).toBe("browser");
  });

  // Дві комбінації на одній фізичній клавіші — регресія межі глобальне/профільне.
  it("opens the profile-settings dialog on Ctrl+Shift+, and leaves app settings shut", () => {
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Comma", ctrlKey: true, shiftKey: true });
    expect($profileSettingsTarget.get()).toBe("Jazz");
    expect($settingsDialogOpen.get()).toBe(false);
  });

  it("opens app settings on Ctrl+, and leaves the profile dialog shut", () => {
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Comma", ctrlKey: true });
    expect($settingsDialogOpen.get()).toBe(true);
    expect($profileSettingsTarget.get()).toBeNull();
  });

  // Toggle-скидання стора. У застосунку його дає Escape: щойно діалог
  // відкрито, фокус усередині модалки, а `isInModal()` глушить глобальні
  // комбінації — те саме обмеження, що й у наявного `Ctrl+,`.
  it("a second Ctrl+Shift+, from outside a modal clears the target", () => {
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Comma", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Comma", ctrlKey: true, shiftKey: true });
    expect($profileSettingsTarget.get()).toBeNull();
  });

  it("opens Add Stream on Ctrl+N only on the streams section", () => {
    $activeSection.set("streams");
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
    expect($showAddStreamDialog.get()).toBe(true);
  });

  it("does not open Add Stream on Ctrl+N off the streams section", () => {
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
    expect($showAddStreamDialog.get()).toBe(false);
  });

  it("opens Create Profile on Ctrl+N on the profiles section, not Add Stream", () => {
    $activeSection.set("profiles");
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
    expect($showCreateProfileDialog.get()).toBe(true);
    expect($showAddStreamDialog.get()).toBe(false);
  });

  it("opens Add Pattern on Ctrl+N on the wishlist section, not Add Stream", () => {
    $activeSection.set("wishlist");
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
    expect($showAddPatternDialog.get()).toBe(true);
    expect($showAddStreamDialog.get()).toBe(false);
  });

  it("opens Create Schedule on Ctrl+N on the schedule section, not Add Stream", () => {
    $activeSection.set("schedule");
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
    expect($showAddScheduleDialog.get()).toBe(true);
    expect($showAddStreamDialog.get()).toBe(false);
  });
});

/** A stream playing, so the player is active for mute/now-playing. */
function playingStream() {
  $streams.set([mkStream("s1", "Jazz FM")]);
  $statuses.set({
    s1: {
      streamId: "s1", state: "recording",
      currentTrack: { artist: "Miles", title: "So What", album: "", startedAt: "", ignored: false },
      recordingStartedAt: null, bytesRecorded: 0, tracksRecorded: 0,
      error: null, reconnectAttempt: null, reconnectMaxRetries: null, sessionId: 1,
    },
  });
  $playerStatus.set({
    state: "playing", source: { type: "stream", streamId: "s1" },
    volume: 0.6, positionMs: null, durationMs: null,
  });
}

/** A catalogue station playing straight from the Browser, not added anywhere. */
function playingPreview() {
  $streams.set([]);
  $statuses.set({});
  $playerStatus.set({
    state: "playing", source: { type: "preview", url: "http://x/live", name: "Radio X" },
    volume: 0.6, positionMs: null, durationMs: null,
  });
}

function renderWithField() {
  render(
    <Harness>
      <input data-testid="field" />
    </Harness>,
  );
  act(() => screen.getByTestId("field").focus());
  return screen.getByTestId("field");
}

describe("useGlobalShortcuts — Ctrl+M (mute)", () => {
  it("mutes, remembers the volume, and announces the resulting STATE", async () => {
    playingStream();
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "KeyM", ctrlKey: true });
    await waitFor(() => expect(tauri.setVolume).toHaveBeenCalledWith(0));
    expect($muteState.get().muted).toBe(true);
    expect($muteState.get().savedVolume).toBe(0.6);
    // The STATE ("sound off"), not the button's next-action label ("Mute").
    expect($announcer.get()?.message).toBe(m.player_muted());
    expect($announcer.get()?.message).not.toBe(m.player_mute_action());
    expect($announcer.get()?.priority).toBe("assertive");
  });

  it("unmutes on the second press, restoring the saved volume", async () => {
    playingStream();
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "KeyM", ctrlKey: true });
    await waitFor(() => expect($muteState.get().muted).toBe(true));
    fireEvent.keyDown(field, { code: "KeyM", ctrlKey: true });
    await waitFor(() => expect($muteState.get().muted).toBe(false));
    expect(tauri.setVolume).toHaveBeenLastCalledWith(0.6);
    expect($announcer.get()?.message).toBe(m.player_unmuted());
  });

  it("ignores key auto-repeat, so a held Ctrl+M cannot flicker the state", () => {
    playingStream();
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "KeyM", ctrlKey: true, repeat: true });
    expect(tauri.setVolume).not.toHaveBeenCalled();
    expect($muteState.get().muted).toBe(false);
  });

  it("does nothing while a modal is open", () => {
    playingStream();
    render(
      <Harness>
        <div role="dialog">
          <input data-testid="modal-field" />
        </div>
      </Harness>,
    );
    act(() => screen.getByTestId("modal-field").focus());
    fireEvent.keyDown(screen.getByTestId("modal-field"), { code: "KeyM", ctrlKey: true });
    expect(tauri.setVolume).not.toHaveBeenCalled();
    expect($muteState.get().muted).toBe(false);
  });

  it("RAISES the sound at a zero level instead of announcing silence again", async () => {
    playingStream();
    // The level was brought down to zero by the global key — `muted` stayed false.
    $playerStatus.set({ ...$playerStatus.get(), volume: 0 });
    $muteState.set({ muted: false, savedVolume: 0.6, restoring: false });
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "KeyM", ctrlKey: true });
    await waitFor(() => expect(tauri.setVolume).toHaveBeenCalledWith(0.6));
    expect($announcer.get()?.message).toBe(m.player_unmuted());
  });
});

describe("useGlobalShortcuts — Ctrl+F (focus the screen's search)", () => {
  function renderWithZones(zones: ZoneEntry[]) {
    render(
      <Harness zones={zones}>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    return screen.getByTestId("field");
  }

  it("calls focusSearch on the first zone that has one, whatever the zone order", () => {
    const focusSearch = vi.fn();
    const plainFocus = vi.fn();
    const field = renderWithZones([
      plainZone("activity-bar", plainFocus),
      plainZone("songs-selection", plainFocus),
      searchZone("songs-filter", focusSearch),
      plainZone("songs-list", plainFocus),
    ]);
    fireEvent.keyDown(field, { code: "KeyF", ctrlKey: true });
    expect(focusSearch).toHaveBeenCalledOnce();
    // The zone's own focus() would restore the LAST-TOUCHED control (a sort
    // <select>, say) — which is exactly why focusSearch exists.
    expect(plainFocus).not.toHaveBeenCalled();
  });

  it("takes the first search zone when the screen registers several", () => {
    const first = vi.fn();
    const second = vi.fn();
    const field = renderWithZones([
      searchZone("browser-search", first),
      searchZone("other-search", second),
    ]);
    fireEvent.keyDown(field, { code: "KeyF", ctrlKey: true });
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it("answers out loud on a section with no search, without moving focus", () => {
    const field = renderWithZones([
      plainZone("activity-bar"),
      plainZone("schedule-list"),
      plainZone("player"),
    ]);
    const notPrevented = fireEvent.keyDown(field, { code: "KeyF", ctrlKey: true });
    expect($announcer.get()?.message).toBe(m.search_none_on_screen());
    // A reply to a keypress, not a background event.
    expect($announcer.get()?.priority).toBe("assertive");
    expect(document.activeElement).toBe(field);
    // The key is still consumed — WebView2's find bar must not open behind it.
    expect(notPrevented).toBe(false);
  });

  it("survives an empty zone list", () => {
    const field = renderWithZones([]);
    expect(() => fireEvent.keyDown(field, { code: "KeyF", ctrlKey: true })).not.toThrow();
    expect($announcer.get()?.message).toBe(m.search_none_on_screen());
  });

  it("does nothing while a modal is open — the guard alone kills the find bar there", () => {
    const focusSearch = vi.fn();
    render(
      <Harness zones={[searchZone("browser-search", focusSearch)]}>
        <div role="dialog">
          <input data-testid="modal-field" />
        </div>
      </Harness>,
    );
    act(() => screen.getByTestId("modal-field").focus());
    fireEvent.keyDown(screen.getByTestId("modal-field"), { code: "KeyF", ctrlKey: true });
    expect(focusSearch).not.toHaveBeenCalled();
    expect($announcer.get()).toBeNull();
  });
});

describe("useGlobalShortcuts — F9 (what is playing)", () => {
  it("announces station and track without moving focus", () => {
    playingStream();
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9" });
    // The sound clause is unconditional (§6), so every F9 answer carries it.
    expect($announcer.get()?.message).toBe(
      m.f9_volume({
        sentence: m.f9_live({ station: "Jazz FM", track: "Miles — So What" }),
        level: m.volume_level({ percent: 60 }),
      }),
    );
    expect($announcer.get()?.priority).toBe("assertive");
    expect(document.activeElement).toBe(field);
  });

  it("names the station alone when the broadcast sends no track", () => {
    playingStream();
    $statuses.set({});
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9" });
    expect($announcer.get()?.message).toBe(
      m.f9_volume({
        sentence: m.f9_live_no_track({ station: "Jazz FM" }),
        level: m.volume_level({ percent: 60 }),
      }),
    );
  });

  // The catalogue station goes through the very same key as a trackless
  // broadcast — it has no branch of its own left to drift.
  it("answers for a catalogue station exactly as for a station with no track", () => {
    playingPreview();
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9" });
    expect($announcer.get()?.message).toBe(
      m.f9_volume({
        sentence: m.f9_live_no_track({ station: "Radio X" }),
        level: m.volume_level({ percent: 60 }),
      }),
    );
  });

  it("answers 'nothing is playing' rather than staying silent", () => {
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9" });
    expect($announcer.get()?.message).toBe(
      m.f9_volume({ sentence: m.f9_nothing(), level: m.volume_level({ percent: 75 }) }),
    );
  });

  it("names the file and its position, and marks a pause as a pause", () => {
    $playerStatus.set({
      state: "paused", source: { type: "file", path: "rec/a.mp3" },
      volume: 0.6, positionMs: 65_000, durationMs: 200_000,
    });
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9" });
    expect($announcer.get()?.message).toBe(
      m.f9_volume({
        sentence: m.f9_file_paused({ name: "a.mp3", position: "1:05" }),
        level: m.volume_level({ percent: 60 }),
      }),
    );
  });

  it("adds the muted clause only while muted", () => {
    playingStream();
    $muteState.set({ muted: true, savedVolume: 0.6, restoring: false });
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9" });
    expect($announcer.get()?.message).toBe(
      m.f9_muted({ sentence: m.f9_live({ station: "Jazz FM", track: "Miles — So What" }) }),
    );
  });

  it("names the level when the sound is on — one clause, never both", () => {
    playingStream();
    $playerStatus.set({ ...$playerStatus.get(), volume: 0.45 });
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9" });
    const message = $announcer.get()!.message;
    expect(message).toBe(
      m.f9_volume({
        sentence: m.f9_live({ station: "Jazz FM", track: "Miles — So What" }),
        level: m.volume_level({ percent: 45 }),
      }),
    );
    expect(message).not.toContain(m.player_muted());
  });

  it("names the level even when nothing is playing — the clause is unconditional", () => {
    $playerStatus.set({ ...$playerStatus.get(), volume: 0.45 });
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9" });
    expect($announcer.get()?.message).toBe(
      m.f9_volume({ sentence: m.f9_nothing(), level: m.volume_level({ percent: 45 }) }),
    );
  });

  it("speaks the SAME level clause the volume key speaks", () => {
    // §7: the key and the question answer with one string, not two that agree
    // today. Both go through selectVolumeAnnouncement → m.volume_level.
    playingStream();
    $playerStatus.set({ ...$playerStatus.get(), volume: 0.45 });
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9" });
    expect($announcer.get()?.message).toContain(m.volume_level({ percent: 45 }));
  });

  it("names a zero level with the SAME clause as the toggle", () => {
    playingStream();
    $playerStatus.set({ ...$playerStatus.get(), volume: 0 });
    $muteState.set({ muted: false, savedVolume: 0.6, restoring: false });
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9" });
    expect($announcer.get()?.message).toBe(
      m.f9_muted({ sentence: m.f9_live({ station: "Jazz FM", track: "Miles — So What" }) }),
    );
  });

  it("ignores key auto-repeat", () => {
    playingStream();
    const field = renderWithField();
    fireEvent.keyDown(field, { code: "F9", repeat: true });
    expect($announcer.get()).toBeNull();
  });
});
