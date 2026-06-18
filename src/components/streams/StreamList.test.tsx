import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor, screen } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $streams, $statuses, $streamSelection, replaceSelection } from "../../stores/streams";
import { $announcer } from "../../stores/announcer";
import { $settings } from "../../stores/settings";
import { $playerStatus } from "../../stores/player";
import { $toasts } from "../../stores/toasts";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StreamInfo, GlobalSettings } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { StreamList } from "./StreamList";

const writeText = vi.fn().mockResolvedValue(undefined);

vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  removeStream: vi.fn().mockResolvedValue(undefined),
  removeStreams: vi.fn().mockResolvedValue(2),
  addToWishlist: vi.fn().mockResolvedValue(undefined),
  addToIgnorelist: vi.fn().mockResolvedValue(undefined),
  listProfiles: vi.fn().mockResolvedValue([
    { name: "Default", streamCount: 3, isActive: true },
    { name: "Jazz", streamCount: 0, isActive: false },
  ]),
  copyStreamToProfile: vi.fn().mockResolvedValue(undefined),
  moveStreamToProfile: vi.fn().mockResolvedValue(undefined),
  copyStreamsToProfile: vi.fn().mockResolvedValue({ transferred: [], skippedRecording: 0, skippedConflict: 0 }),
  moveStreamsToProfile: vi.fn().mockResolvedValue({ transferred: [], skippedRecording: 0, skippedConflict: 0 }),
  createProfile: vi.fn().mockResolvedValue({ name: "Fresh", streamCount: 0, isActive: false }),
}));

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

const baseSettings: GlobalSettings = {
  language: "uk", theme: "auto", activeProfile: "Default", outputDevice: null,
  minimizeToTray: false, showTrayNotifications: false, showTrackInTitle: false,
  diskSpaceThresholdGb: 0, doubleClickAction: "record", sortBy: "name", bandwidthLimitKbps: 0,
  autostart: false, autoAdvance: false, prevRestartThresholdMs: 0,
  hotkeys: { toggleRecording: "", togglePlayback: "", volumeUp: "", volumeDown: "", toggleWindow: "", stopAll: "", prevTrack: "", nextTrack: "" },
  logRotation: false, logMaxSizeMb: 10, logLevel: "info",
};

beforeEach(() => {
  vi.clearAllMocks();
  $statuses.set({});
  $settings.set(null);
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
  $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
  $toasts.set([]);
  replaceSelection(new Set());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  writeText.mockClear();
});

function renderList() {
  const ref = createRef<ZoneEntry>();
  const exitZone = vi.fn();
  const onEmpty = vi.fn();
  const utils = render(<StreamList ref={ref} exitZone={exitZone} onEmpty={onEmpty} />);
  return { ref, exitZone, onEmpty, ...utils };
}

const activeAttrs = () => {
  const ae = document.activeElement;
  return {
    id: ae?.getAttribute("data-item-id") ?? null,
    seg: ae?.getAttribute("data-segment") ?? null,
  };
};

