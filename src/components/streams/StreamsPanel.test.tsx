import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent, waitFor } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
import { $streams, $statuses, $streamFilter, $streamSelection, replaceSelection } from "../../stores/streams";
import { $toasts } from "../../stores/toasts";
import { $announcer } from "../../stores/announcer";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import { StreamsPanel } from "./StreamsPanel";
import { $settings } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

// No backend in jsdom — stub the Tauri IPC layer.
vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  stopAllRecordings: vi.fn().mockResolvedValue(undefined),
  startAllRecordings: vi.fn().mockResolvedValue(0),
  removeStream: vi.fn().mockResolvedValue(undefined),
  removeStreams: vi.fn().mockResolvedValue(0),
  addToWishlist: vi.fn().mockResolvedValue(undefined),
  addToIgnorelist: vi.fn().mockResolvedValue(undefined),
  beginStreamImport: vi.fn().mockResolvedValue(null),
  addExampleStreams: vi.fn().mockResolvedValue([]),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}));

// ImportStreamsDialog uses useTauriEvent; stub it so jsdom doesn't try to call
// the Tauri event bridge (which doesn't exist in the test environment).
vi.mock("../../hooks/useTauriEvent", () => ({ useTauriEvent: vi.fn() }));

const mkStream = (id: string, name: string): StreamInfo => ({
  id,
  url: `http://x/${id}`,
  name,
  format: "mp3",
  bitrate: 192,
  icyName: null,
  icyGenre: null,
  icyUrl: null,
  ignorelist: [],
  username: null,
  password: null,
  addedAt: "2026-01-01T00:00:00Z",
});

const mkStatus = (id: string, state: StreamStatus["state"]): StreamStatus => ({
  streamId: id,
  state,
  currentTrack: null,
  recordingStartedAt: null,
  bytesRecorded: 0,
  tracksRecorded: 0,
  error: null,
  reconnectAttempt: null,
  sessionId: 0,
});

