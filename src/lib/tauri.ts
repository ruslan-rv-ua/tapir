import { invoke } from "@tauri-apps/api/core";

// --- Types matching Rust structs (camelCase, as serialized) ---

export interface StreamInfo {
  id: string;
  url: string;
  name: string;
  format: "mp3" | "aac" | null;
  bitrate: number | null;
  icyName: string | null;
  icyGenre: string | null;
  icyUrl: string | null;
  ignorelist: string[];
  username: string | null;
  password: string | null;
  addedAt: string;
}

export type StreamState = "idle" | "connecting" | "recording" | "reconnecting" | "stopped" | "error";

export interface TrackInfo {
  artist: string;
  title: string;
  album: string;
  startedAt: string;
}

export interface StreamStatus {
  streamId: string;
  state: StreamState;
  currentTrack: TrackInfo | null;
  recordingStartedAt: string | null;
  bytesRecorded: number;
  tracksRecorded: number;
  error: string | null;
  reconnectAttempt: number | null;
}

export interface ReconnectConfig {
  maxRetries: number;
  retryIntervalSecs: number;
  backoffMultiplier: number;
  maxIntervalSecs: number;
}

export interface RecordingSettings {
  outputDir: string;
  fileNameTemplate: string;
  incompleteFileNameTemplate: string;
  streamFileNameTemplate: string;
  saveStreamFile: boolean;
  deleteStreamFileOnStop: boolean;
  skipFirstIncompleteTrack: boolean;
  skipShortTracksMs: number;
  autoCorrectCase: boolean;
  reconnect: ReconnectConfig;
}

export interface GlobalSettings {
  language: string;
  theme: string;
  activeProfile: string;
  windowWidth: number;
  windowHeight: number;
  windowMaximized: boolean;
  diskSpaceThresholdGb: number;
  logMaxSizeMb: number;
  bandwidthLimitKbps: number | null;
}

// --- IPC event payload types ---

export interface RecordingStatusPayload {
  streamId: string;
  status: StreamState;
  error?: string;
}

export interface TrackChangedPayload {
  streamId: string;
  artist: string;
  title: string;
  album: string;
}

export interface StreamErrorPayload {
  streamId: string;
  message: string;
  willRetry: boolean;
}

export interface RecordingStartedPayload {
  streamId: string;
  fileName: string;
}

export interface RecordingCompletedPayload {
  streamId: string;
  fileName: string;
  durationMs: number;
}

// --- Typed invoke wrappers ---

export async function getStreams(): Promise<StreamInfo[]> {
  return invoke("get_streams");
}
export async function addStream(url: string, name?: string): Promise<StreamInfo> {
  return invoke("add_stream", { url, name });
}
export async function removeStream(streamId: string): Promise<void> {
  return invoke("remove_stream", { streamId });
}
export async function updateStream(streamId: string, name: string): Promise<StreamInfo> {
  return invoke("update_stream", { streamId, name });
}
export async function startRecording(streamId: string): Promise<void> {
  return invoke("start_recording", { streamId });
}
export async function stopRecording(streamId: string): Promise<void> {
  return invoke("stop_recording", { streamId });
}
export async function stopAllRecordings(): Promise<void> {
  return invoke("stop_all_recordings");
}
export async function getStreamStatus(streamId: string): Promise<StreamStatus> {
  return invoke("get_stream_status", { streamId });
}
export async function getAllStatuses(): Promise<StreamStatus[]> {
  return invoke("get_all_statuses");
}
export async function getSettings(): Promise<GlobalSettings> {
  return invoke("get_settings");
}
export async function saveSettings(settings: GlobalSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

// ── Player types ──────────────────────────────────────────────────────────

export type PlaybackState = "stopped" | "playing" | "paused";

export type PlaybackSource =
  | { type: "stream"; streamId: string }
  | { type: "file"; path: string };

export interface PlayerStatus {
  state: PlaybackState;
  source: PlaybackSource | null;
  volume: number;        // 0.0–1.0
  positionMs: number | null;
  durationMs: number | null;
}

export interface PlayerProgressPayload {
  positionMs: number;
  durationMs: number;
}

export interface AudioDevice {
  name: string;
  isDefault: boolean;
}

// ── Player IPC wrappers ────────────────────────────────────────────────────

export async function playStream(streamId: string): Promise<void> {
  return invoke("play_stream", { streamId });
}
export async function playFile(path: string): Promise<void> {
  return invoke("play_file", { path });
}
export async function pausePlayback(): Promise<void> {
  return invoke("pause_playback");
}
export async function resumePlayback(): Promise<void> {
  return invoke("resume_playback");
}
export async function stopPlayback(): Promise<void> {
  return invoke("stop_playback");
}
export async function seekPlayback(positionMs: number): Promise<void> {
  return invoke("seek_playback", { positionMs });
}
export async function setVolume(volume: number): Promise<void> {
  return invoke("set_volume", { volume });
}
export async function getPlayerStatus(): Promise<PlayerStatus> {
  return invoke("get_player_status");
}
export async function listOutputDevices(): Promise<AudioDevice[]> {
  return invoke("list_output_devices");
}
export async function setOutputDevice(name: string | null): Promise<void> {
  return invoke("set_output_device", { name });
}

// ── Wishlist/Ignorelist types ─────────────────────────────────────────────

export interface WishlistEntry {
  pattern: string;
  minBitrate: number | null;
  format: "mp3" | "aac" | null;
  removeAfterRecord: boolean;
  addToIgnorelistAfterRecord: boolean;
  addedAt: string;
}

export interface WishlistMatchPayload {
  streamId: string;
  artist: string;
  title: string;
  pattern: string;
}

export interface TrackIgnoredPayload {
  streamId: string;
  artist: string;
  title: string;
  pattern: string;
}

// ── Wishlist/Ignorelist IPC wrappers ──────────────────────────────────────

export async function getWishlist(): Promise<WishlistEntry[]> {
  return invoke("get_wishlist");
}
export async function addToWishlist(pattern: string): Promise<WishlistEntry> {
  return invoke("add_to_wishlist", { pattern });
}
export async function removeFromWishlist(pattern: string): Promise<void> {
  return invoke("remove_from_wishlist", { pattern });
}
export async function updateWishlistPattern(oldPattern: string, newPattern: string): Promise<WishlistEntry> {
  return invoke("update_wishlist_pattern", { oldPattern, newPattern });
}
export async function getIgnorelist(): Promise<string[]> {
  return invoke("get_ignorelist");
}
export async function addToIgnorelist(pattern: string): Promise<void> {
  return invoke("add_to_ignorelist", { pattern });
}
export async function removeFromIgnorelist(pattern: string): Promise<void> {
  return invoke("remove_from_ignorelist", { pattern });
}
export async function updateIgnorelistPattern(oldPattern: string, newPattern: string): Promise<void> {
  return invoke("update_ignorelist_pattern", { oldPattern, newPattern });
}
