// src/components/songs/SongsList.test.tsx
import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $songs, $songsSelection } from "../../stores/songs";
import { $announcer } from "../../stores/announcer";
import { $playerStatus } from "../../stores/player";
import { replaceSelection } from "../../stores/selection";
import type { Song } from "../../types/song";
import * as tauri from "../../lib/tauri";
import { SongsList, type SongsListHandle } from "./SongsList";

vi.mock("../../lib/tauri", () => ({
  deleteSongs: vi.fn().mockResolvedValue({ deleted: ["b.mp3", "c.mp3"], skipped: [] }),
  playSavedSong: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
}));

const mk = (path: string): Song => ({
  path, fileName: path, title: path, artist: "", album: "", station: "S",
  durationMs: 0, sizeBytes: 1, recordedAt: "2026-01-01T00:00:00Z", isComplete: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
  $songs.set([mk("a.mp3"), mk("b.mp3"), mk("c.mp3")]);
  replaceSelection($songsSelection, new Set());
});

function renderList() {
  const ref = createRef<SongsListHandle>();
  const onAction = vi.fn();
  const onEmpty = vi.fn();
  const utils = render(
    <SongsList ref={ref} exitZone={vi.fn()} onEmpty={onEmpty} onPlay={vi.fn()} onAction={onAction} />,
  );
  return { ref, onAction, onEmpty, ...utils };
}

describe("SongsList — bulk delete", () => {
  it("requestBulkDelete opens a confirm with the exact count, deletes, and announces the summary", async () => {
    replaceSelection($songsSelection, new Set(["b.mp3", "c.mp3"]));
    const { ref, getByText } = renderList();
    act(() => ref.current!.requestBulkDelete());
    expect(getByText(m.confirm_delete_selected_songs({ count: 2 }))).toBeTruthy();
    fireEvent.click(getByText(m.songs_action_delete())); // confirm button label
    await waitFor(() => expect(tauri.deleteSongs).toHaveBeenCalledWith(["b.mp3", "c.mp3"]));
    await waitFor(() => expect($songs.get().map((s) => s.path)).toEqual(["a.mp3"]));
    expect($announcer.get()?.message).toBe(m.songs_removed_bulk({ count: 2 }));
  });

  it("Delete with an empty selection routes a single delete to the panel", () => {
    const { ref, onAction } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    expect(onAction).toHaveBeenCalledWith("a.mp3", "delete");
  });
});
