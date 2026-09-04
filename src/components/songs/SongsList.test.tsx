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

  // A modified Space is not the list's key (ADR 2026-09-04 §1): it does not
  // act, and Alt keeps its default — that is Windows' window menu, not ours.
  it("a modified Space does nothing — and Alt+Space is not even swallowed", () => {
    const { ref, onPlay, onAction } = renderList();
    focusFirstRow(ref);

    const altNotPrevented = fireEvent.keyDown(document.activeElement!, {
      key: " ", code: "Space", altKey: true, bubbles: true,
    });
    fireEvent.keyDown(document.activeElement!, {
      key: " ", code: "Space", shiftKey: true, bubbles: true,
    });
    expect(onPlay).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
    expect(altNotPrevented).toBe(true);
  });

  it("bare Space still plays the focused row", () => {
    const { ref, onPlay } = renderList();
    focusFirstRow(ref);
    fireEvent.keyDown(document.activeElement!, { key: " ", code: "Space", bubbles: true });
    expect(onPlay).toHaveBeenCalledWith("a.mp3");
  });

  it("advertises Alt+Enter and Control+Enter on the row via aria-keyshortcuts", () => {
    const { container } = renderList();
    const li = container.querySelector('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-keyshortcuts")).toBe("F2 F4 Alt+Enter Control+Enter");
  });
});

// Total Commander / FAR convention: F2 = name, F4 = content. Both act on the
// FOCUSED row (never the selection) and route through the same entry point the
// ⋯-menu uses, so keyboard and menu open the very same dialogs.
describe("SongsList — F2 / F4 row keys", () => {
  const focusFirstRow = (ref: React.RefObject<SongsListHandle | null>) =>
    act(() => ref.current!.focus("forward"));

  it("F4 opens the tag editor for the focused row", () => {
    const { ref, onAction } = renderList();
    focusFirstRow(ref);
    fireEvent.keyDown(document.activeElement!, { key: "F4" });
    expect(onAction).toHaveBeenCalledWith("a.mp3", "tags");
  });

  it("F2 opens rename for the focused row", () => {
    const { ref, onAction } = renderList();
    focusFirstRow(ref);
    fireEvent.keyDown(document.activeElement!, { key: "F2" });
    expect(onAction).toHaveBeenCalledWith("a.mp3", "rename");
  });

  it("acts on the FOCUSED row, not on the selection", () => {
    replaceSelection($songsSelection, new Set(["b.mp3", "c.mp3"]));
    const { ref, onAction } = renderList();
    focusFirstRow(ref);
    fireEvent.keyDown(document.activeElement!, { key: "F4" });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("a.mp3", "tags");
  });

  // Alt+F4 must stay the system window close — the list declines the match
  // before consuming the key, so nothing is swallowed either. F2 answers to the
  // same rule: the pair is one convention, not two.
  it("declines any modifier on F4 and on F2", () => {
    const { ref, onAction } = renderList();
    focusFirstRow(ref);
    for (const mods of [{ altKey: true }, { ctrlKey: true }, { shiftKey: true }]) {
      fireEvent.keyDown(document.activeElement!, { key: "F4", ...mods });
      fireEvent.keyDown(document.activeElement!, { key: "F2", ...mods });
    }
    expect(onAction).not.toHaveBeenCalled();
  });

  it("F4 on an empty list does nothing", () => {
    $songs.set([]);
    const { ref, onAction } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "F4" });
    expect(onAction).not.toHaveBeenCalled();
  });
});
