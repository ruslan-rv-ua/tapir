import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { VolumeSlider } from "./VolumeSlider";
import { $playerStatus } from "../../stores/player";
import { $settings } from "../../stores/settings";

vi.mock("../../lib/tauri", () => ({
  setVolume: vi.fn().mockResolvedValue(undefined),
}));

/** Both carriers of the level, as a screen reader and an eye see them. */
function readCarriers(el: HTMLElement) {
  const slider = el.querySelector('input[type="range"]');
  return {
    spoken: slider?.getAttribute("aria-valuetext") ?? null,
    visible: el.querySelector("span")?.textContent ?? null,
  };
}

beforeEach(() => {
  $settings.set(null);
  $playerStatus.set({
    state: "playing",
    source: { type: "file", path: "C:/x/song.mp3" },
    volume: 0.45,
    positionMs: 0,
    durationMs: 300_000,
  });
});

// ADR 2026-08-31: рівень гучності жив лише в aria-valuetext — смужка показує
// «десь під половину», а не «45%».
describe("VolumeSlider — видимий носій рівня", () => {
  it("показує рівень числом, і це те саме число, яке читає скрінрідер", () => {
    const { container } = render(<VolumeSlider />);

    const { spoken, visible } = readCarriers(container);
    expect(spoken).toBe("45%");
    expect(visible).toBe(spoken);
  });

  // §6 ADR: обидва носії беруться з однієї змінної, тож розійтися не можуть.
  // RAC переписує aria-valuetext на кожному своєму рендері (і ставить туди
  // голе число без одиниці), тож перевіряємо саме після зміни рівня.
  it("обидва носії рухаються разом, коли рівень змінився", () => {
    const { container, rerender } = render(<VolumeSlider />);
    $playerStatus.set({ ...$playerStatus.get(), volume: 0.2 });
    rerender(<VolumeSlider />);

    const { spoken, visible } = readCarriers(container);
    expect(spoken).toBe("20%");
    expect(visible).toBe(spoken);
  });
});