describe("StreamList — integration with composite-list navigation", () => {
  it("renders one row per stream, each described as a stream", () => {
    const { container } = renderList();
    const rows = container.querySelectorAll('li[data-segment="summary"]');
    expect(rows).toHaveLength(3);
    rows.forEach((li) =>
      expect(li.getAttribute("aria-roledescription")).toMatch(/потік|stream/i),
    );
  });

  it("focuses the first row on zone entry, then ArrowDown moves to the next row", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    expect(activeAttrs()).toEqual({ id: "a", seg: "summary" });

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(activeAttrs()).toEqual({ id: "b", seg: "summary" });
  });

  it("Right drills into the row's segments/buttons; Down returns to the next row's summary", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(activeAttrs()).toEqual({ id: "a", seg: "track" });

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(activeAttrs()).toEqual({ id: "b", seg: "summary" });
  });

  it("Tab exits the zone forward", () => {
    const { ref, exitZone } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(exitZone).toHaveBeenCalledWith(true);
  });

  it("exposes the list as an application region (NVDA focus mode)", () => {
    const { container } = renderList();
    const ul = container.querySelector("ul")!;
    expect(ul.getAttribute("role")).toBe("application");
    expect(ul.getAttribute("data-zone-id")).toBe("streams-list");
    expect(ul.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("StreamList — row activation honors doubleClickAction", () => {
  const focusFirstRow = () => {
    const ref = createRef<ZoneEntry>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    act(() => ref.current!.focus("forward"));
  };

  it("Enter on a row starts recording when doubleClickAction is 'record'", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "record" });
    focusFirstRow();
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(tauri.startRecording).toHaveBeenCalledWith("a");
    expect(tauri.playStream).not.toHaveBeenCalled();
  });

  it("Enter on a row starts playback when doubleClickAction is 'play'", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "play" });
    focusFirstRow();
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(tauri.playStream).toHaveBeenCalledWith("a");
    expect(tauri.startRecording).not.toHaveBeenCalled();
  });

  it("Enter stops playback when 'play' and this stream is already playing", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "play" });
    $playerStatus.set({
      state: "playing", source: { type: "stream", streamId: "a" },
      volume: 0.75, positionMs: null, durationMs: null,
    });
    focusFirstRow();
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(tauri.stopPlayback).toHaveBeenCalled();
    expect(tauri.playStream).not.toHaveBeenCalled();
  });

  it("Shift+Enter toggles playback even when doubleClickAction is 'record'", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "record" });
    focusFirstRow();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", shiftKey: true });
    expect(tauri.playStream).toHaveBeenCalledWith("a");
    expect(tauri.startRecording).not.toHaveBeenCalled();
  });

  it("Ctrl+Enter toggles recording even when doubleClickAction is 'play'", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "play" });
    focusFirstRow();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", ctrlKey: true });
    expect(tauri.startRecording).toHaveBeenCalledWith("a");
    expect(tauri.playStream).not.toHaveBeenCalled();
  });

  it("Shift+Enter stops playback when this stream is already playing", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "record" });
    $playerStatus.set({
      state: "playing", source: { type: "stream", streamId: "a" },
      volume: 0.75, positionMs: null, durationMs: null,
    });
    focusFirstRow();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", shiftKey: true });
    expect(tauri.stopPlayback).toHaveBeenCalled();
    expect(tauri.startRecording).not.toHaveBeenCalled();
  });

  it("Ctrl+Enter stops recording when this stream is already recording", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "play" });
    $statuses.set({
      a: {
        streamId: "a", state: "recording", currentTrack: null, recordingStartedAt: null,
        bytesRecorded: 0, tracksRecorded: 0, error: null, reconnectAttempt: null,
        sessionId: 0,
      },
    });
    focusFirstRow();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", ctrlKey: true });
    expect(tauri.stopRecording).toHaveBeenCalledWith("a");
    expect(tauri.playStream).not.toHaveBeenCalled();
  });

  it("does not advertise keyshortcuts on the row", () => {
    const { container } = renderList();
    const li = container.querySelector('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-keyshortcuts")).toBeNull();
  });

  it("defaults to recording when settings are not loaded yet", () => {
    $settings.set(null);
    focusFirstRow();
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(tauri.startRecording).toHaveBeenCalledWith("a");
    expect(tauri.playStream).not.toHaveBeenCalled();
  });
});

describe("StreamList — mouse double-click honors doubleClickAction", () => {
  const row = (container: HTMLElement, id: string) =>
    container.querySelector<HTMLElement>(`li[data-item-id="${id}"][data-segment="summary"]`)!;

  it("double-click on a row starts recording when doubleClickAction is 'record'", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "record" });
    const { container } = renderList();
    fireEvent.doubleClick(row(container, "b"));
    expect(tauri.startRecording).toHaveBeenCalledWith("b");
    expect(tauri.playStream).not.toHaveBeenCalled();
  });

  it("double-click on a row starts playback when doubleClickAction is 'play'", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "play" });
    const { container } = renderList();
    fireEvent.doubleClick(row(container, "b"));
    expect(tauri.playStream).toHaveBeenCalledWith("b");
    expect(tauri.startRecording).not.toHaveBeenCalled();
  });

  it("Shift+double-click toggles playback even when doubleClickAction is 'record'", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "record" });
    const { container } = renderList();
    fireEvent.doubleClick(row(container, "b"), { shiftKey: true });
    expect(tauri.playStream).toHaveBeenCalledWith("b");
    expect(tauri.startRecording).not.toHaveBeenCalled();
  });

  it("Ctrl+double-click toggles recording even when doubleClickAction is 'play'", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "play" });
    const { container } = renderList();
    fireEvent.doubleClick(row(container, "b"), { ctrlKey: true });
    expect(tauri.startRecording).toHaveBeenCalledWith("b");
    expect(tauri.playStream).not.toHaveBeenCalled();
  });

  it("double-click on an action button does not also trigger row activation", () => {
    $settings.set({ ...baseSettings, doubleClickAction: "record" });
    const { container } = renderList();
    const recordBtn = container.querySelector<HTMLElement>(
      'li[data-item-id="b"] button[data-segment="action-record"]',
    )!;
    fireEvent.doubleClick(recordBtn);
    // The interactive-control guard must swallow the row's dblclick.
    expect(tauri.startRecording).not.toHaveBeenCalled();
  });
});

