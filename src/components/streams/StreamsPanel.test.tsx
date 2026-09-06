import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent, waitFor, within } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
import { $streams, $statuses, $streamFilter, $streamSelection, replaceSelection, $exportStreamsRequest } from "../../stores/streams";
import { $toasts } from "../../stores/toasts";
import { $announcer } from "../../stores/announcer";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import { StreamsPanel } from "./StreamsPanel";
import { $settings, $profileSettings } from "../../stores/settings";
import type { GlobalSettings, ProfileSettings } from "../../lib/tauri";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

// No backend in jsdom — stub the Tauri IPC layer.
vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  stopAllRecordings: vi.fn().mockResolvedValue(0),
  startAllRecordings: vi.fn().mockResolvedValue(0),
  removeStream: vi.fn().mockResolvedValue(undefined),
  removeStreams: vi.fn().mockResolvedValue(0),
  addToWishlist: vi.fn().mockResolvedValue(undefined),
  addToIgnorelist: vi.fn().mockResolvedValue(undefined),
  beginStreamImport: vi.fn().mockResolvedValue(null),
  addExampleStreams: vi.fn().mockResolvedValue([]),
  exportStreams: vi.fn().mockResolvedValue(true),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  updateProfileSettings: vi.fn().mockResolvedValue(undefined),
  listProfiles: vi.fn().mockResolvedValue([
    { name: "Default", streamCount: 3, isActive: true },
    { name: "Jazz", streamCount: 0, isActive: false },
  ]),
  moveStreamToProfile: vi.fn().mockResolvedValue(undefined),
  createProfile: vi.fn().mockResolvedValue({ name: "Fresh", streamCount: 0, isActive: false }),
  copyStreamsToProfile: vi.fn().mockResolvedValue({ transferred: [], skippedRecording: 0, skippedConflict: 0 }),
  moveStreamsToProfile: vi.fn().mockResolvedValue({ transferred: [], skippedRecording: 0, skippedConflict: 0 }),
}));

// ImportStreamsDialog uses useTauriEvent; stub it so jsdom doesn't try to call
// the Tauri event bridge (which doesn't exist in the test environment).
vi.mock("../../hooks/useTauriEvent", () => ({ useTauriEvent: vi.fn() }));

const mkStream = (id: string, name: string): StreamInfo => ({
  id,
  url: `http://x/${id}`,
  name,
  format: "mp3",
  unsupportedCodec: null,
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
  reconnectAttempt: null, reconnectMaxRetries: null,
  sessionId: 0,
});

