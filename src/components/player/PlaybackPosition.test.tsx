import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { PlaybackPosition } from "./PlaybackPosition";
import { $playerStatus } from "../../stores/player";

vi.mock("../../lib/tauri", () => ({
  seekPlayback: vi.fn().mockResolvedValue(undefined),
}));

/** Both carriers of the position, as a screen reader and an eye see them. */
function readCarriers(el: HTMLElement) {
  const slider = el.querySelector('input[type="range"]');
  return {
    spoken: slider?.getAttribute("aria-valuetext") ?? null,
    visible: el.querySelector("span")?.textContent ?? null,
  };
}

beforeEach(() => {
  $playerStatus.set({
    state: "playing",
    source: { type: "file", path: "C:/x/song.mp3" },
    volume: 0.75,
    positionMs: 134_000,
    durationMs: 300_000,
  });
});

// ADR 2026-08-31: те, що промовлено, мусить бути на екрані. Смужка каже «десь
// на третині» — числа не каже.
describe("PlaybackPosition — видимий носій позиції", () => {
  it("показує позицію числом, і це те саме число, яке читає скрінрідер", () => {
    const { container } = render(<PlaybackPosition />);

    const { spoken, visible } = readCarriers(container);
    expect(spoken).toBe(m.time_format_min_sec({ min: 2, sec: 14 }));
    expect(visible).toBe(spoken);
  });

  // §6 ADR: обидва носії беруться з однієї змінної, тож розійтися не можуть.
  // RAC переписує aria-valuetext на кожному своєму рендері (і ставить туди
  // сирі мілісекунди), тож перевіряємо саме після зміни позиції.
  it("обидва носії рухаються разом, коли позиція змінилась", () => {
    const { container, rerender } = render(<PlaybackPosition />);
    $playerStatus.set({ ...$playerStatus.get(), positionMs: 61_000 });
    rerender(<PlaybackPosition />);

    const { spoken, visible } = readCarriers(container);
    expect(spoken).toBe(m.time_format_min_sec({ min: 1, sec: 1 }));
    expect(visible).toBe(spoken);
  });

  it("показує позицію й тоді, коли тривалість невідома і смужки немає", () => {
    $playerStatus.set({ ...$playerStatus.get(), durationMs: null });
    const { queryByRole, getByText } = render(<PlaybackPosition />);

    expect(queryByRole("slider")).toBeNull();
    expect(getByText(m.time_format_min_sec({ min: 2, sec: 14 }))).toBeInTheDocument();
  });
});