describe("StreamList — copy/move stream to profile", () => {
  const openMenu = (container: HTMLElement, id: string) =>
    fireEvent.click(
      container.querySelector<HTMLElement>(`li[data-item-id="${id}"] button[data-segment="action-menu"]`)!,
    );

  it("move: sends to the chosen profile and optimistically removes the row", async () => {
    const { container } = renderList();
    openMenu(container, "a");
    fireEvent.click(await screen.findByRole("menuitem", { name: m.move_to_profile() }));

    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.moveStreamToProfile).toHaveBeenCalledWith("a", "Jazz"));
    await waitFor(() => expect($streams.get().some((s) => s.id === "a")).toBe(false));
  });

  it("copy: sends to the chosen profile and keeps the row", async () => {
    const { container } = renderList();
    openMenu(container, "b");
    fireEvent.click(await screen.findByRole("menuitem", { name: m.copy_to_profile() }));

    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.copyStreamToProfile).toHaveBeenCalledWith("b", "Jazz"));
    expect($streams.get().some((s) => s.id === "b")).toBe(true);
  });

  it("create-new: creates a profile then transfers into it", async () => {
    const { container } = renderList();
    openMenu(container, "c");
    fireEvent.click(await screen.findByRole("menuitem", { name: m.copy_to_profile() }));

    fireEvent.click(await screen.findByRole("button", { name: m.transfer_create_new_profile() }));

    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Fresh" } });
    fireEvent.click(screen.getByRole("button", { name: m.ok() }));

    await waitFor(() => expect(tauri.createProfile).toHaveBeenCalledWith("Fresh"));
    await waitFor(() => expect(tauri.copyStreamToProfile).toHaveBeenCalledWith("c", "Fresh"));
  });

  it("conflict: shows a toast but keeps the picker open and does not remove the row", async () => {
    vi.mocked(tauri.moveStreamToProfile).mockRejectedValueOnce("Conflict: Jazz");

    const { container } = renderList();
    openMenu(container, "a");
    fireEvent.click(await screen.findByRole("menuitem", { name: m.move_to_profile() }));

    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.moveStreamToProfile).toHaveBeenCalledWith("a", "Jazz"));
    expect($streams.get().some((s) => s.id === "a")).toBe(true);
    await waitFor(() =>
      expect(
        $toasts.get().some((t) => t.message === m.stream_already_in_profile({ name: "Alpha", profile: "Jazz" })),
      ).toBe(true),
    );
    expect(screen.getByRole("button", { name: "Jazz" })).toBeTruthy();
  });
});

describe("StreamList — copy stream URL", () => {
  it("Ctrl+C on the focused row copies its URL and toasts", async () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "c", code: "KeyC", ctrlKey: true });
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://x/a"));
    await waitFor(() =>
      expect($toasts.get().some((t) => t.message === m.stream_url_copied({ name: "Alpha" }))).toBe(true),
    );
  });

  it("context-menu Copy URL copies the row's URL", async () => {
    const { container } = renderList();
    fireEvent.click(
      container.querySelector<HTMLElement>('li[data-item-id="b"] button[data-segment="action-menu"]')!,
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: m.copy_url() }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://x/b"));
  });
});

describe("StreamList — selection rendering & announcements", () => {
  it("renders the ', виділено' suffix for selected rows from $streamSelection", () => {
    replaceSelection(new Set(["b"]));
    const { container } = renderList();
    const li = container.querySelector<HTMLElement>('li[data-item-id="b"][data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toContain(m.selection_suffix());
    expect(li.getAttribute("data-selected")).toBe("true");
  });

  it("Ctrl+Space announces the single toggle with the stream name + state", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward")); // row a
    $announcer.set(null);
    fireEvent.keyDown(document.activeElement!, { key: " ", code: "Space", ctrlKey: true });
    expect($streamSelection.get().has("a")).toBe(true);
    expect($announcer.get()?.message).toBe(m.stream_selected({ name: "Alpha" }));
  });

  it("a group gesture announces one summary; a pointer single is NOT announced", () => {
    const { ref, container } = renderList();
    act(() => ref.current!.focus("forward"));
    // Group: Ctrl+A selects all visible → one summary announce.
    $announcer.set(null);
    fireEvent.keyDown(document.activeElement!, { key: "a", code: "KeyA", ctrlKey: true });
    expect($announcer.get()?.message).toBe(m.selection_count({ count: 3 }));
    // Pointer single (simple click) collapses selection but is NOT re-announced.
    $announcer.set(null);
    fireEvent.click(
      container.querySelector<HTMLElement>('li[data-item-id="b"][data-segment="summary"]')!,
      { bubbles: true },
    );
    expect($streamSelection.get().size).toBe(1);
    expect($announcer.get()).toBeNull();
  });
});

