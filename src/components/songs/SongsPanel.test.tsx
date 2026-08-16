// src/components/songs/SongsPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $songs, $songsSelection, $songsQuery, $songsStation } from "../../stores/songs";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import type { Song } from "../../types/song";
import { useCallback, useRef } from "react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { useGlobalShortcuts } from "../../hooks/useGlobalShortcuts";
import * as tauri from "../../lib/tauri";
import { SongsPanel } from "./SongsPanel";

vi.mock("../../lib/tauri", () => ({
  listSavedSongs: vi.fn().mockResolvedValue([]),
  deleteSongs: vi.fn().mockResolvedValue({ deleted: [], skipped: [] }),
  // Pulled in by useGlobalShortcuts (Ctrl+M → muteControl) in the wired test below.
  setVolume: vi.fn().mockResolvedValue(undefined),
}));

// SongsPanel uses useTauriEvent; stub it so jsdom doesn't try to call the
// Tauri event bridge (which doesn't exist in the test environment).
vi.mock("../../hooks/useTauriEvent", () => ({ useTauriEvent: vi.fn() }));

const mk = (path: string): Song => ({
  path, fileName: path, title: path, artist: "", album: "", genre: "", station: "S",
  format: "mp3", durationMs: 0, sizeBytes: 1, recordedAt: "2026-01-01T00:00:00Z", isComplete: true,
});

beforeEach(() => {
  $songs.set([mk("a.mp3"), mk("b.mp3")]);
  $songsQuery.set("");
  $songsStation.set(null);
  replaceSelection($songsSelection, new Set());
});

const renderPanel = () => render(<SongsPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);

describe("SongsPanel — Ctrl+F target", () => {
  it("registers the filter zone as this section's Ctrl+F target", () => {
    const onZonesChange = vi.fn();
    render(<SongsPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
    const zones = onZonesChange.mock.lastCall![0] as ZoneEntry[];
    const searchable = zones.filter((z) => z.focusSearch);
    expect(searchable.map((z) => z.id)).toEqual(["songs-filter"]);

    act(() => searchable[0].focusSearch!());
    expect((document.activeElement as HTMLInputElement).type).toBe("search");
  });

  // Same end-to-end as BrowserPanel's: real zones + the real Tier-2 listener,
  // wired the way App.tsx wires them.
  it("Ctrl+F lands focus in the search field from another zone of the section", () => {
    function Wired() {
      const zonesRef = useRef<ZoneEntry[]>([]);
      const onZonesChange = useCallback((z: ZoneEntry[]) => { zonesRef.current = z; }, []);
      useGlobalShortcuts(zonesRef);
      return <SongsPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />;
    }
    const { getByText } = render(<Wired />);
    act(() => getByText(m.select_all()).focus());
    fireEvent.keyDown(getByText(m.select_all()), { code: "KeyF", ctrlKey: true });

    expect((document.activeElement as HTMLInputElement).placeholder)
      .toBe(m.songs_search_placeholder());
  });
});

describe("SongsPanel — selection cluster", () => {
  it("select-all selects every visible song and announces the count", () => {
    const { getByText } = renderPanel();
    fireEvent.click(getByText(m.select_all()));
    expect($songsSelection.get().size).toBe(2);
    expect($announcer.get()?.message).toBe(m.selection_count({ count: 2 }));
  });

  it("clears the selection when the search query changes (filter change)", () => {
    renderPanel();
    replaceSelection($songsSelection, new Set(["a.mp3"]));
    act(() => { $songsQuery.set("rock"); });
    expect($songsSelection.get().size).toBe(0);
  });

  it("clears the selection when the station filter changes", () => {
    renderPanel();
    replaceSelection($songsSelection, new Set(["a.mp3"]));
    act(() => { $songsStation.set("SomeStation"); });
    expect($songsSelection.get().size).toBe(0);
  });
});

// End of the row-key path: SongsList routes the intent, the panel owns the
// dialogs. Checked here because a dialog on screen is the only observation that
// proves the key actually does something for the user.
describe("SongsPanel — F2 / F4 open the row's dialogs", () => {
  /** Render with rows on screen (the panel reloads the list on mount). */
  async function renderLoaded() {
    vi.mocked(tauri.listSavedSongs).mockResolvedValue([mk("a.mp3"), mk("b.mp3")]);
    const utils = renderPanel();
    const row = await utils.findByRole("listitem", { name: /a\.mp3/ });
    return { ...utils, row };
  }

  it("F4 opens the tag editor", async () => {
    const { row, queryByText, getByText } = await renderLoaded();
    expect(queryByText(m.tag_editor_title())).toBeNull();
    fireEvent.keyDown(row, { key: "F4" });
    expect(getByText(m.tag_editor_title())).toBeTruthy();
  });

  it("F2 opens rename", async () => {
    const { row, queryByText, getByText } = await renderLoaded();
    expect(queryByText(m.rename_dialog_title())).toBeNull();
    fireEvent.keyDown(row, { key: "F2" });
    expect(getByText(m.rename_dialog_title())).toBeTruthy();
  });

  it("Alt+F4 opens nothing — the window close stays the system's", async () => {
    const { row, queryByText } = await renderLoaded();
    fireEvent.keyDown(row, { key: "F4", altKey: true });
    expect(queryByText(m.tag_editor_title())).toBeNull();
    expect(queryByText(m.rename_dialog_title())).toBeNull();
  });
});
