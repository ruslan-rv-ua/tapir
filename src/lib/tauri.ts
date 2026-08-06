import { invoke } from "@tauri-apps/api/core";
import type { Song } from "../types/song";
import type { LogLevel } from "./logLevel";

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
  sessionId: number; // стабільний id сесії запису; reconnect його не змінює
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
  skipFirstIncompleteTrack: boolean;
  skipShortTracksMs: number;
  autoCorrectCase: boolean;
  schedulePadBeforeMin: number; // 0–30, запас перед стартом планового запису
  schedulePadAfterMin: number;  // 0–60, запас після кінця
  reconnect: ReconnectConfig;
}

export interface HotkeyMap {
  toggleRecording: string;
  togglePlayback: string;
  volumeUp: string;
  volumeDown: string;
  toggleWindow: string;
  stopAll: string;
  prevTrack: string;
  nextTrack: string;
}

export interface GlobalSettings {
  language: string;
  theme: "auto" | "dark" | "light";
  activeProfile: string;
  outputDevice: string | null;
  minimizeToTray: boolean;
  showTrayNotifications: boolean;
  showTrackInTitle: boolean;
  diskSpaceThresholdGb: number;
  doubleClickAction: "record" | "play";
  sortBy: "name" | "added";
  bandwidthLimitKbps: number;
  autostart: boolean;
  autostartMinimized: boolean;
  autoAdvance: boolean;
  prevRestartThresholdMs: number;
  resumeFileFrom: "position" | "start";
  volumeStepPercent: number;
  smtcEnabled: boolean;
  hotkeys: HotkeyMap;
  logRotation: boolean;
  logMaxSizeMb: number;
  logLevel: LogLevel;
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

/** Verdict of a single interactive probe (`probe_stream`). `bitrate`/`format`
 *  are fed back into `addStream` so a colliding name gets an informative
 *  suffix (`Radio X (AAC 64k)`) instead of a bare ordinal. */
export interface ProbeVerdict {
  ok: boolean;
  error: string | null;
  bitrate: number | null;
  format: "mp3" | "aac" | null;
}

/** What the stream is known to be at add time — drives the name suffix. */
export type StreamMeta = { bitrate: number | null; format: "mp3" | "aac" | null };

/** Warnings (never bans) the add/edit dialog raises before saving. */
export interface StreamConflicts {
  /** Name of the stream already holding this URL. */
  duplicateUrlOf: string | null;
  /** Name of the stream whose recording folder this name would share. */
  nameCollidesWith: string | null;
}

// --- Typed invoke wrappers ---

export async function getStreams(): Promise<StreamInfo[]> {
  return invoke("get_streams");
}
export async function addStream(url: string, name?: string, meta?: StreamMeta): Promise<StreamInfo> {
  return invoke("add_stream", {
    url,
    name,
    bitrate: meta?.bitrate ?? null,
    format: meta?.format ?? null,
  });
}
/** Pre-flight for the add/edit dialog: pass `url` when adding, `name` +
 *  `excludeId` when renaming. Both results are warnings, not refusals. */
export async function checkStreamConflicts(args: {
  url?: string;
  name?: string;
  excludeId?: string;
}): Promise<StreamConflicts> {
  return invoke("check_stream_conflicts", {
    url: args.url ?? null,
    name: args.name ?? null,
    excludeId: args.excludeId ?? null,
  });
}
/** Reachability check for a single URL (5s budget backend-side). Never rejects
 *  on an unreachable stream — the failure comes back as `{ ok: false, error }`. */
export async function probeStream(url: string): Promise<ProbeVerdict> {
  return invoke("probe_stream", { url });
}
export async function removeStream(streamId: string): Promise<void> {
  return invoke("remove_stream", { streamId });
}
export async function removeStreams(streamIds: string[]): Promise<number> {
  return invoke("remove_streams", { streamIds });
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
export async function stopAllRecordings(ids?: string[]): Promise<number> {
  return invoke("stop_all_recordings", { streamIds: ids ?? null });
}
export async function startAllRecordings(ids?: string[]): Promise<number> {
  return invoke("start_all_recordings", { streamIds: ids ?? null });
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
export async function syncAutostart(enabled: boolean, minimized: boolean): Promise<void> {
  return invoke("sync_autostart", { enabled, minimized });
}
export async function getFreeSpace(): Promise<number> {
  return invoke("get_free_space");
}

// ── Player types ──────────────────────────────────────────────────────────

export type PlaybackState = "stopped" | "playing" | "paused";

export type PlaybackSource =
  | { type: "stream"; streamId: string }
  | { type: "file"; path: string }
  | { type: "preview"; url: string; name: string };

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

export interface PlayerEndedPayload {
  path: string;
}

export interface PlaybackAnnounce {
  kind: "connecting" | "unavailable" | "error" | "resuming";
  name: string | null;
  positionMs: number | null;
}

export interface AudioDevice {
  name: string;
  isDefault: boolean;
}

// ── Player IPC wrappers ────────────────────────────────────────────────────

export async function playStream(streamId: string): Promise<void> {
  return invoke("play_stream", { streamId });
}
export async function previewStation(url: string, name: string): Promise<void> {
  return invoke("preview_station", { url, name });
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

/**
 * Backend `cli-feedback` event (Phase 3G). Mirrors the Rust `CliFeedback` enum
 * (#[serde(tag = "kind", rename_all = "kebab-case")]). Localized on the frontend.
 */
export type CliFeedbackPayload =
  | { kind: "wishlist-added"; pattern: string }
  | { kind: "wishlist-removed"; pattern: string }
  | { kind: "stream-not-found"; needle: string }
  | { kind: "invalid-url"; needle: string }
  | { kind: "flag-ignored-forwarded"; flag: string }
  | { kind: "action-failed"; action: string }
  | { kind: "invalid-args" };

/**
 * Backend `crash-resume` event (Phase 3K): підсумок тихого авто-resume
 * після аварійного завершення. Порожній снапшот → події немає (тиша).
 */
export interface CrashResumeSummary {
  resumed: number;
  total: number;
}

/**
 * Backend `browser-station-probe-result` event: підсумок фонової перевірки
 * потоків, доданих зі Stream Browser. Емітиться ЛИШЕ коли `failed` непорожній —
 * повністю успішний батч не породжує події (тиша для NVDA).
 */
export interface BrowserProbeSummary {
  /** Скільки потоків перевірено (увесь батч, не лише невдачі). */
  checked: number;
  /** Назви потоків, що не відповіли. */
  failed: string[];
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
export async function removeFromWishlistBulk(patterns: string[]): Promise<number> {
  return invoke("remove_from_wishlist_bulk", { patterns });
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
export async function removeFromIgnorelistBulk(patterns: string[]): Promise<number> {
  return invoke("remove_from_ignorelist_bulk", { patterns });
}
export async function updateIgnorelistPattern(oldPattern: string, newPattern: string): Promise<void> {
  return invoke("update_ignorelist_pattern", { oldPattern, newPattern });
}

// ── Settings IPC wrappers ─────────────────────────────────────────────────

export async function getRecordingSettings(): Promise<RecordingSettings> {
  return invoke("get_recording_settings");
}

export async function saveRecordingSettings(recording: RecordingSettings): Promise<void> {
  return invoke("save_recording_settings", { recording });
}

// --- Scheduler (Phase 3D) ---

export async function getSchedules(): Promise<ScheduleDto[]> {
  return invoke("get_schedules");
}

export async function addSchedule(
  input: ScheduledRecordingInput,
): Promise<ScheduledRecording> {
  return invoke("add_schedule", { input });
}

export async function updateSchedule(
  schedule: ScheduledRecording,
): Promise<ScheduledRecording> {
  return invoke("update_schedule", { schedule });
}

export async function deleteSchedule(id: string): Promise<void> {
  return invoke("delete_schedule", { id });
}

export async function deleteSchedules(ids: string[]): Promise<number> {
  return invoke("delete_schedules", { ids });
}

export async function toggleSchedule(
  id: string,
  enabled: boolean,
): Promise<ScheduledRecording> {
  return invoke("toggle_schedule", { id, enabled });
}

/** Активні планові записи — для confirm-діалогів (§3.5). */
export async function getActiveScheduled(): Promise<ActiveScheduled[]> {
  return invoke("get_active_scheduled");
}

/** Ready-сигнал: backend стартує scheduler лише після підписки webview на події. */
export async function frontendReady(): Promise<void> {
  return invoke("frontend_ready");
}

export async function registerHotkeys(): Promise<string[]> {
  return invoke("register_hotkeys");
}

export async function defaultHotkeys(): Promise<HotkeyMap> {
  return invoke("default_hotkeys");
}

export async function openDirectoryPicker(defaultPath?: string): Promise<string | null> {
  return invoke("open_directory_picker", { defaultPath: defaultPath ?? null });
}

// ── Radio Browser types ───────────────────────────────────────────────────

export interface StationResult {
  stationuuid: string;
  name: string;
  url: string;
  urlResolved: string;
  codec: string;
  bitrate: number;
  country: string;
  countrycode: string;
  tags: string;
  language: string;
  votes: number;
  clickcount: number;
  hasExtendedInfo: boolean | null;
  homepage: string;
  lastcheckok: number;
}

export interface SearchParams {
  query?: string;
  country?: string;
  language?: string;
  codec?: string;
  minBitrate?: number;
  order?: string;
  reverse?: boolean;
  offset?: number;
  limit?: number;
}

export interface FilterItem {
  name: string;
  stationcount: number;
}

export interface BrowserFilters {
  countries: FilterItem[];
  codecs: FilterItem[];
  languages: FilterItem[];
  tags: FilterItem[];
}

// ── Radio Browser IPC wrappers ────────────────────────────────────────────

export async function searchStationsIpc(params: SearchParams): Promise<StationResult[]> {
  return invoke<StationResult[]>("search_stations", { params });
}

export async function getBrowserFilters(): Promise<BrowserFilters> {
  return invoke<BrowserFilters>("get_browser_filters");
}

export async function addStationFromBrowser(station: StationResult): Promise<void> {
  return invoke("add_station_from_browser", { station });
}

export async function addStationsFromBrowser(stations: StationResult[]): Promise<StreamInfo[]> {
  return invoke("add_stations_from_browser", { stations });
}

export async function addExampleStreams(): Promise<StreamInfo[]> {
  return invoke<StreamInfo[]>("add_example_streams");
}

// ── Songs (Phase 3C) ──────────────────────────────────────────────────────

export async function listSavedSongs(): Promise<Song[]> {
  return invoke("list_saved_songs");
}
export async function playSavedSong(path: string): Promise<void> {
  return invoke("play_saved_song", { path });
}
export async function openSongInExplorer(path: string): Promise<void> {
  return invoke("open_song_in_explorer", { path });
}
export async function renameSong(oldPath: string, newBasename: string): Promise<Song> {
  return invoke("rename_song", { oldPath, newBasename });
}
export async function updateSongTags(
  path: string, artist: string, title: string, album: string, genre: string,
): Promise<Song> {
  return invoke("update_song_tags", { path, artist, title, album, genre });
}
export async function deleteSong(path: string): Promise<void> {
  return invoke("delete_song", { path });
}
export async function deleteSongs(paths: string[]): Promise<{ deleted: string[]; skipped: string[] }> {
  return invoke("delete_songs", { paths });
}

// ── Profile types ─────────────────────────────────────────────────────────

export interface ProfileMeta {
  name: string;
  streamCount: number;
  isActive: boolean;
  /** Per-profile policy: resume last playback on next app startup. */
  autoplayOnStartup: boolean;
}

export interface ImportPreview {
  profileJson: string;
  suggestedName: string;
  streamCount: number;
  hasConflict: boolean;
}

// --- Scheduler (Phase 3D) ---

export type ScheduleType = "oneshot" | "recurring";

export type ScheduleResultStatus =
  | "completed"
  | "startedLate"
  | "missed"
  | "stoppedByUser"
  | "skippedAlreadyRecording";

export type ScheduleResultReason =
  // missed:
  | "appNotRunning"
  | "startFailed"
  | "clockChange"
  // stoppedByUser:
  | "manualStop"
  | "profileSwitch"
  | "appClosing"
  | "scheduleEdited";

export interface ScheduleResult {
  occurrence: string;       // "2026-06-12T20:00" — номінальний локальний час входження
  status: ScheduleResultStatus;
  reason: ScheduleResultReason | null;
  recordedMinutes: number;  // 0 — не стартував
  finishedAt: string;
}

export interface ScheduledRecording {
  id: string;
  streamId: string;
  name: string;
  type: ScheduleType;
  days: number[];           // recurring: 0=Пн..6=Нд; oneshot: []
  date: string | null;      // oneshot: "YYYY-MM-DD"; recurring: null
  time: string;             // "HH:MM", 24h, локальний час
  durationMinutes: number;  // 1..=1439
  enabled: boolean;
  createdAt: string;
  lastResult: ScheduleResult | null; // пише лише backend
}

export interface ScheduleDto extends ScheduledRecording {
  nextRun: string | null;   // "YYYY-MM-DDTHH:MM"; Фаза 1: завжди null
}

export interface ScheduledRecordingInput {
  streamId: string;
  name: string;
  type: ScheduleType;
  days: number[];
  date: string | null;
  time: string;
  durationMinutes: number;
  enabled: boolean;
}

/** Активний плановий запис (для confirm-діалогів §3.5). */
export interface ActiveScheduled {
  recordingId: string;
  name: string;
  streamId: string;
  /** Локальний кінець вікна "YYYY-MM-DDTHH:MM". */
  windowEnd: string;
}

/** Спільні поля payload-ів scheduled-* (§4). */
export interface ScheduledEventPayload {
  recordingId: string;
  streamId: string;
  name: string;
}

export interface ScheduledCompletedPayload extends ScheduledEventPayload {
  status: "completed" | "startedLate" | "stoppedByUser";
  recordedMinutes: number;
}

export interface ScheduledMissedPayload extends ScheduledEventPayload {
  reason: ScheduleResultReason | null;
}

export interface Profile {
  name: string;
  version: number;
  streams: StreamInfo[];
  wishlist: WishlistEntry[];
  ignorelist: string[];
  scheduledRecordings: ScheduledRecording[];
  recording: RecordingSettings;
  postprocess: {
    enabled: boolean;
    command: string;
    arguments: string;
    timeoutSecs: number;
    runOnComplete: boolean;
    runOnIncomplete: boolean;
  };
  playerSession: {
    volume: number;
    lastStreamId: string | null;
    lastFilePosition: { path: string; positionMs: number } | null;
    autoplayOnStartup: boolean;
  };
  savedTracks: unknown[];
}

export interface ProfileChangedPayload {
  profile: Profile;
}

// ── Profile IPC wrappers ──────────────────────────────────────────────────

export async function listProfiles(): Promise<ProfileMeta[]> {
  return invoke("list_profiles");
}
export async function switchProfile(name: string): Promise<Profile> {
  return invoke("switch_profile", { name });
}
export async function createProfile(name: string): Promise<ProfileMeta> {
  return invoke("create_profile", { name });
}
export async function renameProfile(oldName: string, newName: string): Promise<ProfileMeta> {
  return invoke("rename_profile", { oldName, newName });
}
export async function deleteProfile(name: string): Promise<void> {
  return invoke("delete_profile", { name });
}
export async function deleteProfiles(names: string[]): Promise<{ deleted: string[]; skippedActive: boolean }> {
  return invoke("delete_profiles", { names });
}
export async function duplicateProfile(sourceName: string, newName: string): Promise<ProfileMeta> {
  return invoke("duplicate_profile", { sourceName, newName });
}
export async function setProfileAutoplay(name: string, enabled: boolean): Promise<void> {
  return invoke("set_profile_autoplay", { name, enabled });
}
export async function exportProfile(name: string): Promise<void> {
  return invoke("export_profile", { name });
}
export async function beginImport(): Promise<ImportPreview | null> {
  return invoke("begin_import");
}
export async function commitImport(profileJson: string, name: string): Promise<ProfileMeta> {
  return invoke("commit_import", { profileJson, name });
}
export async function copyStreamToProfile(streamId: string, targetProfile: string): Promise<void> {
  return invoke("transfer_stream_to_profile", { streamId, targetProfile, mode: "copy" });
}
export async function moveStreamToProfile(streamId: string, targetProfile: string): Promise<void> {
  return invoke("transfer_stream_to_profile", { streamId, targetProfile, mode: "move" });
}

export interface BulkTransferResult {
  transferred: string[];
  skippedRecording: number;
  skippedConflict: number;
}

export async function copyStreamsToProfile(streamIds: string[], targetProfile: string): Promise<BulkTransferResult> {
  return invoke("transfer_streams_to_profile", { streamIds, targetProfile, mode: "copy" });
}

export async function moveStreamsToProfile(streamIds: string[], targetProfile: string): Promise<BulkTransferResult> {
  return invoke("transfer_streams_to_profile", { streamIds, targetProfile, mode: "move" });
}

// ── Stream import/export (Phase 3J) ───────────────────────────────────────

export interface ImportCandidate {
  url: string;
  name: string;
  alreadyInProfile: boolean;
}

export interface ImportProgressPayload {
  url: string;
  status: "checking" | "ok" | "error";
  icyName: string | null;
  bitrate: number | null;
  format: "mp3" | "aac" | null;
  error: string | null;
}

export interface StreamImportResult {
  added: number;
  skipped: number;
}

/** `null` = the user cancelled the file picker; `[]` = the file held no streams. */
export async function beginStreamImport(): Promise<ImportCandidate[] | null> {
  return invoke("begin_stream_import");
}
export async function validateImportCandidates(urls: string[]): Promise<void> {
  return invoke("validate_import_candidates", { urls });
}
export async function commitStreamImport(
  selected: ({ url: string; name: string } & Partial<StreamMeta>)[],
): Promise<StreamImportResult> {
  return invoke("commit_stream_import", { selected });
}
/** Resolves to `true` when a file was written, `false` when the save dialog was cancelled. */
export async function exportStreams(format: "m3u8" | "pls", ids?: string[]): Promise<boolean> {
  return invoke("export_streams", { format, streamIds: ids ?? null });
}
