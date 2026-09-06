import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import { StreamContextMenu } from "./StreamContextMenu";
import { $playerStatus } from "../../stores/player";
import { replaceSelection } from "../../stores/streams";
import * as tauri from "../../lib/tauri";

// No backend in jsdom — stub the Tauri IPC layer.
vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../i18n/paraglide/messages", () => ({
  stream_actions: ({ name }: { name: string }) => `Дії для ${name}`,
  stream_context_menu: () => "Контекстне меню потоку",
  play_stream: () => "Відтворити потік",
  stop_stream_playback: () => "Зупинити відтворення",
  start_recording: () => "Почати запис",
  stop_recording: () => "Зупинити запис",
  edit_stream: () => "Редагувати потік",
  add_to_wishlist: () => "Додати до бажаних",
  add_to_ignorelist: () => "Додати до ігнор-листа",
  remove_stream: () => "Видалити потік",
  delete_selected: ({ count }: { count: number }) => `Видалити виділені (${count})`,
  copy_to_profile: () => "Копіювати в профіль…",
  move_to_profile: () => "Перемістити в профіль…",
  move_disabled_reason: () => "Не можна перемістити активний потік",
  copy_url: () => "Копіювати URL",
  stream_action_open_player: () => "Відкрити у медіаплеєрі",
  move_selected: ({ count }: { count: number }) => `Перемістити виділені (${count})`,
  copy_selected: ({ count }: { count: number }) => `Копіювати виділені (${count})`,
}));

const mkStream = (over: Partial<StreamInfo> = {}): StreamInfo => ({
  id: "s1", url: "http://x/s1", name: "Radio Paradise", format: "mp3", unsupportedCodec: null, bitrate: 192,
  icyName: null, icyGenre: null, icyUrl: null, ignorelist: [], username: null,
  password: null, addedAt: "2026-01-01T00:00:00Z", ...over,
});

const mkStatus = (state: StreamStatus["state"]): StreamStatus => ({
  streamId: "s1", state, currentTrack: null, recordingStartedAt: null,
  bytesRecorded: 0, tracksRecorded: 0, error: null, reconnectAttempt: null, reconnectMaxRetries: null,
  sessionId: 0,
});

function renderMenu(status?: StreamStatus) {
  const h = {
    onAddToWishlist: vi.fn(), onAddToIgnorelist: vi.fn(), onDelete: vi.fn(),
    onCopyToProfile: vi.fn(), onMoveToProfile: vi.fn(), onCopyUrl: vi.fn(),
    onOpenInPlayer: vi.fn(),
  };
  const utils = render(
    <StreamContextMenu stream={mkStream()} status={status} menuFocused {...h} />,
  );
  return { ...utils, ...h };
}

beforeEach(() => replaceSelection(new Set()));

afterEach(() => {
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
});

describe("StreamContextMenu — copy/move to profile", () => {
  const open = (container: HTMLElement) =>
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);

  it("shows both items and calls handlers when clicked", async () => {
    const { container, onCopyToProfile, onMoveToProfile } = renderMenu(mkStatus("idle"));
    open(container);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Копіювати в профіль…" }));
    expect(onCopyToProfile).toHaveBeenCalled();
    open(container);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Перемістити в профіль…" }));
    expect(onMoveToProfile).toHaveBeenCalled();
  });

  it("disables Move while recording", async () => {
    const { container } = renderMenu(mkStatus("recording"));
    open(container);
    const move = await screen.findByRole("menuitem", { name: "Перемістити в профіль…" });
    expect(move.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables Move while this stream is playing", async () => {
    $playerStatus.set({
      state: "playing", source: { type: "stream", streamId: "s1" },
      volume: 0.75, positionMs: null, durationMs: null,
    });
    const { container } = renderMenu(mkStatus("idle"));
    open(container);
    const move = await screen.findByRole("menuitem", { name: "Перемістити в профіль…" });
    expect(move.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps Copy enabled while recording", async () => {
    const { container } = renderMenu(mkStatus("recording"));
    open(container);
    const copy = await screen.findByRole("menuitem", { name: "Копіювати в профіль…" });
    expect(copy.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("calls onCopyUrl when Copy URL is clicked", async () => {
    const { container, onCopyUrl } = renderMenu(mkStatus("idle"));
    open(container);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Копіювати URL" }));
    expect(onCopyUrl).toHaveBeenCalled();
  });

  it("calls onOpenInPlayer when the media-player item is clicked, even while recording", async () => {
    // A second connection to the station is allowed on purpose (see the record's
    // "Одночасний запис"): the item is never disabled.
    const { container, onOpenInPlayer } = renderMenu(mkStatus("recording"));
    open(container);
    const item = await screen.findByRole("menuitem", { name: "Відкрити у медіаплеєрі" });
    expect(item.getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(item);
    expect(onOpenInPlayer).toHaveBeenCalled();
  });
});

describe("StreamContextMenu — the record item while the recording is only connecting", () => {
  // Same rule as the row button: a recording exists from the start command on,
  // so the menu must say the same thing the button says (one condition, one home).
  const open = (container: HTMLElement) =>
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);

  beforeEach(() => vi.clearAllMocks());

  it.each(["connecting", "reconnecting"] as const)(
    "offers «Зупинити запис» while %s and stops, never starts",
    async (state) => {
      const { container } = renderMenu(mkStatus(state));
      open(container);
      fireEvent.click(await screen.findByRole("menuitem", { name: "Зупинити запис" }));
      expect(tauri.stopRecording).toHaveBeenCalledWith("s1");
      expect(tauri.startRecording).not.toHaveBeenCalled();
    },
  );
});

describe("StreamContextMenu — selection-aware delete label", () => {
  const open = (container: HTMLElement) =>
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);

  it("delete item shows the bulk count when the row is selected", async () => {
    replaceSelection(new Set(["s1", "s2"])); // stream under test is s1
    const { container } = renderMenu(mkStatus("idle"));
    open(container);
    expect(await screen.findByRole("menuitem", { name: "Видалити виділені (2)" })).toBeTruthy();
  });

  it("delete item shows the single-stream label when the row is NOT selected", async () => {
    replaceSelection(new Set(["other"])); // selection exists, but not the row under test (s1)
    const { container } = renderMenu(mkStatus("idle"));
    open(container);
    expect(await screen.findByRole("menuitem", { name: "Видалити потік" })).toBeTruthy();
  });
});

describe("StreamContextMenu — selection-aware move/copy labels", () => {
  const open = (container: HTMLElement) =>
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);

  it("shows bulk move/copy labels with the count when the row is selected", async () => {
    replaceSelection(new Set(["s1", "s2"])); // row under test is s1
    const { container } = renderMenu(mkStatus("idle"));
    open(container);
    expect(await screen.findByRole("menuitem", { name: "Перемістити виділені (2)" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Копіювати виділені (2)" })).toBeTruthy();
  });

  it("keeps Move enabled even while recording when the row is selected (bulk skips server-side)", async () => {
    replaceSelection(new Set(["s1"]));
    const { container } = renderMenu(mkStatus("recording"));
    open(container);
    const move = await screen.findByRole("menuitem", { name: "Перемістити виділені (1)" });
    expect(move.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("uses single labels + the moveDisabled gate when the row is NOT selected", async () => {
    replaceSelection(new Set(["other"]));
    const { container } = renderMenu(mkStatus("recording"));
    open(container);
    expect(await screen.findByRole("menuitem", { name: "Перемістити в профіль…" })).toBeTruthy();
    const move = screen.getByRole("menuitem", { name: "Перемістити в профіль…" });
    expect(move.getAttribute("aria-disabled")).toBe("true");
  });
});
