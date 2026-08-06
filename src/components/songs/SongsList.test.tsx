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
  path, fileName: path, title: path, artist: "", album: "", genre: "", station: "S",
  format: "mp3", durationMs: 0, sizeBytes: 1, recordedAt: "2026-01-01T00:00:00Z", isComplete: true,
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
  const onPlay = vi.fn();
  const utils = render(
    <SongsList ref={ref} exitZone={vi.fn()} onEmpty={onEmpty} onPlay={onPlay} onAction={onAction} />,
  );
  return { ref, onAction, onEmpty, onPlay, ...utils };
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
    await waitFor(() => expect($songsSelection.get().size).toBe(0));
    expect($announcer.get()?.message).toBe(m.songs_removed_bulk({ count: 2 }));
  });

  it("Delete with an empty selection routes a single delete to the panel", () => {
    const { ref, onAction } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    expect(onAction).toHaveBeenCalledWith("a.mp3", "delete");
  });
});

describe("SongsList — Enter modifiers act on the focused row", () => {
  const focusFirstRow = (ref: React.RefObject<SongsListHandle | null>) =>
    act(() => ref.current!.focus("forward"));

  it("plain Enter plays in the internal player", () => {
    const { ref, onPlay, onAction } = renderList();
    focusFirstRow(ref);
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onPlay).toHaveBeenCalledWith("a.mp3");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("Alt+Enter opens the row in the external app", () => {
    const { ref, onPlay, onAction } = renderList();
    focusFirstRow(ref);
    fireEvent.keyDown(document.activeElement!, { key: "Enter", altKey: true });
    expect(onAction).toHaveBeenCalledWith("a.mp3", "open");
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("Ctrl+Enter reveals the row in Explorer", () => {
    const { ref, onPlay, onAction } = renderList();
    focusFirstRow(ref);
    fireEvent.keyDown(document.activeElement!, { key: "Enter", ctrlKey: true });
    expect(onAction).toHaveBeenCalledWith("a.mp3", "explorer");
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("acts on the FOCUSED row, not on the selection", () => {
    replaceSelection($songsSelection, new Set(["b.mp3", "c.mp3"]));
    const { ref, onAction } = renderList();
    focusFirstRow(ref);
    fireEvent.keyDown(document.activeElement!, { key: "Enter", altKey: true });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("a.mp3", "open");
  });

  it("Alt+Space still plays — modifiers apply to Enter only", () => {
    const { ref, onPlay, onAction } = renderList();
    focusFirstRow(ref);
    fireEvent.keyDown(document.activeElement!, { key: " ", altKey: true });
    expect(onPlay).toHaveBeenCalledWith("a.mp3");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("advertises Alt+Enter and Control+Enter on the row via aria-keyshortcuts", () => {
    const { container } = renderList();
    const li = container.querySelector('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-keyshortcuts")).toBe("Alt+Enter Control+Enter");
  });
});