function renderPanel() {
  return render(<StreamsPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
}

// Asserted literally rather than re-derived from SHORTCUTS: the point of the
// badge test is that the rendered combo really is Ctrl+K, so reading it from
// the same source the component reads would make the test vacuous.
const PALETTE_COMBO_EXPECTED = "Ctrl+K";

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

// Move/Copy/Delete-selected now live behind one "Дії з виділеними" menu
// (SelectionActionsMenu) — query the trigger by its count-agnostic name, then
// open it and resolve the chosen menuitem.
function selectionMenuButton() {
  return screen.getByRole("button", { name: /дії з виділеними|selected actions/i });
}
async function openSelectionItem(name: string) {
  fireEvent.click(selectionMenuButton());
  return screen.findByRole("menuitem", { name });
}

/** Sort order lives in the profile; the collation locale stays global. */
function setSort(streamSort: "name" | "added") {
  $settings.set({ language: "uk", activeProfile: "Default" } as GlobalSettings);
  $profileSettings.set({
    recording: {
      diskSpaceThresholdGb: 0,
      reconnect: { maxRetries: 0, retryIntervalSecs: 5, backoffMultiplier: 1.5, maxIntervalSecs: 60 },
    },
    ui: { streamSort, trayNotificationsTrackChange: true, trayNotificationsScheduled: true },
  } as ProfileSettings);
}

beforeEach(() => {
  vi.clearAllMocks();
  $statuses.set({});
  $streamFilter.set("all");
  $streams.set([mkStream("a", "Alpha")]);
  $toasts.set([]);
  $settings.set(null);
  $profileSettings.set(null);
  replaceSelection(new Set());
  $exportStreamsRequest.set(null);
});

describe("StreamsPanel — filter state persistence", () => {
  it("reads the active filter from the store after remount", () => {
    const { unmount } = renderPanel();
    act(() => $streamFilter.set("attention"));
    unmount();

    const { container } = renderPanel();
    const pressed = container.querySelector('button[aria-pressed="true"]')!;
    expect(pressed.textContent).toMatch(/уваги|attention/i);
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

  it("disables Record-all (aria) when every stream is already active", () => {
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    renderPanel();
    const btn = screen.getByRole("button", { name: /записати все|record all/i });
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });

  it("enables Record-all when a stream is idle or errored", () => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({ a: mkStatus("a", "recording"), b: mkStatus("b", "error") });
    renderPanel();
    const btn = screen.getByRole("button", { name: /записати все|record all/i });
    expect(btn.getAttribute("aria-disabled")).toBeNull();
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

describe("StreamsPanel — Ctrl+K palette hint badge (ADR 2026-05-31 §6 S3)", () => {
  it("renders the badge with the palette combo in the empty state", () => {
    $streams.set([]);
    renderPanel();
    const kbd = screen.getByText(PALETTE_COMBO_EXPECTED);
    expect(kbd.tagName).toBe("KBD");
    expect(screen.getByText(/команди —|commands —/i)).toBeTruthy();
  });

  it("the badge is not a Tab stop", () => {
    $streams.set([]);
    renderPanel();
    const kbd = screen.getByText(PALETTE_COMBO_EXPECTED);
    expect(kbd.getAttribute("tabindex")).toBeNull();
    expect(kbd.getAttribute("role")).toBeNull();
    expect(kbd.closest("button")).toBeNull();
    // The empty zone exposes exactly one focusable control: the CTA.
    const zone = document.querySelector('[data-zone-id="streams-empty"]')!;
    expect(zone.querySelectorAll("button, [tabindex]").length).toBe(1);
  });

  it("keeps the streams-empty zone focusing the add-examples button", () => {
    $streams.set([]);
    const onZonesChange = vi.fn();
    render(<StreamsPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
    const zones = onZonesChange.mock.calls.at(-1)![0] as {
      id: string;
      focus: (d: "forward" | "backward") => void;
    }[];
    zones.find((z) => z.id === "streams-empty")!.focus("forward");
    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: /додати приклади потоків|add example streams/i,
      }),
    );
  });

  it("does not render the badge in the filter-empty state", () => {
    // The default fixture stream is idle; filtering to "recording" hides it all.
    $streamFilter.set("recording");
    renderPanel();
    expect(screen.getByText(m.streams_filter_empty())).toBeTruthy();
    expect(screen.queryByText(PALETTE_COMBO_EXPECTED)).toBeNull();
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
    expect($announcer.get()?.message).toMatch(/example one/i);
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
    expect($announcer.get()?.message).toMatch(/не вдалося завантажити приклади|could not load examples/i);
    const after = addBtn();
    expect(after.getAttribute("aria-disabled")).toBeNull();
    expect(document.activeElement).toBe(after);
  });

  it("carries the loading state in the button's own name before awaiting addExampleStreams", async () => {
    // Intercept the resolved promise to check the state that lands before await.
    let resolveAdd!: (v: StreamInfo[]) => void;
    vi.mocked(tauri.addExampleStreams).mockReturnValueOnce(
      new Promise<StreamInfo[]>((res) => { resolveAdd = res; }),
    );
    renderPanel();
    fireEvent.click(addBtn());
    // The button's accessible name carries the loading state, and nothing else does: it is
    // attribute-sourced (aria-label), which is what lets the screen reader speak the change on
    // the still-focused button. A live region saying the same words was a second announcement
    // of one fact — see docs/notes/zone-vanishes-under-focus.md §4.3.
    expect(screen.getByRole("button", { name: m.streams_examples_loading() })).toBeTruthy();
    expect($announcer.get()?.message ?? "").not.toMatch(/додаю приклади|adding examples/i);
    // Resolve to clean up the pending promise.
    await act(async () => { resolveAdd([]); });
  });
});

describe("StreamsPanel — filter-empty transitions rescue focus (streams-reset-filter-focus-drop)", () => {
  const resetBtn = () => screen.getByRole("button", { name: m.streams_filter_reset() });
  const addBtn = () =>
    screen.getByRole("button", { name: /додати приклади потоків|add example streams/i });

  it("Reset filter hands focus to the first row that took its place (never <body>)", async () => {
    // The fixture stream is idle, so the "recording" filter hides everything and
    // the filter-empty zone stands where the list would be.
    $streamFilter.set("recording");
    renderPanel();
    act(() => resetBtn().focus());

    fireEvent.click(resetBtn());

    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-item-id")).toBe("a"),
    );
    // The polite reply about the filter is unchanged by the focus move.
    expect($announcer.get()?.message).toMatch(/усі|all/i);
  });

  it("examples added under a filter that hides them leave focus on the reset button", async () => {
    // Same swap, other direction: the list never mounts, so the first-row request
    // must fall through to whatever did take the CTA's place.
    //
    // This one passes even without the hand-off, and knowing why is the point:
    // both empty zones are a <div> with <p> + <button> in the same slot of the
    // same ternary, so React reuses the DOM node and focus rides along by
    // accident — the label under it just silently changes. The assertion pins
    // the destination as a contract, so it still holds the day either branch
    // gets a key or a different wrapper and the accident stops happening.
    $streams.set([]);
    $streamFilter.set("recording");
    const added = [mkStream("ex1", "Example One")];
    vi.mocked(tauri.addExampleStreams).mockResolvedValueOnce(added);
    renderPanel();
    const cta = addBtn();
    act(() => cta.focus());

    await act(async () => {
      fireEvent.click(addBtn());
    });
    // Simulate the streams-changed round-trip the mocked event bridge can't deliver.
    await act(async () => {
      $streams.set(added);
    });

    await waitFor(() => expect(document.activeElement).toBe(resetBtn()));
  });
});

describe("StreamsPanel — a background change must not drop focus (zone-vanishes-under-focus)", () => {
  const resetBtn = () => screen.getByRole("button", { name: m.streams_filter_reset() });
  const row = (id: string) =>
    document.querySelector<HTMLElement>(`[data-item-id="${id}"][data-segment="summary"]`)!;

  it("a recording that stops on its own hands focus to the zone that replaced the list", async () => {
    // Path 1. The «recording» filter shows only what is recording, so a stop from
    // anywhere — the tray, a global key, a dropped connection — empties the visible
    // list and unmounts the whole list zone. No handler of ours runs on that path,
    // which is precisely why the two request flags could never cover it: there is
    // nobody to raise a request.
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    $streamFilter.set("recording");
    renderPanel();
    act(() => row("a").focus());
    expect(document.activeElement).toBe(row("a"));

    await act(async () => { $statuses.set({ a: mkStatus("a", "idle") }); });

    expect(document.activeElement).not.toBe(document.body);
    await waitFor(() => expect(document.activeElement).toBe(resetBtn()));
  });

  it("a recording that starts on its own hands focus to the list that replaced the zone", async () => {
    // Path 2, the mirror direction: focus sits on «Скинути фільтр» while the filter
    // hides everything, and a recording started elsewhere mounts the list — taking
    // the button out from under the focus.
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "idle") });
    $streamFilter.set("recording");
    renderPanel();
    act(() => resetBtn().focus());

    await act(async () => { $statuses.set({ a: mkStatus("a", "recording") }); });

    expect(document.activeElement).not.toBe(document.body);
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-item-id")).toBe("a"),
    );
  });

  it("leaves focus alone when it was never in the swapped slot", async () => {
    // The guard must not steal: the same swap happens while the user stands in the
    // toolbar, and their position has to survive it untouched.
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    $streamFilter.set("recording");
    renderPanel();
    const toolbarBtn = screen.getByRole("button", { name: /імпорт|import/i });
    act(() => toolbarBtn.focus());

    await act(async () => { $statuses.set({ a: mkStatus("a", "idle") }); });

    expect(document.activeElement).toBe(toolbarBtn);
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

  it("sorts by added date (newest first) when the profile sorts by 'added'", () => {
    setSort("added");
    $streams.set([
      { ...mkStream("old", "Old"), addedAt: "2026-01-01T00:00:00Z" },
      { ...mkStream("new", "New"), addedAt: "2026-03-01T00:00:00Z" },
      { ...mkStream("mid", "Mid"), addedAt: "2026-02-01T00:00:00Z" },
    ]);
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["new", "mid", "old"]);
  });

  it("Tab into the list focuses the first row after the sort order arrives post-mount", () => {
    // Repro of the streams-screen focus bug. The list mounts under the default
    // "name" order (settings not loaded yet), seeding the active row from the
    // name-first stream AND freezing the list's zone entry over that order. When
    // the persisted "added" order then arrives and reorders the rows, Tab-into-list
    // must still land on the NEW first visible row, not the stale name-first one.
    let listZone: ZoneEntry | undefined;
    const onZonesChange = (zones: ZoneEntry[]) => {
      listZone = zones.find((z) => z.id === "streams-list");
    };
    // name order: Alpha(a), Bravo(b), Charlie(c). added order (newest first): b, c, a.
    setSort("name");
    $streams.set([
      { ...mkStream("a", "Alpha"),   addedAt: "2026-01-01T00:00:00Z" }, // oldest
      { ...mkStream("b", "Bravo"),   addedAt: "2026-03-01T00:00:00Z" }, // newest
      { ...mkStream("c", "Charlie"), addedAt: "2026-02-01T00:00:00Z" },
    ]);
    const { container } = render(<StreamsPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
    expect(rowOrder(container)).toEqual(["a", "b", "c"]); // mounted under name order

    // The persisted "added" order arrives after mount → rows re-sort to [b, c, a].
    // The zone-registration effect does NOT re-run (its deps are unchanged), so a
    // raw handle here would stay frozen over the name order.
    act(() => setSort("added"));
    expect(rowOrder(container)).toEqual(["b", "c", "a"]);

    // Tab into the list zone (cycleZone calls the zone's focus()).
    act(() => listZone!.focus("forward"));

    expect(document.activeElement?.getAttribute("data-item-id")).toBe("b");
    expect(document.activeElement?.getAttribute("data-segment")).toBe("summary");
  });

  it("applies sort within the active filter", () => {
    $streamFilter.set("recording");
    $streams.set([mkStream("c", "Charlie"), mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({ a: mkStatus("a", "recording"), c: mkStatus("c", "recording") });
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["a", "c"]); // b filtered out, a before c
  });

  it("renders a sort group with two toggle buttons, active one pressed", () => {
    setSort("added");
    const { container } = renderPanel();
    const btns = sortButtons(container);
    expect(btns).toHaveLength(2);
    const pressed = btns.filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toMatch(/час|added|date/i);
  });

  // Порядок профільний (ADR 2026-08-08): пишеться патчем у профіль, не в
  // глобальні налаштування.
  it("persists the new sort into the active profile when a different mode is chosen", () => {
    setSort("name");
    const { container } = renderPanel();
    const added = sortButtons(container).find((b) => /час|added|date/i.test(b.textContent ?? ""))!;
    fireEvent.click(added);
    expect(tauri.updateProfileSettings).toHaveBeenCalledWith("Default", {
      ui: { streamSort: "added", trayNotificationsTrackChange: true, trayNotificationsScheduled: true },
    });
    expect(tauri.saveSettings).not.toHaveBeenCalled();
  });

  it("clicking the active sort is a no-op", () => {
    setSort("name");
    const { container } = renderPanel();
    const name = sortButtons(container).find((b) => /назв|name/i.test(b.textContent ?? ""))!;
    fireEvent.click(name);
    expect(tauri.updateProfileSettings).not.toHaveBeenCalled();
  });
});

describe("StreamsPanel — selection toolbar cluster", () => {
  beforeEach(() => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({});
  });

  it("shows 'Виділити все' and a disabled 'Дії з виділеними (0)' menu with no selection", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: m.select_all() })).toBeTruthy();
    expect(selectionMenuButton().getAttribute("aria-disabled")).toBe("true");
  });

  it("flips to 'Зняти виділення' when all visible are selected", () => {
    replaceSelection(new Set(["a", "b", "c"]));
    renderPanel();
    expect(screen.getByRole("button", { name: m.clear_selection() })).toBeTruthy();
  });

  it("shows the [N вибрано] label and an enabled selection menu when something is selected", () => {
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    expect(screen.getByText(m.selected_count_label({ count: 2 }))).toBeTruthy();
    expect(selectionMenuButton().getAttribute("aria-disabled")).toBeNull();
  });

  it("clicking 'Виділити все' selects all visible and announces the count on the toolbar's own channel", () => {
    renderPanel();
    $announcer.set({ message: "", priority: "polite" });
    fireEvent.click(screen.getByRole("button", { name: m.select_all() }));
    expect([...$streamSelection.get()].sort()).toEqual(["a", "b", "c"]);
    expect($announcer.get()?.message).toBe(m.selection_count({ count: 3 }));
  });

  it("the selection menu's delete item triggers the list's bulk confirm", async () => {
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    // The menu item reaches into the list via the StreamListHandle ref
    // (requestBulkDelete) — proves the widened ref is wired end-to-end.
    const del = await openSelectionItem(m.delete_selected({ count: 2 }));
    await act(async () => { fireEvent.click(del); });
    expect(await screen.findByText(m.confirm_delete_selected({ count: 2 }))).toBeTruthy();
  });

  it("the selection menu exposes Move and Copy items when something is selected", async () => {
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    fireEvent.click(selectionMenuButton());
    expect(await screen.findByRole("menuitem", { name: m.move_selected({ count: 2 }) })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: m.copy_selected({ count: 2 }) })).toBeTruthy();
  });

  it("the selection menu's move item opens the list's bulk transfer picker", async () => {
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    const move = await openSelectionItem(m.move_selected({ count: 2 }));
    await act(async () => { fireEvent.click(move); });
    expect(await screen.findByText(m.move_selected_to_profile_title({ count: 2 }))).toBeTruthy();
  });

  it("export button becomes 'Export selected (N)' and snapshots ids on click", () => {
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: m.streams_export_selected({ count: 2 }) }));
    expect($exportStreamsRequest.get()).toEqual({ ids: expect.arrayContaining(["a", "b"]) });
  });

  it("export button stays whole-profile (ids: null) with no selection", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: m.streams_export_button() }));
    expect($exportStreamsRequest.get()).toEqual({ ids: null });
  });

  it("keeps a 12-stop roving toolbar in DOM order", () => {
    const { container } = renderPanel();
    const toolbar = container.querySelector('[data-zone-id="streams-toolbar"]')!;
    const stops = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button"));
    const tabbable = stops.filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    // 3 (Row 1) + 9 (Row 2: select-all, selection menu, record, stop, 3 chips, 2 sort).
    expect(stops).toHaveLength(12);
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
    const del = await openSelectionItem(m.delete_selected({ count: 1 }));
    fireEvent.click(del);
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
    const del = await openSelectionItem(m.delete_selected({ count: 2 }));
    fireEvent.click(del);
    const confirmBtn = await screen.findByRole("button", { name: m["delete"]() });
    await act(async () => { fireEvent.click(confirmBtn); });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /додати приклади потоків|add example streams/i }),
      ),
    );
  });
});

