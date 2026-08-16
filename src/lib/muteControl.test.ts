import { describe, it, expect, beforeEach, vi } from "vitest";
import { isSoundOff, rememberVolumeLevel, toggleMute } from "./muteControl";
import { $muteState, $playerStatus, FALLBACK_VOLUME } from "../stores/player";
import * as tauri from "./tauri";
import * as m from "../i18n/paraglide/messages";

vi.mock("./tauri", () => ({ setVolume: vi.fn().mockResolvedValue(undefined) }));

const announce = vi.fn();

/** A stream playing at the given level; `state` matters — a stopped player is a no-op. */
function playingAt(volume: number) {
  $playerStatus.set({
    state: "playing",
    source: { type: "stream", streamId: "s1" },
    volume,
    positionMs: null,
    durationMs: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tauri.setVolume).mockResolvedValue(undefined);
  $muteState.set({ muted: false, savedVolume: FALLBACK_VOLUME, restoring: false });
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
});

describe("isSoundOff", () => {
  it("is true for both paths into silence and false only for audible output", () => {
    expect(isSoundOff(true, 0)).toBe(true);      // toggle, level already down
    expect(isSoundOff(true, 0.6)).toBe(true);    // toggle mid-restore
    expect(isSoundOff(false, 0)).toBe(true);     // the case this record closes
    expect(isSoundOff(false, 0.6)).toBe(false);
  });
});

describe("rememberVolumeLevel", () => {
  it("records a non-zero level without disturbing the toggle or the restore token", () => {
    $muteState.set({ muted: true, savedVolume: 0.2, restoring: true });
    rememberVolumeLevel(0.6);
    expect($muteState.get()).toEqual({ muted: true, savedVolume: 0.6, restoring: true });
  });

  it("keeps the last non-zero level when the level reaches zero", () => {
    rememberVolumeLevel(0.6);
    rememberVolumeLevel(0);
    expect($muteState.get().savedVolume).toBe(0.6);
  });
});

describe("toggleMute — the toggle path (unchanged)", () => {
  it("mutes an audible player, remembering the level it silenced", async () => {
    playingAt(0.6);
    await toggleMute(announce);
    expect(tauri.setVolume).toHaveBeenCalledWith(0);
    expect($muteState.get()).toEqual({ muted: true, savedVolume: 0.6, restoring: false });
    expect(announce).toHaveBeenCalledWith(m.player_muted(), "assertive");
  });

  it("unmutes back to the remembered level", async () => {
    playingAt(0);
    $muteState.set({ muted: true, savedVolume: 0.6, restoring: false });
    await toggleMute(announce);
    expect(tauri.setVolume).toHaveBeenCalledWith(0.6);
    expect($muteState.get()).toEqual({ muted: false, savedVolume: 0.6, restoring: false });
    expect(announce).toHaveBeenCalledWith(m.player_unmuted(), "assertive");
  });

  it("does nothing on a stopped player", async () => {
    $playerStatus.set({ state: "stopped", source: null, volume: 0, positionMs: null, durationMs: null });
    await toggleMute(announce);
    expect(tauri.setVolume).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });
});

describe("toggleMute — the zero-level path", () => {
  it("RAISES the sound instead of confirming silence to an already-silent player", async () => {
    rememberVolumeLevel(0.6); // level memory fed by the level change itself
    playingAt(0);             // …which then reached zero (slider drag or Ctrl+Alt+Down)
    await toggleMute(announce);
    expect(tauri.setVolume).toHaveBeenCalledWith(0.6);
    expect(tauri.setVolume).not.toHaveBeenCalledWith(0);
    expect(announce).toHaveBeenCalledWith(m.player_unmuted(), "assertive");
    expect(announce).not.toHaveBeenCalledWith(m.player_muted(), "assertive");
    expect($muteState.get().muted).toBe(false);
  });

  it("says 'sound on' only after the sound is actually back", async () => {
    let resolveSetVolume!: () => void;
    vi.mocked(tauri.setVolume).mockReturnValueOnce(new Promise<void>((r) => { resolveSetVolume = r; }));
    rememberVolumeLevel(0.6);
    playingAt(0);
    const done = toggleMute(announce);
    expect(announce).not.toHaveBeenCalled();
    resolveSetVolume();
    await done;
    expect(announce).toHaveBeenCalledWith(m.player_unmuted(), "assertive");
  });

  it("falls back to FALLBACK_VOLUME on a cold start with a zero level in the profile", async () => {
    // $muteState does not survive a restart, so the level memory is its seed.
    playingAt(0);
    await toggleMute(announce);
    expect(tauri.setVolume).toHaveBeenCalledWith(FALLBACK_VOLUME);
    expect(announce).toHaveBeenCalledWith(m.player_unmuted(), "assertive");
  });

  it("takes two presses to go silent → audible → silent again", async () => {
    rememberVolumeLevel(0.6);
    playingAt(0);
    await toggleMute(announce);
    expect(tauri.setVolume).toHaveBeenLastCalledWith(0.6);
    playingAt(0.6); // the status event the backend answers with
    await toggleMute(announce);
    expect(tauri.setVolume).toHaveBeenLastCalledWith(0);
    expect($muteState.get()).toEqual({ muted: true, savedVolume: 0.6, restoring: false });
  });

  it("silences again on a second press that beats the status event back", async () => {
    // No playingAt() between the presses: the `player-status` carrying the new
    // level has not arrived yet. Reading a stale zero here would raise the
    // volume a second time and answer "sound on" to an audible player.
    rememberVolumeLevel(0.6);
    playingAt(0);
    await toggleMute(announce);
    await toggleMute(announce);
    expect(tauri.setVolume).toHaveBeenLastCalledWith(0);
    expect($muteState.get().muted).toBe(true);
    expect(announce).toHaveBeenLastCalledWith(m.player_muted(), "assertive");
  });

  it("announces a playback error when the IPC rejects, leaving the state alone", async () => {
    vi.mocked(tauri.setVolume).mockRejectedValueOnce(new Error("ipc down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    rememberVolumeLevel(0.6);
    playingAt(0);
    await toggleMute(announce);
    expect(announce).toHaveBeenCalledWith(m.playback_error(), "assertive");
    expect($muteState.get()).toEqual({ muted: false, savedVolume: 0.6, restoring: false });
  });
});
