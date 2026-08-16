import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { $searchParams, $browserFilters } from "../../stores/browser";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";
import { SearchForm } from "./SearchForm";

vi.mock("../../lib/tauri", () => ({
  getBrowserFilters: vi.fn().mockResolvedValue({ countries: [], languages: [], codecs: [] }),
  searchStationsIpc: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  $searchParams.set({ limit: 50, order: "clickcount" });
  $browserFilters.set(null);
});

function renderForm() {
  const ref = createRef<ZoneEntry>();
  const { container } = render(<SearchForm ref={ref} exitZone={vi.fn()} />);
  const input = container.querySelector<HTMLInputElement>(
    `input[placeholder="${m.browser_search_placeholder()}"]`,
  )!;
  return { ref, input };
}

describe("SearchForm — focusSearch (Ctrl+F)", () => {
  it("lands focus in the search input, not on the zone's last-touched control", () => {
    const { ref, input } = renderForm();
    // The zone's own focus memory points somewhere else entirely.
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    act(() => elsewhere.focus());

    act(() => ref.current!.focusSearch!());
    expect(document.activeElement).toBe(input);
  });

  it("selects the existing text when focus is already in the field", () => {
    $searchParams.set({ limit: 50, order: "clickcount", query: "jazz" });
    const { ref, input } = renderForm();
    act(() => input.focus());
    input.setSelectionRange(4, 4);

    act(() => ref.current!.focusSearch!());
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(4);
  });
});