describe("StreamsPanel — SINGLE-op empty transitions rescue focus (streams-empty-focus-audit)", () => {
  // Deleting/moving the LAST visible stream makes the parent swap StreamList for
  // an empty zone in the same render, so useCompositeList's own [items] effect
  // (and its onEmpty) never runs — the wishlist 223fadb mechanism. The single-op
  // handlers must call onEmpty imperatively, like the bulk handlers already do.
  let zones: ZoneEntry[] = [];
  const onZonesChange = (z: ZoneEntry[]) => { zones = z; };
  const renderWithZones = () =>
    render(<StreamsPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
  const focusList = () =>
    act(() => zones.find((z) => z.id === "streams-list")!.focus("forward"));

  it("single-deleting the last stream focuses the add-examples CTA (never <body>)", async () => {
    $streams.set([mkStream("a", "Alpha")]);
    renderWithZones();
    focusList();
    // Selection is empty → Delete routes to the SINGLE-row confirm.
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    const confirmBtn = await screen.findByRole("button", { name: m["delete"]() });
    await act(async () => { fireEvent.click(confirmBtn); });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /додати приклади потоків|add example streams/i }),
      ),
    );
  });

  it("single-deleting the last visible stream under a filter focuses reset-filter", async () => {
    // a recording, b idle; filter=recording → visible=[a]. Deleting a leaves the
    // store non-empty ([b]) but the visible list empty → filter-empty zone.
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    $streamFilter.set("recording");
    renderWithZones();
    focusList();
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    const confirmBtn = await screen.findByRole("button", { name: m["delete"]() });
    await act(async () => { fireEvent.click(confirmBtn); });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: m.streams_filter_reset() }),
      ),
    );
  });

  it("single-moving the last stream to another profile focuses the add-examples CTA", async () => {
    $streams.set([mkStream("a", "Alpha")]);
    const { container } = renderWithZones();
    fireEvent.click(
      container.querySelector<HTMLElement>('li[data-item-id="a"] button[data-segment="action-menu"]')!,
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: m.move_to_profile() }));
    fireEvent.click(await screen.findByRole("button", { name: "Jazz, 0 потоків" }));
    await waitFor(() => expect($streams.get()).toEqual([]));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /додати приклади потоків|add example streams/i }),
      ),
    );
  });
});

