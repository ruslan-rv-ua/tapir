import { describe, it, expect, vi, beforeEach } from "vitest";
import * as tauri from "./tauri";
import { applyMuteCleanup, muteCleanupFlags } from "./muteCleanup";
import { $muteState } from "../stores/player";
import type { PlaybackSource, PlayerStatus } from "./tauri";

// Stub the Tauri IPC layer — there is no backend in jsdom.
vi.mock("./tauri", () => ({ setVolume: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Lets attached .then()/.catch() callbacks run before assertions.
const flush = () => new Promise((r) => setTimeout(r, 0));

function statusPlaying(streamId: string): PlayerStatus {
  // volume 0 reflects "still muted at the backend" until restore completes.
  return { state: "playing", source: { type: "stream", streamId }, volume: 0, positionMs: null, durationMs: null };
}

const SOURCE_SWITCH = { stateChangedToPlaying: false, sourceChangedWhilePlaying: true };
const NEW_PLAYBACK = { stateChangedToPlaying: true, sourceChangedWhilePlaying: false };
const NO_TRANSITION = { stateChangedToPlaying: false, sourceChangedWhilePlaying: false };

beforeEach(() => {
  $muteState.set({ muted: false, savedVolume: 0.75, restoring: false });
  vi.mocked(tauri.setVolume).mockReset();
  vi.mocked(tauri.setVolume).mockResolvedValue(undefined);
});

describe("applyMuteCleanup — Case 2 restore race guard", () => {
  it("keeps a fresh mute when a stale restore from a rapid source switch settles late", async () => {
    $muteState.set({ muted: true, savedVolume: 0.75, restoring: false });
    const restoreA = deferred<void>();
    const restoreB = deferred<void>();
    vi.mocked(tauri.setVolume)
      .mockReturnValueOnce(restoreA.promise)
      .mockReturnValueOnce(restoreB.promise);

    // Event 1: source switch while muted → restore A in flight, restoring token set.
    applyMuteCleanup(statusPlaying("s1"), NEW_PLAYBACK);
    expect($muteState.get().restoring).toBe(true);

    // Event 2: fast second source switch (still muted) → restore B in flight.
    applyMuteCleanup(statusPlaying("s2"), SOURCE_SWITCH);
    expect(vi.mocked(tauri.setVolume)).toHaveBeenCalledTimes(2);

    // Restore A settles first → clears mute (its token was still valid).
    restoreA.resolve();
    await flush();
    expect($muteState.get().muted).toBe(false);

    // User re-mutes before B settles — handleMute writes restoring:false, invalidating B.
    $muteState.set({ muted: true, savedVolume: 0.5, restoring: false });

    // Stale restore B settles → must be a no-op, not clobber the fresh mute.
    restoreB.resolve();
    await flush();
    expect($muteState.get()).toEqual({ muted: true, savedVolume: 0.5, restoring: false });
  });

  it("restores volume and clears mute when a new source starts while muted", async () => {
    $muteState.set({ muted: true, savedVolume: 0.6, restoring: false });

    applyMuteCleanup(statusPlaying("s1"), NEW_PLAYBACK);
    expect(tauri.setVolume).toHaveBeenCalledWith(0.6);
    expect($muteState.get().restoring).toBe(true); // token held while in flight

    await flush();
    expect($muteState.get()).toEqual({ muted: false, savedVolume: 0.6, restoring: false });
  });

  it("stays muted when the restore IPC rejects", async () => {
    $muteState.set({ muted: true, savedVolume: 0.6, restoring: false });
    vi.mocked(tauri.setVolume).mockRejectedValue(new Error("ipc down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    applyMuteCleanup(statusPlaying("s1"), SOURCE_SWITCH);
    await flush();

    expect($muteState.get()).toEqual({ muted: true, savedVolume: 0.6, restoring: false });
    errSpy.mockRestore();
  });

  it("does nothing when a source switch happens while not muted", () => {
    $muteState.set({ muted: false, savedVolume: 0.75, restoring: false });
    applyMuteCleanup(statusPlaying("s1"), SOURCE_SWITCH);
    expect(tauri.setVolume).not.toHaveBeenCalled();
    expect($muteState.get().muted).toBe(false);
  });
});

describe("applyMuteCleanup — Cases 1 & 3 (behaviour preserved on extraction)", () => {
  it("Case 1: clears mute UI when volume was raised externally while muted", () => {
    $muteState.set({ muted: true, savedVolume: 0.6, restoring: false });

    applyMuteCleanup(
      { state: "playing", source: { type: "stream", streamId: "s1" }, volume: 0.4, positionMs: null, durationMs: null },
      NO_TRANSITION,
    );

    expect($muteState.get()).toEqual({ muted: false, savedVolume: 0.6, restoring: false });
    expect(tauri.setVolume).not.toHaveBeenCalled();
  });

  it("Case 3: restores volume on an unexpected stop while muted", async () => {
    $muteState.set({ muted: true, savedVolume: 0.6, restoring: false });

    applyMuteCleanup(
      { state: "stopped", source: null, volume: 0, positionMs: null, durationMs: null },
      NO_TRANSITION,
    );
    expect(tauri.setVolume).toHaveBeenCalledWith(0.6);
    expect($muteState.get().restoring).toBe(true);

    await flush();
    expect($muteState.get()).toEqual({ muted: false, savedVolume: 0.6, restoring: false });
  });
});

function status(state: PlayerStatus["state"], source: PlaybackSource | null, volume = 0): PlayerStatus {
  return { state, source, volume, positionMs: null, durationMs: null };
}

const previewA: PlaybackSource = { type: "preview", url: "http://a/live", name: "A" };
const previewB: PlaybackSource = { type: "preview", url: "http://b/live", name: "B" };

describe("muteCleanupFlags", () => {
  it("preview → preview with a different url is a source switch", () => {
    expect(muteCleanupFlags(status("playing", previewA), status("playing", previewB)))
      .toEqual({ stateChangedToPlaying: false, sourceChangedWhilePlaying: true });
  });

  it("the same preview is not a switch", () => {
    expect(muteCleanupFlags(status("playing", previewA), status("playing", { ...previewA })))
      .toEqual(NO_TRANSITION);
  });

  it("stream → another stream is a switch, the same stream is not", () => {
    const s1: PlaybackSource = { type: "stream", streamId: "s1" };
    expect(muteCleanupFlags(status("playing", s1), status("playing", { type: "stream", streamId: "s2" })))
      .toEqual(SOURCE_SWITCH);
    expect(muteCleanupFlags(status("playing", s1), status("playing", { ...s1 }))).toEqual(NO_TRANSITION);
  });

  it("file → another file is a switch, the same file is not", () => {
    const f: PlaybackSource = { type: "file", path: "a.mp3" };
    expect(muteCleanupFlags(status("playing", f), status("playing", { type: "file", path: "b.mp3" })))
      .toEqual(SOURCE_SWITCH);
    expect(muteCleanupFlags(status("playing", f), status("playing", { ...f }))).toEqual(NO_TRANSITION);
  });

  it("a change of kind is a switch", () => {
    expect(muteCleanupFlags(status("playing", previewA), status("playing", { type: "stream", streamId: "s1" })))
      .toEqual(SOURCE_SWITCH);
  });

  it("stopped → playing is a new playback", () => {
    expect(muteCleanupFlags(status("stopped", null), status("playing", previewA)))
      .toEqual({ stateChangedToPlaying: true, sourceChangedWhilePlaying: true });
    expect(muteCleanupFlags(status("stopped", previewA), status("playing", previewA)))
      .toEqual(NEW_PLAYBACK);
  });

  it("paused → playing on another source is a switch, on the same source is a plain resume", () => {
    const f: PlaybackSource = { type: "file", path: "a.mp3" };
    expect(muteCleanupFlags(status("paused", f), status("playing", { type: "file", path: "b.mp3" })))
      .toEqual(SOURCE_SWITCH);
    expect(muteCleanupFlags(status("paused", f), status("playing", f))).toEqual(NO_TRANSITION);
  });

  it("null → null while playing is not a switch", () => {
    expect(muteCleanupFlags(status("playing", null), status("playing", null))).toEqual(NO_TRANSITION);
  });

  it("nothing is a switch unless the next state is playing", () => {
    expect(muteCleanupFlags(status("playing", previewA), status("stopped", previewB))).toEqual(NO_TRANSITION);
  });
});

describe("preview → preview under mute", () => {
  it("restores the level saved before Ctrl+M and clears mute", async () => {
    $muteState.set({ muted: true, savedVolume: 0.6, restoring: false });
    const next = status("playing", previewB, 0);
    applyMuteCleanup(next, muteCleanupFlags(status("playing", previewA, 0), next));
    expect(vi.mocked(tauri.setVolume)).toHaveBeenCalledWith(0.6);
    await flush();
    expect($muteState.get()).toEqual({ muted: false, savedVolume: 0.6, restoring: false });
  });

  it("pause → resume of the same source stays muted", async () => {
    $muteState.set({ muted: true, savedVolume: 0.6, restoring: false });
    const f: PlaybackSource = { type: "file", path: "a.mp3" };
    const next = status("playing", f, 0);
    applyMuteCleanup(next, muteCleanupFlags(status("paused", f, 0), next));
    await flush();
    expect(vi.mocked(tauri.setVolume)).not.toHaveBeenCalled();
    expect($muteState.get().muted).toBe(true);
  });
});
