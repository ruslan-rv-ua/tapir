import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import type { Song } from "../../types/song";
import { SongContextMenu } from "./SongContextMenu";

vi.mock("../../i18n/paraglide/messages", () => ({
  songs_action_menu: () => "Дії",
  songs_action_play: () => "Грати",
  songs_action_open: () => "Відкрити у програмі",
  songs_action_explorer: () => "Відкрити в Explorer",
  songs_action_rename: () => "Перейменувати…",
  songs_action_tags: () => "Редагувати теги…",
  songs_action_delete: () => "Видалити",
  delete_selected: ({ count }: { count: number }) => `Видалити виділені (${count})`,
}));

const mkSong = (): Song => ({
  path: "/songs/a.mp3", fileName: "a.mp3", title: "Title A", artist: "", album: "",
  genre: "", station: "S", format: "mp3", durationMs: 0, sizeBytes: 1,
  recordedAt: "2026-01-01T00:00:00Z", isComplete: true,
});

function renderMenu(selectionCount = 0) {
  const onAction = vi.fn();
  const utils = render(
    <SongContextMenu song={mkSong()} menuFocused selectionCount={selectionCount} onAction={onAction} />,
  );
  fireEvent.click(utils.container.querySelector('button[data-segment="action-menu"]')!);
  return { ...utils, onAction };
}

beforeEach(() => vi.clearAllMocks());

describe("SongContextMenu — open in the associated app", () => {
  it("offers the item between play and Explorer", () => {
    renderMenu();
    const labels = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(labels.indexOf("Відкрити у програмі")).toBe(labels.indexOf("Грати") + 1);
    expect(labels.indexOf("Відкрити в Explorer")).toBe(labels.indexOf("Відкрити у програмі") + 1);
  });

  it("dispatches the open action", () => {
    const { onAction } = renderMenu();
    fireEvent.click(screen.getByText("Відкрити у програмі"));
    expect(onAction).toHaveBeenCalledWith("open");
  });

  it("keeps a singular label even with a multi-row selection — it acts on this row only", () => {
    renderMenu(3);
    expect(screen.getByText("Відкрити у програмі")).toBeTruthy();
    // Only delete pluralizes over the selection.
    expect(screen.getByText("Видалити виділені (3)")).toBeTruthy();
  });
});