describe("StreamList — focus after bulk delete", () => {
  const idOf = () => document.activeElement?.getAttribute("data-item-id") ?? null;

  it("lands on the nearest survivor at/after the top removed index (never <body>)", async () => {
    replaceSelection(new Set(["a"])); // remove first; survivor at idx0 → b
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    fireEvent.click(await screen.findByRole("button", { name: m["delete"]() }));
    await waitFor(() => expect(idOf()).toBe("b"));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("deleting the tail focuses the new last row", async () => {
    replaceSelection(new Set(["c"]));
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    fireEvent.click(await screen.findByRole("button", { name: m["delete"]() }));
    await waitFor(() => expect(idOf()).toBe("b"));
  });

  it("computes the index over the FILTERED/SORTED visible order, not the full $streams", async () => {
    // Visible = only [b, c] (a hidden by the parent's filter); remove b → focus c.
    replaceSelection(new Set(["b"]));
    const ref = createRef<ZoneEntry>();
    render(
      <StreamList
        ref={ref}
        exitZone={vi.fn()}
        onEmpty={vi.fn()}
        streams={[mkStream("b", "Bravo"), mkStream("c", "Charlie")]}
      />,
    );
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    fireEvent.click(await screen.findByRole("button", { name: m["delete"]() }));
    await waitFor(() => expect(idOf()).toBe("c"));
  });
});

describe("StreamList — imperative requestBulkDelete", () => {
  it("opens the bulk confirm from the handle (toolbar entry point)", async () => {
    replaceSelection(new Set(["a", "b"]));
    const ref = createRef<ZoneEntry & { requestBulkDelete(): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    act(() => ref.current!.requestBulkDelete());
    expect(await screen.findByText(m.confirm_delete_selected({ count: 2 }))).toBeTruthy();
  });
});

describe("StreamList — ⋯ delete routing by selection (Explorer model)", () => {
  const openMenu = (container: HTMLElement, id: string) =>
    fireEvent.click(container.querySelector<HTMLElement>(`li[data-item-id="${id}"] button[data-segment="action-menu"]`)!);

  it("⋯ delete on a selected row opens the bulk confirm", async () => {
    replaceSelection(new Set(["a", "b"]));
    const { container } = renderList();
    openMenu(container, "a");
    fireEvent.click(await screen.findByRole("menuitem", { name: m.delete_selected({ count: 2 }) }));
    expect(await screen.findByText(m.confirm_delete_selected({ count: 2 }))).toBeTruthy();
  });

  it("⋯ delete on a NON-selected row collapses to it, then does single delete", async () => {
    replaceSelection(new Set(["a", "b"]));
    const { container } = renderList();
    openMenu(container, "c"); // c not selected
    fireEvent.click(await screen.findByRole("menuitem", { name: m.remove_stream() }));
    expect(await screen.findByText(m.confirm_delete_stream({ name: "Charlie" }))).toBeTruthy();
    expect([...$streamSelection.get()]).toEqual(["c"]); // collapsed
  });
});

describe("StreamList — prune vanished ids", () => {
  it("drops selected ids that no longer exist in $streams (keeps the counter honest)", async () => {
    replaceSelection(new Set(["a", "b"]));
    renderList(); // streams a,b,c exist → nothing pruned yet
    expect($streamSelection.get().size).toBe(2);
    act(() => $streams.set([mkStream("a", "Alpha")])); // b and c gone
    await waitFor(() => expect([...$streamSelection.get()]).toEqual(["a"]));
  });
});

describe("StreamList — bulk transfer to profile", () => {
  const openMenu = (container: HTMLElement, id: string) =>
    fireEvent.click(container.querySelector<HTMLElement>(`li[data-item-id="${id}"] button[data-segment="action-menu"]`)!);
  const idOf = () => document.activeElement?.getAttribute("data-item-id") ?? null;

  it("toolbar requestBulkTransfer('move') opens the picker with the BULK title", async () => {
    replaceSelection(new Set(["a", "b"]));
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    await act(async () => { ref.current!.requestBulkTransfer("move"); });
    expect(await screen.findByText(m.move_selected_to_profile_title({ count: 2 }))).toBeTruthy();
  });

  it("bulk move calls moveStreamsToProfile, removes only transferred rows, focuses a survivor", async () => {
    vi.mocked(tauri.moveStreamsToProfile).mockResolvedValueOnce({ transferred: ["a"], skippedRecording: 0, skippedConflict: 0 });
    replaceSelection(new Set(["a", "b"])); // b will be reported as skipped (not in transferred)
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    const { container } = render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    act(() => (ref.current as unknown as ZoneEntry).focus("forward"));
    await act(async () => { ref.current!.requestBulkTransfer("move"); });
    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.moveStreamsToProfile).toHaveBeenCalledTimes(1));
    expect(new Set(vi.mocked(tauri.moveStreamsToProfile).mock.calls[0][0])).toEqual(new Set(["a", "b"]));
    await waitFor(() => expect($streams.get().map((s) => s.id)).toEqual(["b", "c"])); // only 'a' removed
    await waitFor(() => expect(idOf()).toBe("b")); // nearest survivor, never <body>
    expect(document.activeElement).not.toBe(document.body);
    expect([...$streamSelection.get()]).toEqual(["b"]); // moved 'a' pruned; skipped 'b' stays selected
  });

  it("bulk copy calls copyStreamsToProfile, keeps rows AND selection", async () => {
    vi.mocked(tauri.copyStreamsToProfile).mockResolvedValueOnce({ transferred: ["a", "b"], skippedRecording: 0, skippedConflict: 0 });
    replaceSelection(new Set(["a", "b"]));
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    await act(async () => { ref.current!.requestBulkTransfer("copy"); });
    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.copyStreamsToProfile).toHaveBeenCalledTimes(1));
    expect($streams.get().map((s) => s.id)).toEqual(["a", "b", "c"]); // nothing removed
    expect([...$streamSelection.get()].sort()).toEqual(["a", "b"]); // selection kept
  });

  it("announces a reason-broken-down summary", async () => {
    vi.mocked(tauri.moveStreamsToProfile).mockResolvedValueOnce({ transferred: ["a"], skippedRecording: 1, skippedConflict: 1 });
    replaceSelection(new Set(["a", "b", "c"]));
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    $announcer.set(null);
    await act(async () => { ref.current!.requestBulkTransfer("move"); });
    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));
    await waitFor(() =>
      expect($announcer.get()?.message).toBe(
        `${m.transfer_done_moved({ count: 1 })}, ${m.transfer_skipped_recording({ count: 1 })}, ${m.transfer_skipped_conflict({ count: 1 })}`,
      ),
    );
  });

  it("⋯ move on a SELECTED row opens bulk; on a NON-selected row collapses + single", async () => {
    replaceSelection(new Set(["a", "b"]));
    const { container } = renderList();
    openMenu(container, "a"); // selected
    fireEvent.click(await screen.findByRole("menuitem", { name: m.move_selected({ count: 2 }) }));
    expect(await screen.findByText(m.move_selected_to_profile_title({ count: 2 }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.cancel() }));

    openMenu(container, "c"); // not selected
    fireEvent.click(await screen.findByRole("menuitem", { name: m.move_to_profile() }));
    expect(await screen.findByText(m.move_stream_to_profile_title({ name: "Charlie" }))).toBeTruthy();
    expect([...$streamSelection.get()]).toEqual(["c"]); // collapsed to the row
  });
});

describe("StreamList — bulk delete", () => {
  it("Delete with a non-empty selection opens one confirm with the exact count", async () => {
    replaceSelection(new Set(["a", "b"]));
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    expect(await screen.findByText(m.confirm_delete_selected({ count: 2 }))).toBeTruthy();
  });

  it("confirming calls removeStreams with the selected ids, updates $streams once, announces", async () => {
    replaceSelection(new Set(["a", "c"]));
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    fireEvent.click(await screen.findByRole("button", { name: m["delete"]() }));

    await waitFor(() => expect(tauri.removeStreams).toHaveBeenCalledTimes(1));
    expect(new Set(vi.mocked(tauri.removeStreams).mock.calls[0][0])).toEqual(new Set(["a", "c"]));
    await waitFor(() => expect($streams.get().map((s) => s.id)).toEqual(["b"]));
    expect($streamSelection.get().size).toBe(0);
    await waitFor(() => expect($announcer.get()?.message).toBe(m.streams_removed_bulk({ count: 2 })));
  });

  it("Delete with an empty selection still does single-row delete (unchanged)", async () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    expect(await screen.findByText(m.confirm_delete_stream({ name: "Alpha" }))).toBeTruthy();
  });
});
