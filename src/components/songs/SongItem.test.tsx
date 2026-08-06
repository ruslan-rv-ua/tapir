import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { Song } from "../../types/song";
import { SongItem } from "./SongItem";
import * as m from "../../i18n/paraglide/messages";

vi.mock("../../i18n/paraglide/messages", () => ({
  item_role_song: () => "запис",
  songs_row_summary: ({ title }: { title: string }) => `${title} summary`,
  songs_incomplete_badge: () => "неповний",
  songs_action_play: () => "Відтворити",
  songs_action_stop: () => "Зупинити",
  songs_action_menu: () => "Меню",
  songs_action_open: () => "Відкрити у програмі",
  songs_action_explorer: () => "Провідник",
  songs_action_rename: () => "Перейменувати",
  songs_action_tags: () => "Теги",
  songs_action_delete: () => "Видалити",
  selection_suffix: () => "вибрано",
  delete_selected: ({ count }: { count: number }) => `Видалити вибрані (${count})`,
}));

const mk = (over: Partial<Song> = {}): Song => ({
  path: "/songs/a.mp3",
  fileName: "a.mp3",
  title: "Title A",
  artist: "Artist A",
  album: "",
  genre: "",
  station: "Radio X",
  format: "mp3",
  sizeBytes: 2048,
  durationMs: 60000,
  recordedAt: "2026-01-01T00:00:00Z",
  isComplete: true,
  ...over,
});

function renderItem(
  song = mk(),
  focusedSeg: string = "summary",
  isPlaying = false,
  { isSelected = false, selectionCount = 0 }: { isSelected?: boolean; selectionCount?: number } = {},
) {
  return render(
    <ul>
      <SongItem
        song={song}
        isActiveRow
        isPlaying={isPlaying}
        isSelected={isSelected}
        selectionCount={selectionCount}
        isFocused={(seg) => seg === focusedSeg}
        onPlay={() => {}}
        onAction={() => {}}
      />
    </ul>,
  );
}

describe("SongItem — a11y structure (drift fixes)", () => {
  it("describes the row as a song via aria-roledescription", () => {
    const { container } = renderItem();
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("role")).toBe("listitem");
    expect(li.getAttribute("aria-roledescription")).toBe("запис");
    expect(li.getAttribute("aria-label")).toContain("Title A");
    expect(li.tabIndex).toBe(0);
  });

  it("renders track and tech segments as role=group", () => {
    const { container } = renderItem();
    expect(container.querySelector('[data-segment="track"]')!.getAttribute("role")).toBe("group");
    expect(container.querySelector('[data-segment="tech"]')!.getAttribute("role")).toBe("group");
  });

  it("prefixes the incomplete state onto the row's accessible name", () => {
    const { container } = renderItem(mk({ isComplete: false }));
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toMatch(/^неповний, /);
    expect(li.getAttribute("aria-label")).toContain("Title A summary");
  });

  it("does not prefix the name for a complete recording", () => {
    const { container } = renderItem(mk({ isComplete: true }));
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).not.toContain("неповний");
  });

  it("drops the standalone status segment (state moves to the row name)", () => {
    const { container } = renderItem(mk({ isComplete: false }));
    expect(container.querySelector('[data-segment="status"]')).toBeNull();
  });

  it("always renders an aria-hidden icon in the track segment, both states", () => {
    const complete = renderItem(mk({ isComplete: true }));
    expect(
      complete.container.querySelector('[data-segment="track"] svg[aria-hidden="true"]'),
    ).not.toBeNull();
    const incomplete = renderItem(mk({ isComplete: false }));
    expect(
      incomplete.container.querySelector('[data-segment="track"] svg[aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it("shows FileMusic when complete and AlertCircle when incomplete", () => {
    const complete = renderItem(mk({ isComplete: true }));
    expect(
      complete.container.querySelector('[data-segment="track"] svg.lucide-file-music'),
    ).not.toBeNull();
    expect(
      complete.container.querySelector('[data-segment="track"] svg.lucide-circle-alert'),
    ).toBeNull();

    const incomplete = renderItem(mk({ isComplete: false }));
    expect(
      incomplete.container.querySelector('[data-segment="track"] svg.lucide-circle-alert'),
    ).not.toBeNull();
    expect(
      incomplete.container.querySelector('[data-segment="track"] svg.lucide-file-music'),
    ).toBeNull();
  });

  it("uses the shared outline focus ring (not ring-2) on segments", () => {
    const { container } = renderItem();
    const track = container.querySelector('[data-segment="track"]')!;
    expect(track.className).toMatch(/focus-visible:outline/);
    expect(track.className).not.toMatch(/focus-visible:ring-2/);
  });

  it("surfaces size and date in the metadata (tech) segment", () => {
    // Midday UTC keeps the rendered year stable across timezones.
    const { container } = renderItem(mk({ recordedAt: "2026-06-15T12:00:00Z" }));
    const tech = container.querySelector('[data-segment="tech"]')!;
    expect(tech.textContent).toContain("2.0 KB"); // formatBytes(2048)
    expect(tech.textContent).toContain("2026");    // compact date includes the year
  });

  it("exposes line-2 metadata as the tech segment's accessible name", () => {
    // role=group announces only aria-label, not child text, so the Right/Left
    // drill-down stop must carry the values on aria-label to be readable.
    const { container } = renderItem(mk({ recordedAt: "2026-06-15T12:00:00Z" }));
    const label = container.querySelector('[data-segment="tech"]')!.getAttribute("aria-label") ?? "";
    expect(label).toContain("Artist A");
    expect(label).toContain("Radio X");
    expect(label).toContain("2.0 KB");
    expect(label).toContain("2026");
  });

  it("renders play as a button focus stop that calls onPlay", () => {
    const onPlay = vi.fn();
    const { container } = render(
      <ul>
        <SongItem
          song={mk()}
          isActiveRow
          isPlaying={false}
          isSelected={false}
          selectionCount={0}
          isFocused={(seg) => seg === "summary"}
          onPlay={onPlay}
          onAction={() => {}}
        />
      </ul>,
    );
    const btn = container.querySelector('button[data-segment="action-play"]')!;
    expect(btn.tagName).toBe("BUTTON");
    fireEvent.click(btn);
    expect(onPlay).toHaveBeenCalled();
  });

  it("appends the selected suffix to the row label and marks the row data-selected", () => {
    const { container } = renderItem(mk(), "summary", false, { isSelected: true });
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toMatch(new RegExp(`${m.selection_suffix()}$`));
    expect(li.getAttribute("data-selected")).toBe("true");
  });
});