describe("StreamsPanel — Record/Stop selected (C4, R6/R8)", () => {
  beforeEach(() => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({});
  });

  it("relabels Record/Stop to the selected count and snapshots selection on Record", async () => {
    $statuses.set({ a: mkStatus("a", "idle"), b: mkStatus("b", "recording") });
    replaceSelection(new Set(["a", "b"]));
    vi.mocked(tauri.startAllRecordings).mockResolvedValueOnce(1); // only 'a' startable
    renderPanel();
    $announcer.set({ message: "", priority: "polite" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: m.record_selected({ count: 2 }) }));
    });
    expect(new Set(vi.mocked(tauri.startAllRecordings).mock.calls[0][0])).toEqual(new Set(["a", "b"]));
    // started 1, skipped 1 (b already recording)
    expect($announcer.get()?.message).toBe(`${m.record_done({ count: 1 })}, ${m.record_skipped({ count: 1 })}`);
  });

  it("Stop-selected aria-disabled when no selected stream is active (idle selection)", () => {
    replaceSelection(new Set(["a", "b"])); // both idle
    renderPanel();
    const stop = screen.getByRole("button", { name: m.stop_selected({ count: 2 }) });
    expect(stop.getAttribute("aria-disabled")).toBe("true");
  });

  it("Stop-selected stops directly (no confirm) when exactly one selected is active", async () => {
    $statuses.set({ a: mkStatus("a", "recording"), b: mkStatus("b", "idle") });
    replaceSelection(new Set(["a", "b"]));
    vi.mocked(tauri.stopAllRecordings).mockResolvedValueOnce(1);
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: m.stop_selected({ count: 2 }) }));
    });
    expect(new Set(vi.mocked(tauri.stopAllRecordings).mock.calls[0][0])).toEqual(new Set(["a", "b"]));
  });

  it("Stop-selected confirms when >1 selected is active, then stops on confirm", async () => {
    $statuses.set({ a: mkStatus("a", "recording"), b: mkStatus("b", "connecting") });
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    // Only the toolbar button exists yet, so this opens the confirm dialog.
    fireEvent.click(screen.getByRole("button", { name: m.stop_selected({ count: 2 }) }));
    // The dialog's confirm button shares the label — scope the query to the dialog.
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(m.confirm_stop_selected_message({ count: 2 }))).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: m.stop_selected({ count: 2 }) }));
    await waitFor(() => expect(tauri.stopAllRecordings).toHaveBeenCalledTimes(1));
  });

  it("Stop-selected confirm uses the stoppable count, toolbar button keeps the selection count", async () => {
    // a,b active, c idle → selCount=3 but only 2 are stoppable.
    $statuses.set({ a: mkStatus("a", "recording"), b: mkStatus("b", "connecting"), c: mkStatus("c", "idle") });
    replaceSelection(new Set(["a", "b", "c"]));
    renderPanel();
    // Toolbar button shows the full selection count (R1).
    fireEvent.click(screen.getByRole("button", { name: m.stop_selected({ count: 3 }) }));
    const dialog = await screen.findByRole("alertdialog");
    // Message AND confirm button use the actionable (stoppable) count, not selCount.
    expect(within(dialog).getByText(m.confirm_stop_selected_message({ count: 2 }))).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: m.stop_selected({ count: 2 }) }));
    await waitFor(() => expect(tauri.stopAllRecordings).toHaveBeenCalledTimes(1));
  });

  it("R6: a reconnecting stream makes Stop-all enabled (broad is_active), metric stays recording-only", () => {
    $statuses.set({ a: mkStatus("a", "reconnecting") });
    renderPanel();
    const stop = screen.getByRole("button", { name: /^зупинити запис$|^stop recording$/i });
    expect(stop.getAttribute("aria-disabled")).toBeNull(); // broad stoppableCount = 1 → enabled
  });
});

