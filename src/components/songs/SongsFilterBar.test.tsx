import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { $songsQuery, $songsStation, $songsSort } from "../../stores/songs";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { SongsFilterBar } from "./SongsFilterBar";

vi.mock("../../lib/tauri", () => ({ listSavedSongs: vi.fn().mockResolvedValue([]) }));

beforeEach(() => {
  $songsQuery.set("");
  $songsStation.set(null);
  $songsSort.set("date");
});

function renderBar() {
  const ref = createRef<ZoneEntry>();
  const { container } = render(<SongsFilterBar ref={ref} exitZone={vi.fn()} />);
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  return { ref, input };
}

describe("SongsFilterBar — focusSearch (Ctrl+F)", () => {
  it("lands focus in the search input, not on the sort <select> last touched", () => {
    const { ref, input, } = renderBar();
    const sort = document.querySelectorAll("select")[1] as HTMLSelectElement;
    act(() => sort.focus());
    expect(document.activeElement).toBe(sort);

    act(() => ref.current!.focusSearch!());
    expect(document.activeElement).toBe(input);
  });

  it("selects the existing text when focus is already in the field", () => {
    $songsQuery.set("miles");
    const { ref, input } = renderBar();
    act(() => input.focus());
    input.setSelectionRange(5, 5);

    act(() => ref.current!.focusSearch!());
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(5);
  });
});
