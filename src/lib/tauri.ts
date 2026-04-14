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
