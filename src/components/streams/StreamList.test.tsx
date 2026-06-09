import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor, screen } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $streams, $statuses } from "../../stores/streams";
import { $settings } from "../../stores/settings";
import { $playerStatus } from "../../stores/player";
import { $toasts } from "../../stores/toasts";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StreamInfo, GlobalSettings } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { StreamList } from "./StreamList";

vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  removeStream: vi.fn().mockResolvedValue(undefined),
  addToWishlist: vi.fn().mockResolvedValue(undefined),
  addToIgnorelist: vi.fn().mockResolvedValue(undefined),
  listProfiles: vi.fn().mockResolvedValue([
    { name: "Default", streamCount: 3, isActive: true },
    { name: "Jazz", streamCount: 0, isActive: false },
  ]),
  copyStreamToProfile: vi.fn().mockResolvedValue(undefined),
  moveStreamToProfile: vi.fn().mockResolvedValue(undefined),
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
  diskSpaceThresholdGb: 0, doubleClickAction: "record", bandwidthLimitKbps: 0,
  autostart: false, autoAdvance: false, prevRestartThresholdMs: 0,
  hotkeys: { toggleRecording: "", togglePlayback: "", volumeUp: "", volumeDown: "", toggleWindow: "" },
  logRotation: false, logMaxSizeMb: 10, logLevel: "info",
};

beforeEach(() => {
  vi.clearAllMocks();
  $statuses.set({});
  $settings.set(null);
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
  $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
  $toasts.set([]);
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
