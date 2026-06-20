// src/components/songs/SongsPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $songs, $songsSelection, $songsQuery } from "../../stores/songs";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import type { Song } from "../../types/song";
import { SongsPanel } from "./SongsPanel";

vi.mock("../../lib/tauri", () => ({
  listSavedSongs: vi.fn().mockResolvedValue([]),
  deleteSongs: vi.fn().mockResolvedValue({ deleted: [], skipped: [] }),
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
  replaceSelection($songsSelection, new Set());
});

const renderPanel = () => render(<SongsPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);

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
    $songsQuery.set("rock");
    expect($songsSelection.get().size).toBe(0);
  });
});