describe("StreamsPanel — the «Потребує уваги» bucket", () => {
  const failed = (id: string): StreamStatus => ({
    ...mkStatus(id, "error"),
    error: "station_unreachable",
  });

  it("counts the stream that gave up together with the one still reconnecting", () => {
    // Counting `error` alone showed zero for the ~40 minutes of retries — the
    // whole window in which the user could still do something (ADR 2026-09-06 §2).
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({ a: failed("a"), b: mkStatus("b", "reconnecting"), c: mkStatus("c", "recording") });
    renderPanel();

    const metric = screen.getByLabelText(new RegExp(`^${m.metric_attention()}:`));
    expect(metric.textContent).toMatch(/\b2\b/);
  });

  it("counts streams, not failures — the metric is a to-do list, not a tally", () => {
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: failed("a") });
    renderPanel();

    const metric = screen.getByLabelText(new RegExp(`^${m.metric_attention()}:`));
    expect(metric.textContent).toMatch(/потік|stream/i);
    expect(metric.textContent).not.toMatch(/збі|error/i);
  });

  it("gives the chip and the metric the same name", () => {
    // Two keys, two families (`filter_*` and `metric_*`), one concept — so the
    // one thing that must never drift is the text. It already did once: the chip
    // said «З помилками» while the metric beside it said «Потребує уваги» about
    // the very same number (ADR 2026-09-06 §2).
    expect(m.filter_attention()).toBe(m.metric_attention());
  });

  it("announces the same number the badge, the metric and the list agree on", () => {
    // The spoken count had its own copy of the predicate and nobody could see it
    // disagree: badge and list said 2, NVDA said «0 потоків». That is the ADR's
    // «одне число мало чотири імені» defect, reappearing on the a11y surface.
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({ a: failed("a"), b: mkStatus("b", "reconnecting"), c: mkStatus("c", "recording") });
    renderPanel();

    const { chips } = chipButtons(document.body);
    fireEvent.click(chips.find((c) => c.textContent?.includes(m.filter_attention()))!);

    expect($announcer.get()?.message).toBe(
      m.streams_filter_changed_few({ label: m.filter_attention(), count: 2 }),
    );
  });

  it("filters the list down to the same two streams the metric counted", () => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({ a: failed("a"), b: mkStatus("b", "reconnecting"), c: mkStatus("c", "recording") });
    renderPanel();

    const { chips } = chipButtons(document.body);
    const attention = chips.find((c) => c.textContent?.includes(m.filter_attention()));
    expect(attention).toBeTruthy();
    fireEvent.click(attention!);

    expect(rowOrder(document.body)).toEqual(["a", "b"]);
  });
});