function renderPanel() {
  return render(<StreamsPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
}

// The chip group is the one role="group" whose buttons carry aria-pressed
// (StreamItem cells are also role="group" but contain no pressed buttons).
function chipButtons(container: HTMLElement) {
  const groups = Array.from(container.querySelectorAll('[role="group"]'));
  const group = groups.find((g) => g.querySelector("button[aria-pressed]"));
  return {
    group,
    chips: group
      ? Array.from(group.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"))
      : [],
  };
}

function rowOrder(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('li[data-segment="summary"]'),
  ).map((li) => li.getAttribute("data-item-id"));
}

// The sort group is the role="group" whose aria-label matches "Сортування"/"Sort".
function sortButtons(container: HTMLElement) {
  const group = Array.from(container.querySelectorAll('[role="group"]')).find((g) =>
    /сортуван|sort/i.test(g.getAttribute("aria-label") ?? ""),
  );
  return group
    ? Array.from(group.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"))
    : [];
}

beforeEach(() => {
  vi.clearAllMocks();
  $statuses.set({});
  $streamFilter.set("all");
  $streams.set([mkStream("a", "Alpha")]);
  $toasts.set([]);
  $settings.set(null);
  replaceSelection(new Set());
});

describe("StreamsPanel — filter state persistence", () => {
  it("reads the active filter from the store after remount", () => {
    const { unmount } = renderPanel();
    act(() => $streamFilter.set("errors"));
    unmount();

    const { container } = renderPanel();
    const pressed = container.querySelector('button[aria-pressed="true"]')!;
    expect(pressed.textContent).toMatch(/помилк|error/i);
  });
});

describe("StreamsPanel — filter chip group semantics", () => {
  it("renders the visible section title as a level-1 heading", () => {
    renderPanel();

    expect(screen.getByRole("heading", { level: 1, name: /потоки|streams/i })).toBeTruthy();
  });

  it("wraps the three chips in a single labelled group", () => {
    const { container } = renderPanel();
    const { group, chips } = chipButtons(container);
    expect(group).toBeTruthy();
    expect(group!.getAttribute("aria-label")).toMatch(/фільтр потоків|stream filter/i);
    expect(chips).toHaveLength(3);
  });

  it("keeps the Stop-all button outside the group", () => {
    const { container } = renderPanel();
    const { group } = chipButtons(container);
    const texts = Array.from(group!.querySelectorAll("button")).map((b) => b.textContent);
    expect(texts.some((t) => /зупинити|stop all/i.test(t ?? ""))).toBe(false);
  });
});

describe("StreamsPanel — chip counts", () => {
  beforeEach(() => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({
      a: mkStatus("a", "recording"),
      b: mkStatus("b", "error"),
      c: mkStatus("c", "error"),
    });
  });

  it("shows a visual count badge (hidden from AT) on every chip", () => {
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [all, rec, err] = chips; // order: all, recording, errors
    expect(all.querySelector('[aria-hidden="true"]')?.textContent).toBe("3"); // total streams
    expect(rec.querySelector('[aria-hidden="true"]')?.textContent).toBe("1");
    expect(err.querySelector('[aria-hidden="true"]')?.textContent).toBe("2");
  });

  it("folds the count into every chip aria-label with a comma", () => {
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [all, rec, err] = chips;
    expect(all.getAttribute("aria-label")).toMatch(/,\s*3$/); // total streams
    expect(rec.getAttribute("aria-label")).toMatch(/,\s*1$/);
    expect(err.getAttribute("aria-label")).toMatch(/,\s*2$/);
  });

  it("still shows a 0 badge on a counted filter with no matches", () => {
    // 0 is a real count and must render. "All" tracks the total stream count
    // (3 here) independently of statuses. Guards a truthy-check regression.
    $statuses.set({});
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [all, rec, err] = chips;
    expect(all.querySelector('[aria-hidden="true"]')?.textContent).toBe("3");
    expect(rec.querySelector('[aria-hidden="true"]')?.textContent).toBe("0");
    expect(err.querySelector('[aria-hidden="true"]')?.textContent).toBe("0");
    expect(rec.getAttribute("aria-label")).toMatch(/,\s*0$/);
  });
});

describe("StreamsPanel — record all", () => {
  it("renders the Record-all primary button", () => {
    renderPanel();
    expect(
      screen.getByRole("button", { name: /записати все|record all/i }),
    ).toBeTruthy();
  });

  it("calls startAllRecordings when clicked", async () => {
    renderPanel();
    const btn = screen.getByRole("button", { name: /записати все|record all/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(tauri.startAllRecordings).toHaveBeenCalledOnce();
  });

  it("disables Record-all when every stream is already active", () => {
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    renderPanel();
    const btn = screen.getByRole("button", {
      name: /записати все|record all/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables Record-all when a stream is idle or errored", () => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({ a: mkStatus("a", "recording"), b: mkStatus("b", "error") });
    renderPanel();
    const btn = screen.getByRole("button", {
      name: /записати все|record all/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

describe("StreamsPanel — empty profile keeps the toolbar", () => {
  it("renders Add/Import in the toolbar and Export as aria-disabled", () => {
    $streams.set([]);
    renderPanel();
    expect(screen.getByRole("button", { name: /додати потік|add stream/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /імпорт|import/i })).toBeTruthy();
    const exportBtn = screen.getByRole("button", { name: /експорт|export/i });
    expect(exportBtn.getAttribute("aria-disabled")).toBe("true");
  });

  it("shows the empty hint instead of the list", () => {
    $streams.set([]);
    renderPanel();
    expect(screen.getByText(/список потоків порожній|stream list is empty/i)).toBeTruthy();
  });

  it("enables Export when streams exist", () => {
    renderPanel();
    const exportBtn = screen.getByRole("button", { name: /експорт|export/i });
    expect(exportBtn.getAttribute("aria-disabled")).toBeNull();
  });
});

describe("StreamsPanel — empty profile example-streams CTA", () => {
  it("renders the focusable 'Add example streams' button in the empty state", () => {
    $streams.set([]);
    renderPanel();
    expect(
      screen.getByRole("button", { name: /додати приклади потоків|add example streams/i }),
    ).toBeTruthy();
  });

  it("registers a streams-empty zone carrying data-zone-id", () => {
    $streams.set([]);
    const onZonesChange = vi.fn();
    render(<StreamsPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
    const zones = onZonesChange.mock.calls.at(-1)![0] as { id: string }[];
    expect(zones.some((z) => z.id === "streams-empty")).toBe(true);
    expect(document.querySelector('[data-zone-id="streams-empty"]')).toBeTruthy();
  });

  it("the streams-empty zone focuses the add-examples button", () => {
    $streams.set([]);
    const onZonesChange = vi.fn();
    render(<StreamsPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
    const zones = onZonesChange.mock.calls.at(-1)![0] as {
      id: string;
      focus: (d: "forward" | "backward") => void;
    }[];
    const emptyZone = zones.find((z) => z.id === "streams-empty")!;
    emptyZone.focus("forward");
    const btn = screen.getByRole("button", {
      name: /додати приклади потоків|add example streams/i,
    });
    expect(document.activeElement).toBe(btn);
  });
});

describe("StreamsPanel — example-streams click flow", () => {
  const addBtn = () =>
    screen.getByRole("button", { name: /додати приклади потоків|add example streams|додаю приклади|adding examples/i });

  beforeEach(() => {
    $streams.set([]);
    $announcer.set({ message: "", priority: "polite" });
  });

  it("calls addExampleStreams and shows aria-busy/aria-disabled while loading", async () => {
    vi.mocked(tauri.addExampleStreams).mockResolvedValueOnce([mkStream("ex1", "Example One")]);
    renderPanel();
    await act(async () => {
      fireEvent.click(addBtn());
    });
    expect(tauri.addExampleStreams).toHaveBeenCalledOnce();
    const btn = addBtn();
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.getAttribute("aria-busy")).toBe("true");
  });

  it("announces the pluralized result and focuses the first row on success", async () => {
    const added = [mkStream("ex1", "Example One"), mkStream("ex2", "Example Two")];
    vi.mocked(tauri.addExampleStreams).mockResolvedValueOnce(added);
    renderPanel();
    await act(async () => {
      fireEvent.click(addBtn());
    });
    // The success announcement names the added streams.
    expect($announcer.get().message).toMatch(/example one/i);
    // Simulate the streams-changed round-trip the mocked event bridge can't deliver.
    await act(async () => {
      $streams.set(added);
    });
    // restoreFocus("forward") on the fresh list lands on the first row's summary.
    expect(document.activeElement?.getAttribute("data-item-id")).toBe("ex1");
  });

  it("on failure toasts + announces and re-enables the button without losing focus", async () => {
    vi.mocked(tauri.addExampleStreams).mockRejectedValueOnce(new Error("offline"));
    renderPanel();
    const btn = addBtn();
    btn.focus();
    await act(async () => {
      fireEvent.click(btn);
    });
    expect($toasts.get().some((t) => /offline/i.test(t.message))).toBe(true);
    expect($announcer.get().message).toMatch(/не вдалося завантажити приклади|could not load examples/i);
    const after = addBtn();
    expect(after.getAttribute("aria-disabled")).toBeNull();
    expect(document.activeElement).toBe(after);
  });

  it("announces the loading message before awaiting addExampleStreams", async () => {
    // Intercept the resolved promise to check the announcement that fires before await.
    let resolveAdd!: (v: StreamInfo[]) => void;
    vi.mocked(tauri.addExampleStreams).mockReturnValueOnce(
      new Promise<StreamInfo[]>((res) => { resolveAdd = res; }),
    );
    renderPanel();
    fireEvent.click(addBtn());
    // Loading announcement fires synchronously before the await resolves.
    expect($announcer.get().message).toMatch(/додаю приклади|adding examples/i);
    // Resolve to clean up the pending promise.
    await act(async () => { resolveAdd([]); });
  });
});

describe("StreamsPanel — import button outcomes", () => {
  const importBtn = () => screen.getByRole("button", { name: /імпорт|import/i });

  it("stays silent when the file picker is cancelled (null)", async () => {
    vi.mocked(tauri.beginStreamImport).mockResolvedValueOnce(null);
    renderPanel();
    await act(async () => {
      fireEvent.click(importBtn());
    });
    expect($toasts.get()).toHaveLength(0);
  });

  it("toasts when the chosen playlist holds no streams ([])", async () => {
    vi.mocked(tauri.beginStreamImport).mockResolvedValueOnce([]);
    renderPanel();
    await act(async () => {
      fireEvent.click(importBtn());
    });
    const messages = $toasts.get().map((t) => t.message);
    expect(messages.some((msg) => /не знайдено потоків|no streams found/i.test(msg))).toBe(true);
  });
});

describe("StreamsPanel — stop button label", () => {
  it("labels the stop button as stopping recording", () => {
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    renderPanel();
    expect(
      screen.getByRole("button", { name: /^зупинити запис$|^stop recording$/i }),
    ).toBeTruthy();
  });
});

describe("StreamsPanel — stream sorting", () => {
  it("sorts rows alphabetically by name by default (settings null → name)", () => {
    $streams.set([mkStream("c", "Charlie"), mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["a", "b", "c"]);
  });

  it("orders names numerically (Радіо 2 before Радіо 10)", () => {
    $streams.set([mkStream("x", "Радіо 10"), mkStream("y", "Радіо 2")]);
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["y", "x"]);
  });

  it("sorts case-insensitively", () => {
    $streams.set([mkStream("b", "beta"), mkStream("a", "Alpha")]);
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["a", "b"]);
  });

  it("sorts by added date (newest first) when sortBy is 'added'", () => {
    $settings.set({ sortBy: "added", language: "uk" } as GlobalSettings);
    $streams.set([
      { ...mkStream("old", "Old"), addedAt: "2026-01-01T00:00:00Z" },
      { ...mkStream("new", "New"), addedAt: "2026-03-01T00:00:00Z" },
      { ...mkStream("mid", "Mid"), addedAt: "2026-02-01T00:00:00Z" },
    ]);
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["new", "mid", "old"]);
  });

  it("applies sort within the active filter", () => {
    $streamFilter.set("recording");
    $streams.set([mkStream("c", "Charlie"), mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({ a: mkStatus("a", "recording"), c: mkStatus("c", "recording") });
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["a", "c"]); // b filtered out, a before c
  });

  it("renders a sort group with two toggle buttons, active one pressed", () => {
    $settings.set({ sortBy: "added", language: "uk" } as GlobalSettings);
    const { container } = renderPanel();
    const btns = sortButtons(container);
    expect(btns).toHaveLength(2);
    const pressed = btns.filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toMatch(/час|added|date/i);
  });

  it("persists the new sort when a different mode is chosen", () => {
    $settings.set({ sortBy: "name", language: "uk" } as GlobalSettings);
    const { container } = renderPanel();
    const added = sortButtons(container).find((b) => /час|added|date/i.test(b.textContent ?? ""))!;
    fireEvent.click(added);
    expect(tauri.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ sortBy: "added" }));
  });

  it("clicking the active sort is a no-op", () => {
    $settings.set({ sortBy: "name", language: "uk" } as GlobalSettings);
    const { container } = renderPanel();
    const name = sortButtons(container).find((b) => /назв|name/i.test(b.textContent ?? ""))!;
    fireEvent.click(name);
    expect(tauri.saveSettings).not.toHaveBeenCalled();
  });
});

describe("StreamsPanel — selection toolbar cluster", () => {
  beforeEach(() => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({});
  });

  it("shows 'Виділити все' and a disabled 'Видалити виділені (0)' with no selection", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: m.select_all() })).toBeTruthy();
    const del = screen.getByRole("button", { name: m.delete_selected({ count: 0 }) });
    expect(del.getAttribute("aria-disabled")).toBe("true");
  });

  it("flips to 'Зняти виділення' when all visible are selected", () => {
    replaceSelection(new Set(["a", "b", "c"]));
    renderPanel();
    expect(screen.getByRole("button", { name: m.clear_selection() })).toBeTruthy();
  });

  it("shows the [N вибрано] label and an enabled delete button when something is selected", () => {
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    expect(screen.getByText(m.selected_count_label({ count: 2 }))).toBeTruthy();
    const del = screen.getByRole("button", { name: m.delete_selected({ count: 2 }) });
    expect(del.getAttribute("aria-disabled")).toBeNull();
  });

  it("clicking 'Виділити все' selects all visible and announces the count on the toolbar's own channel", () => {
    renderPanel();
    $announcer.set({ message: "", priority: "polite" });
    fireEvent.click(screen.getByRole("button", { name: m.select_all() }));
    expect([...$streamSelection.get()].sort()).toEqual(["a", "b", "c"]);
    expect($announcer.get().message).toBe(m.selection_count({ count: 3 }));
  });

  it("the toolbar delete button triggers the list's bulk confirm", async () => {
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    // The toolbar button reaches into the list via the StreamListHandle ref
    // (requestBulkDelete) — proves the widened ref is wired end-to-end.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: m.delete_selected({ count: 2 }) }));
    });
    expect(await screen.findByText(m.confirm_delete_selected({ count: 2 }))).toBeTruthy();
  });

  it("keeps a 12-stop roving toolbar in DOM order", () => {
    const { container } = renderPanel();
    const toolbar = container.querySelector('[data-zone-id="streams-toolbar"]')!;
    const stops = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button"));
    // Roving tabindex: exactly one stop is tabbable (0); the rest are -1.
    const tabbable = stops.filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(stops.length).toBeGreaterThanOrEqual(12);
  });
});

describe("StreamsPanel — selection lifecycle", () => {
  beforeEach(() => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({});
  });

  it("changing the filter clears the selection", () => {
    replaceSelection(new Set(["a"]));
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    fireEvent.click(chips[1]); // "recording" chip
    expect($streamSelection.get().size).toBe(0);
  });

  it("resetting the filter clears the selection", () => {
    $statuses.set({}); // no recording rows → filter "recording" hides all
    $streamFilter.set("recording");
    replaceSelection(new Set(["a"]));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: m.streams_filter_reset() }));
    expect($streamSelection.get().size).toBe(0);
  });

  it("clears the selection when the panel unmounts (leaving the section)", () => {
    replaceSelection(new Set(["a"]));
    const { unmount } = renderPanel();
    unmount();
    expect($streamSelection.get().size).toBe(0);
  });

  it("deletes all visible under a filter → onEmpty focuses reset-filter (never <body>)", async () => {
    // a recording, b idle; filter=recording → visible=[a]; select+delete a → filter-empty.
    $statuses.set({ a: mkStatus("a", "recording") });
    $streamFilter.set("recording");
    replaceSelection(new Set(["a"]));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: m.delete_selected({ count: 1 }) }));
    const confirmBtn = await screen.findByRole("button", { name: m["delete"]() });
    // removeStreams is mocked to resolve; handleConfirmBulkDelete then sets $streams
    // itself (full store → [b]), so no manual $streams.set is needed — this is the
    // real path. b is idle under the recording filter → filter-empty zone mounts.
    await act(async () => { fireEvent.click(confirmBtn); });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: m.streams_filter_reset() })),
    );
  });

  it("deletes every stream → onEmpty focuses the add-examples button (never <body>)", async () => {
    // No filter: select both and bulk-delete all → the profile goes empty, so the
    // isEmpty branch of the deferred onEmpty-focus effect must land on add-examples.
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: m.delete_selected({ count: 2 }) }));
    const confirmBtn = await screen.findByRole("button", { name: m["delete"]() });
    await act(async () => { fireEvent.click(confirmBtn); });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /додати приклади потоків|add example streams/i }),
      ),
    );
  });
});
