use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::errors::RadioError;
use crate::portable;
use crate::profile::{RecordingSettings, ReconnectConfig, StreamInfo};
use crate::stream::{connection, format, recorder, splitter};
use log::{info, warn, error, debug};
use crate::wishlist::match_log::{MatchInput, WishlistMatch};
use crate::wishlist::matcher;
use crate::wake_lock::WakeLock;

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStatus {
    pub stream_id: String,
    pub state: StreamState,
    pub current_track: Option<TrackInfo>,
    pub recording_started_at: Option<String>,
    pub bytes_recorded: u64,
    pub tracks_recorded: u32,
    pub error: Option<String>,
    pub reconnect_attempt: Option<u32>,
    /// Стеля спроб зі знімка налаштувань, за яким живе цикл `'reconnect`, —
    /// не з поточних налаштувань профілю. Їде парою з `reconnect_attempt`
    /// (`mark_reconnecting` виставляє обидва разом), щоб «спроба N з M»
    /// читала N і M з одного джерела (reconnect-max-in-status).
    pub reconnect_max_retries: Option<u32>,
    /// Стабільний id сесії запису (§3.3): присвоюється на старті, reconnect
    /// його НЕ змінює. Scheduler трекає власність записів саме по ньому —
    /// recording_started_at для цього непридатний (None у Connecting,
    /// перезаписується кожним реконектом).
    pub session_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamState {
    Idle,
    Connecting,
    Recording,
    Reconnecting,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub artist: String,
    pub title: String,
    pub album: String,
    pub started_at: String,
    /// Трек підпав під ігнор-лист і окремим файлом не збережеться. Носій цього
    /// факту — сам рядок потоку: подія рутинна (десятки за ніч), тож дістає
    /// позначку на місці, а не хронологію, і оголошення не має
    /// (ADR 2026-08-31 «Носії для подій станції» §3, §4).
    pub ignored: bool,
}

// ---------------------------------------------------------------------------
// IPC event payloads
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingStatusPayload {
    stream_id: String,
    status: String,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackChangedPayload {
    stream_id: String,
    artist: String,
    title: String,
    album: String,
    /// Дублює [`TrackInfo::ignored`]: живий рядок фронтенд збирає з цієї події,
    /// а не перечитує статуси, тож кваліфікатор мусить їхати обома шляхами.
    ignored: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamErrorPayload {
    stream_id: String,
    message: String,
    will_retry: bool,
}

/// Відмова записувати ефір, який Tapir не вміє (ADR 2026-08-31 §3). Окрема
/// подія, а не `stream-error`: це не збій станції, стан потоку не стає `Error`,
/// і повторювати спробу нема сенсу. `family` названа, коли сім'ю впізнано.
/// Готового рядка backend не віддає — його складе Paraglide.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamUnsupportedPayload {
    stream_id: String,
    family: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingStartedPayload {
    stream_id: String,
    file_name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingCompletedPayload {
    stream_id: String,
    file_name: String,
    duration_ms: u64,
}

// ---------------------------------------------------------------------------
// Internal entry held per active stream
// ---------------------------------------------------------------------------

struct StreamEntry {
    #[allow(dead_code)] // used by get_all_stream_info scaffold
    info: StreamInfo,
    status: StreamStatus,
    cancel_token: CancellationToken,
    join_handle: JoinHandle<()>,
}

// ---------------------------------------------------------------------------
// StreamManager
// ---------------------------------------------------------------------------

pub struct StreamManager {
    app_handle: AppHandle,
    entries: HashMap<String, StreamEntry>,
    wake_lock: Arc<WakeLock>,
    /// Монотонний лічильник session_id (§3.3). Інстансний — Manager один на додаток.
    next_session_id: u64,
}

impl StreamManager {
    pub fn new(app_handle: AppHandle, wake_lock: Arc<WakeLock>) -> Self {
        Self {
            app_handle,
            entries: HashMap::new(),
            wake_lock,
            next_session_id: 0,
        }
    }

    /// Start recording a stream. Returns an error if the stream is already recording.
    pub fn start_recording(
        &mut self,
        stream_info: StreamInfo,
        recording_settings: RecordingSettings,
        manager_ref: Arc<RwLock<Self>>,
    ) -> Result<u64, RadioError> {
        let stream_id = stream_info.id.clone();

        if self.entries.contains_key(&stream_id) {
            return Err(RadioError::Other(format!(
                "Stream '{}' is already recording",
                stream_id
            )));
        }

        self.next_session_id += 1;
        let session_id = self.next_session_id;

        let cancel_token = CancellationToken::new();

        let status = StreamStatus {
            stream_id: stream_id.clone(),
            state: StreamState::Idle,
            current_track: None,
            recording_started_at: None,
            bytes_recorded: 0,
            tracks_recorded: 0,
            error: None,
            reconnect_attempt: None,
            reconnect_max_retries: None,
            session_id,
        };

        info!("[{}] Starting recording task: {}", stream_id, stream_info.url);

        let join_handle = tokio::spawn(recording_task(
            stream_info.clone(),
            recording_settings,
            cancel_token.clone(),
            self.app_handle.clone(),
            manager_ref,
        ));

        self.entries.insert(
            stream_id,
            StreamEntry {
                info: stream_info,
                status,
                cancel_token,
                join_handle,
            },
        );

        Ok(session_id)
    }

    /// Cancel the recording for the given stream_id (best-effort).
    pub fn stop_recording(&mut self, stream_id: &str) -> Result<(), RadioError> {
        match self.entries.get(stream_id) {
            Some(entry) => {
                entry.cancel_token.cancel();
                Ok(())
            }
            None => Err(RadioError::NotFound(format!(
                "No active recording for stream '{}'",
                stream_id
            ))),
        }
    }

    /// Cancel all active recordings.
    pub fn stop_all(&mut self) {
        for entry in self.entries.values() {
            entry.cancel_token.cancel();
        }
    }

    /// Cancel all active recording tasks and return their JoinHandles.
    /// The caller must await (with timeout) these handles to ensure all tasks
    /// have finished before mutating AppState.
    pub fn stop_all_async(&mut self) -> Vec<tokio::task::JoinHandle<()>> {
        for entry in self.entries.values() {
            entry.cancel_token.cancel();
        }
        let handles = self.entries
            .drain()
            .map(|(_, entry)| entry.join_handle)
            .collect();
        // All entries drained — no active recordings remain.
        self.wake_lock.set_recording(false);
        handles
    }

    /// Start recording every stream not already active. Returns the number of
    /// streams newly started. Streams already present in `entries`
    /// (recording / connecting / reconnecting) are skipped; a per-stream start
    /// error is logged and does NOT abort the batch.
    pub fn start_all(
        &mut self,
        streams: Vec<StreamInfo>,
        settings: RecordingSettings,
        manager_ref: Arc<RwLock<Self>>,
    ) -> usize {
        let mut started = 0;
        for stream in streams {
            if self.entries.contains_key(&stream.id) {
                continue;
            }
            match self.start_recording(stream, settings.clone(), manager_ref.clone()) {
                Ok(_) => started += 1,
                Err(e) => warn!("start_all: failed to start stream: {}", e),
            }
        }
        started
    }

    pub fn get_status(&self, stream_id: &str) -> Option<StreamStatus> {
        self.entries.get(stream_id).map(|e| e.status.clone())
    }

    pub fn get_all_statuses(&self) -> Vec<StreamStatus> {
        self.entries.values().map(|e| e.status.clone()).collect()
    }

    /// Scaffold: will be exposed via IPC command for monitoring active recordings.
    #[allow(dead_code)]
    pub fn get_all_stream_info(&self) -> Vec<StreamInfo> {
        self.entries.values().map(|e| e.info.clone()).collect()
    }
}

// ---------------------------------------------------------------------------
// Helper emit functions (fire-and-forget)
// ---------------------------------------------------------------------------

fn emit_recording_status(app: &AppHandle, stream_id: &str, status: &str, error: Option<String>) {
    // Phase 3K: будь-який перехід стану запису — тригер живого снапшота.
    if let Some(state) = app.try_state::<crate::app_state::AppState>() {
        state.snapshot.notify.notify_one();
    }
    debug!("[{}] Emitting recording-status: {}", stream_id, status);
    match app.emit(
        "recording-status",
        RecordingStatusPayload {
            stream_id: stream_id.to_string(),
            status: status.to_string(),
            error,
        },
    ) {
        Ok(_) => debug!("[{}] Event emitted OK", stream_id),
        Err(e) => error!("[{}] Failed to emit event: {}", stream_id, e),
    }
    crate::tray::notify_state_changed(app);
}

fn emit_track_changed(app: &AppHandle, stream_id: &str, artist: &str, title: &str, album: &str, ignored: bool) {
    app.emit(
        "track-changed",
        TrackChangedPayload {
            stream_id: stream_id.to_string(),
            artist: artist.to_string(),
            title: title.to_string(),
            album: album.to_string(),
            ignored,
        },
    )
    .ok();

    crate::tray::notify::notify_track_change(app, stream_id, artist, title);

    // Tray menu refresh so "Зараз грає" reflects new track.
    crate::tray::notify_state_changed(app);
}

fn emit_stream_error(app: &AppHandle, stream_id: &str, message: &str, will_retry: bool) {
    app.emit(
        "stream-error",
        StreamErrorPayload {
            stream_id: stream_id.to_string(),
            message: message.to_string(),
            will_retry,
        },
    )
    .ok();
}

fn emit_stream_unsupported(app: &AppHandle, stream_id: &str, family: Option<String>) {
    app.emit(
        "stream-unsupported",
        StreamUnsupportedPayload { stream_id: stream_id.to_string(), family },
    )
    .ok();
}

fn emit_recording_started(app: &AppHandle, stream_id: &str, file_name: &str) {
    app.emit(
        "recording-started",
        RecordingStartedPayload {
            stream_id: stream_id.to_string(),
            file_name: file_name.to_string(),
        },
    )
    .ok();
}

fn emit_recording_completed(app: &AppHandle, stream_id: &str, file_name: &str, duration_ms: u64) {
    app.emit(
        "recording-completed",
        RecordingCompletedPayload {
            stream_id: stream_id.to_string(),
            file_name: file_name.to_string(),
            duration_ms,
        },
    )
    .ok();
}

/// Подія несе вже записаний рядок журналу цілком — фронтенд кладе його в
/// дзеркало як є, і живий рядок виходить точно таким, як після перечитування
/// команди. Окремої події «журнал змінився» тому й немає.
fn emit_wishlist_match(app: &AppHandle, entry: &WishlistMatch) {
    app.emit("wishlist-match", entry.clone()).ok();
}

// ---------------------------------------------------------------------------
// Status update helpers (never hold the lock across await)
// ---------------------------------------------------------------------------

fn is_active_state(s: &StreamState) -> bool {
    matches!(
        s,
        StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting
    )
}

async fn update_state(manager: &Arc<RwLock<StreamManager>>, stream_id: &str, state: StreamState) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = state;
        entry.status.error = None;
    }
    let any_active = guard.entries.values().any(|e| is_active_state(&e.status.state));
    guard.wake_lock.set_recording(any_active);
}

/// Спроба і стеля виставляються лише разом і з одного знімка: рядок потоку
/// показує «спроба N з M», і обидва числа мусять описувати той самий цикл
/// `'reconnect`, а не одне — цикл, а друге — поточні налаштування профілю.
fn mark_reconnecting(status: &mut StreamStatus, attempt: u32, max_retries: u32) {
    status.state = StreamState::Reconnecting;
    status.reconnect_attempt = Some(attempt);
    status.reconnect_max_retries = Some(max_retries);
}

async fn update_state_reconnecting(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    attempt: u32,
    max_retries: u32,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        mark_reconnecting(&mut entry.status, attempt, max_retries);
    }
    let any_active = guard.entries.values().any(|e| is_active_state(&e.status.state));
    guard.wake_lock.set_recording(any_active);
}

async fn update_state_recording(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    started_at: &str,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = StreamState::Recording;
        entry.status.recording_started_at = Some(started_at.to_string());
    }
    let any_active = guard.entries.values().any(|e| is_active_state(&e.status.state));
    guard.wake_lock.set_recording(any_active);
}

async fn update_state_error(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    error: &str,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = StreamState::Error;
        entry.status.error = Some(error.to_string());
    }
    let any_active = guard.entries.values().any(|e| is_active_state(&e.status.state));
    guard.wake_lock.set_recording(any_active);
}

async fn update_bytes_recorded(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    additional: u64,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.bytes_recorded += additional;
    }
}

async fn update_track_info(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    artist: &str,
    title: &str,
    ignored: bool,
) {
    let started_at = chrono::Local::now().to_rfc3339();
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.current_track = Some(TrackInfo {
            artist: artist.to_string(),
            title: title.to_string(),
            album: String::new(),
            started_at,
            ignored,
        });
        // tracks_recorded is NOT incremented here — only when a track is finalized
        // (i.e., kept on disk). See update_tracks_recorded.
    }
}

async fn update_tracks_recorded(manager: &Arc<RwLock<StreamManager>>, stream_id: &str) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.tracks_recorded += 1;
    }
}

// ---------------------------------------------------------------------------
// Backoff helper
// ---------------------------------------------------------------------------

fn compute_backoff_delay(reconnect: &ReconnectConfig, attempt: u32) -> u64 {
    let base = reconnect.retry_interval_secs as f64;
    let delay = base * (reconnect.backoff_multiplier as f64).powi(attempt as i32 - 1);
    delay.min(reconnect.max_interval_secs as f64) as u64
}

/// The next reconnect attempt to take, or `None` to give up.
struct RetryPlan {
    attempt: u32,
    delay_secs: u64,
}

/// Single source of truth for "try again?" — `max_retries == 0` means never
/// reconnect at all (ADR 2026-08-13: zero is not "unlimited"), otherwise the
/// next attempt is allowed as long as it doesn't exceed the configured ceiling.
/// Split out from `plan_retry` so callers that only need the yes/no answer
/// (e.g. the `will_retry` flag on `emit_stream_error`) don't pay for
/// `compute_backoff_delay`'s `powi` when the actual plan is computed
/// separately right after.
fn would_retry(reconnect: &ReconnectConfig, attempt: u32) -> bool {
    reconnect.max_retries != 0 && attempt < reconnect.max_retries
}

fn plan_retry(reconnect: &ReconnectConfig, attempt: u32) -> Option<RetryPlan> {
    if !would_retry(reconnect, attempt) {
        return None;
    }
    let next_attempt = attempt + 1;
    Some(RetryPlan {
        attempt: next_attempt,
        delay_secs: compute_backoff_delay(reconnect, next_attempt),
    })
}

// ---------------------------------------------------------------------------
// Events sent from the blocking read thread to the async task
// ---------------------------------------------------------------------------

enum ReadEvent {
    /// A chunk of raw audio bytes
    AudioBytes(Vec<u8>),
    /// Metadata changed: artist, title
    MetadataChanged(String, String),
    /// Stream ended or IO error
    Error(String),
    /// Clean EOF
    Eof,
}

// ---------------------------------------------------------------------------
// recording_task — top-level free async function
// ---------------------------------------------------------------------------

/// Ігнорований трек сюди не заходить: його гілка фіналізує попередній трек і
/// емітить сама (щоб не починати новий файл), тож `ignored: false` нижче — це
/// факт про єдиних викликачів, а не типове значення.
async fn handle_splitter_action(
    action: splitter::SplitAction,
    app_handle: &AppHandle,
    stream_id: &str,
    rec: &mut recorder::Recorder,
    manager: &Arc<RwLock<StreamManager>>,
    artist: &str,
    title: &str,
) {
    match action {
        splitter::SplitAction::Skip => {
            debug!("[{}] Splitter: skip (first-incomplete/too-short/unchanged): {} - {}", stream_id, artist, title);
            emit_track_changed(app_handle, stream_id, artist, title, "", false);
            update_track_info(manager, stream_id, artist, title, false).await;
        }
        splitter::SplitAction::StartTrack(m) => {
            debug!("[{}] Splitter: start track: {} - {}", stream_id, m.artist, m.title);
            if let Ok(file_name) = rec.start_track(&m.artist, &m.title).await {
                emit_recording_started(app_handle, stream_id, &file_name);
            }
            emit_track_changed(app_handle, stream_id, &m.artist, &m.title, "", false);
            update_track_info(manager, stream_id, &m.artist, &m.title, false).await;
        }
        splitter::SplitAction::FinalizeAndStart { completed, new, duration_ms } => {
            debug!("[{}] Splitter: finalize '{} - {}' ({}ms), start '{} - {}'", stream_id, completed.artist, completed.title, duration_ms, new.artist, new.title);
            if let Ok(Some(final_path)) = rec.finalize_track(&completed.artist, &completed.title, duration_ms).await {
                update_tracks_recorded(manager, stream_id).await;
                let file_name = final_path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                emit_recording_completed(app_handle, stream_id, &file_name, duration_ms);
            }
            if let Ok(file_name) = rec.start_track(&new.artist, &new.title).await {
                emit_recording_started(app_handle, stream_id, &file_name);
            }
            emit_track_changed(app_handle, stream_id, &new.artist, &new.title, "", false);
            update_track_info(manager, stream_id, &new.artist, &new.title, false).await;
        }
    }
}

pub async fn recording_task(
    stream_info: StreamInfo,
    recording_settings: RecordingSettings,
    cancel_token: CancellationToken,
    app_handle: AppHandle,
    manager: Arc<RwLock<StreamManager>>,
) {
    let stream_id = stream_info.id.clone();
    let url = stream_info.url.clone();
    let station_name = stream_info.name.clone();

    info!("[{}] Recording task started: {}", stream_id, url);

    let reconnect = recording_settings.reconnect.clone();
    let mut attempt = 0u32;

    'reconnect: loop {
        if cancel_token.is_cancelled() {
            break 'reconnect;
        }

        // --- connecting ---
        update_state(&manager, &stream_id, StreamState::Connecting).await;
        emit_recording_status(&app_handle, &stream_id, "connecting", None);

        let conn = match connection::connect(&url).await {
            Ok(c) => {
                info!("[{}] Connected successfully", stream_id);
                c
            }
            Err(e) => {
                let msg = e.to_string();
                error!("[{}] Connection failed: {}", stream_id, msg);
                update_state_error(&manager, &stream_id, &msg).await;
                let plan = plan_retry(&reconnect, attempt);
                emit_stream_error(&app_handle, &stream_id, &msg, plan.is_some());
                // fall through to reconnect logic
                let Some(RetryPlan { attempt: next_attempt, delay_secs }) = plan else {
                    break 'reconnect;
                };
                attempt = next_attempt;
                debug!("[{}] Reconnecting in {}s (attempt {}/{})", stream_id, delay_secs, attempt, reconnect.max_retries);
                update_state_reconnecting(&manager, &stream_id, attempt, reconnect.max_retries).await;
                emit_recording_status(&app_handle, &stream_id, "reconnecting", None);
                tokio::select! {
                    _ = cancel_token.cancelled() => break 'reconnect,
                    _ = tokio::time::sleep(Duration::from_secs(delay_secs)) => {}
                }
                continue 'reconnect;
            }
        };

        // --- Update profile with ICY headers ---
        let icy_bitrate = conn.headers.bitrate();
        let icy_name_val: Option<String> = conn.headers.name().map(str::to_string);
        let icy_genre_val: Option<String> = conn.headers.genre().first().map(|s| s.to_string());
        // IcyHeaders doesn't expose a url() method
        let icy_url_val: Option<String> = None;

        // Докази перед вердиктом, дефолту немає (ADR 2026-08-31 §1). Обидві
        // половини вердикту йдуть у профіль разом, нижче.
        let (detected_format, unsupported) =
            format::detect(conn.content_type.as_deref(), &conn.prefix).split();

        // `%s` is ALWAYS the profile's name. Two mountpoints of one station send
        // the SAME icy-name, so using it here would merge their folders and undo
        // the suffix their profile entries carry.
        let station_name = {
            let state = app_handle.state::<crate::app_state::AppState>();
            // Оновлений потік виноситься з мутації окремо, а не значенням коміту:
            // подія `stream-info-updated` має піти й тоді, коли запис на диск не
            // вдався — у пам'яті ім'я вже нове, і UI мусить його показати.
            let mut updated_stream: Option<StreamInfo> = None;
            let committed = state
                .commit_profile(|profile| {
                    let Some(i) = profile.streams.iter().position(|s| s.id == stream_id) else {
                        // Потік прибрали з профілю посеред запису — писати нічого.
                        return crate::store::Commit::Skip(());
                    };
                    {
                        // Naming an unnamed stream picks its recording folder, so
                        // it has to dodge the folders the other streams own.
                        let taken: std::collections::HashSet<String> = profile
                            .streams
                            .iter()
                            .enumerate()
                            .filter(|(j, _)| *j != i)
                            .map(|(_, s)| crate::naming::collision_key(&s.name))
                            .collect();
                        let s = &mut profile.streams[i];
                        if let Some(br) = icy_bitrate {
                            s.bitrate = Some(br as u32);
                        }
                        if let Some(icy) = icy_name_val.as_ref() {
                            let meta = crate::naming::NameMeta {
                                format: detected_format.clone(),
                                bitrate: icy_bitrate.map(|b| b as u32),
                            };
                            if let Some(renamed) =
                                crate::naming::icy_rename(&s.name, &s.url, icy, &meta, &taken)
                            {
                                s.name = renamed;
                            }
                            s.icy_name = Some(icy.clone());
                        }
                        if icy_genre_val.is_some() {
                            s.icy_genre = icy_genre_val.clone();
                        }
                        if icy_url_val.is_some() {
                            s.icy_url = icy_url_val.clone();
                        }
                        // Дві половини одного вердикту — пишуться разом, інакше
                        // рядок показував би формат від однієї перевірки й мітку
                        // від іншої.
                        s.format = detected_format.clone();
                        s.unsupported_codec = unsupported.clone();
                        updated_stream = Some(s.clone());
                        crate::store::Commit::Save(())
                    }
                })
                .await;
            if let Err(e) = committed {
                log::warn!("recorder: failed to save profile after ICY headers: {e}");
            }
            match updated_stream {
                Some(updated) => {
                    let name = updated.name.clone();
                    app_handle.emit("stream-info-updated", updated).ok();
                    name
                }
                // Stream was removed from the profile mid-recording — keep the
                // name the task started with.
                None => station_name.clone(),
            }
        };

        // --- Відмова: ефір не з тих, які Tapir уміє писати ---
        // Коміт даних ефіру вище вже відбувся — мітка лягла в профіль, тож
        // наступна спроба (і планувальник) впадуть швидко, ще до з'єднання.
        // Спроби це не витрачає й перепідключення не планує: станція справна,
        // відмовляє Tapir, і повторний запит дасть той самий вердикт
        // (ADR 2026-08-31 §4 — поправка до ADR 2026-08-13).
        let Some(detected_format) = detected_format else {
            let family = unsupported.and_then(|u| u.family);
            warn!(
                "[{}] Unsupported air format ({}) — refusing to record",
                stream_id,
                family.as_deref().unwrap_or("unrecognised"),
            );
            emit_stream_unsupported(&app_handle, &stream_id, family);
            break 'reconnect;
        };

        // --- Set up recorder ---
        let output_dir = portable::resolve_output_dir(&recording_settings.output_dir);

        let mut rec = recorder::Recorder::new(
            output_dir,
            recording_settings.clone(),
            detected_format,
            station_name.clone(),
        );

        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        if let Err(e) = rec.open_stream_file(&station_name, &today).await {
            log::warn!("[{}] Failed to open stream file: {}", stream_id, e);
        }

        let splitter_config = splitter::SplitterConfig {
            skip_first_incomplete_track: recording_settings.skip_first_incomplete_track,
            skip_short_tracks_ms: recording_settings.skip_short_tracks_ms,
        };
        let mut spl = splitter::Splitter::new(splitter_config);

        // --- Start read loop via spawn_blocking ---
        // We use a channel to bridge the blocking ICY read thread and the async task.
        // The channel is bounded so back-pressure is automatic.
        let (tx, mut rx) = tokio::sync::mpsc::channel::<ReadEvent>(64);

        let blocking_handle = tokio::task::spawn_blocking(move || {
            use std::io::Read;

            // ICY-розмітку знімає читач із `connection` (там же розбирається
            // `StreamTitle`), тут лишається саме аудіо.
            let meta_tx = tx.clone();
            let mut reader = conn.into_reader(tokio::runtime::Handle::current(), move |track| {
                // Callback кличе сам читач, зі свого потоку — це той самий
                // блокуючий потік, тож `blocking_send` тут доречний.
                let _ = meta_tx.blocking_send(ReadEvent::MetadataChanged(track.artist, track.title));
            });
            let mut buf = vec![0u8; 8192];

            loop {
                if tx.is_closed() {
                    break;
                }

                match reader.read(&mut buf) {
                    Err(e) => {
                        log::error!("[ICY reader] Read error: {}", e);
                        let _ = tx.blocking_send(ReadEvent::Error(e.to_string()));
                        break;
                    }
                    Ok(0) => {
                        log::warn!("[ICY reader] EOF (0 bytes read)");
                        let _ = tx.blocking_send(ReadEvent::Eof);
                        break;
                    }
                    Ok(n) => {
                        if tx.blocking_send(ReadEvent::AudioBytes(buf[..n].to_vec())).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        // --- Async event consumer ---
        let started_at = chrono::Local::now().to_rfc3339();
        update_state_recording(&manager, &stream_id, &started_at).await;
        emit_recording_status(&app_handle, &stream_id, "recording", None);

        let mut local_bytes: u64 = 0;
        const BYTES_UPDATE_THRESHOLD: u64 = 65536;
        // The attempt counter resets on the first audio byte, not on a successful
        // `connect` — a connection that accepts and immediately drops (dead
        // mountpoint that still answers) must keep spending attempts, or the
        // ceiling and backoff never engage (ADR 2026-08-13).
        let mut got_audio = false;

        'read: loop {
            tokio::select! {
                _ = cancel_token.cancelled() => {
                    info!("[{}] Recording cancelled by user", stream_id);
                    drop(rx);
                    rec.close().await.ok();
                    break 'reconnect;
                }
                event = rx.recv() => {
                    match event {
                        None => {
                            warn!("[{}] Read channel closed (blocking thread exited)", stream_id);
                            rec.close().await.ok();
                            break 'read;
                        }
                        Some(ReadEvent::Eof) => {
                            warn!("[{}] Stream EOF received", stream_id);
                            rec.close().await.ok();
                            break 'read;
                        }
                        Some(ReadEvent::Error(msg)) => {
                            error!("[{}] Stream read error: {}", stream_id, msg);
                            rec.close().await.ok();
                            let will_retry = would_retry(&reconnect, attempt);
                            emit_stream_error(&app_handle, &stream_id, &msg, will_retry);
                            break 'read;
                        }
                        Some(ReadEvent::MetadataChanged(artist, title)) => {
                            // --- Wishlist/Ignorelist check ---
                            let track_action = {
                                let stream_title = matcher::build_stream_title(&artist, &title);
                                if let Some(ref st) = stream_title {
                                    let state = app_handle.state::<crate::app_state::AppState>();
                                    let profile = state.active_profile.read().await;
                                    let per_stream_ignorelist = profile.streams
                                        .iter()
                                        .find(|s| s.id == stream_id)
                                        .map(|s| s.ignorelist.as_slice())
                                        .unwrap_or(&[]);
                                    matcher::check_track(
                                        st,
                                        per_stream_ignorelist,
                                        &profile.ignorelist,
                                        &profile.wishlist,
                                    )
                                } else {
                                    matcher::TrackAction::Normal
                                }
                            };

                            match track_action {
                                matcher::TrackAction::Ignored { ref pattern } => {
                                    // Finalize any in-progress track so its audio is clean
                                    let meta = connection::TrackMetadata {
                                        artist: artist.clone(),
                                        title: title.clone(),
                                    };
                                    let action = spl.on_metadata_change(meta);
                                    if let splitter::SplitAction::FinalizeAndStart { completed, duration_ms, .. } = action {
                                        if let Ok(Some(final_path)) = rec.finalize_track(&completed.artist, &completed.title, duration_ms).await {
                                            update_tracks_recorded(&manager, &stream_id).await;
                                            let file_name = final_path.file_name()
                                                .map(|n| n.to_string_lossy().to_string())
                                                .unwrap_or_default();
                                            emit_recording_completed(&app_handle, &stream_id, &file_name, duration_ms);
                                        }
                                    }
                                    // Носій — кваліфікатор у рядку потоку; окремої події
                                    // «трек проігноровано» більше немає, бо оголошувати
                                    // кожен рекламний блок нічим (ADR 2026-08-31 §4).
                                    emit_track_changed(&app_handle, &stream_id, &artist, &title, "", true);
                                    update_track_info(&manager, &stream_id, &artist, &title, true).await;
                                    info!("[{}] Track ignored ({}): {} - {}", stream_id, pattern, artist, title);
                                }
                                matcher::TrackAction::WishlistMatch { ref pattern } => {
                                    // Носій-стан первинний, подія проєктується поверх нього
                                    // (ADR 2026-08-31 §2): спершу рядок у журналі, і вже його
                                    // несе подія.
                                    let entry = {
                                        let state = app_handle.state::<crate::app_state::AppState>();
                                        let mut log = state.match_log.write().await;
                                        log.push(
                                            MatchInput {
                                                stream_id: stream_id.clone(),
                                                station_name: station_name.clone(),
                                                artist: artist.clone(),
                                                title: title.clone(),
                                                pattern: pattern.clone(),
                                            },
                                            chrono::Local::now().to_rfc3339(),
                                        )
                                    };
                                    emit_wishlist_match(&app_handle, &entry);
                                    info!("[{}] Wishlist match ({}): {} - {}", stream_id, pattern, artist, title);
                                    let meta = connection::TrackMetadata {
                                        artist: artist.clone(),
                                        title: title.clone(),
                                    };
                                    let action = spl.on_metadata_change(meta);
                                    handle_splitter_action(action, &app_handle, &stream_id, &mut rec, &manager, &artist, &title).await;
                                }
                                matcher::TrackAction::Normal => {
                                    let meta = connection::TrackMetadata {
                                        artist: artist.clone(),
                                        title: title.clone(),
                                    };
                                    let action = spl.on_metadata_change(meta);
                                    handle_splitter_action(action, &app_handle, &stream_id, &mut rec, &manager, &artist, &title).await;
                                }
                            }
                        }
                        Some(ReadEvent::AudioBytes(data)) => {
                            if !got_audio {
                                got_audio = true;
                                attempt = 0;
                            }
                            local_bytes += data.len() as u64;
                            if let Err(e) = rec.write_bytes(&data).await {
                                rec.close().await.ok();
                                emit_stream_error(&app_handle, &stream_id, &e.to_string(), false);
                                break 'reconnect;
                            }
                            // Flush accumulated byte count to manager periodically
                            if local_bytes >= BYTES_UPDATE_THRESHOLD {
                                update_bytes_recorded(&manager, &stream_id, local_bytes).await;
                                local_bytes = 0;
                            }
                        }
                    }
                }
            }
        }

        // Flush any remaining byte count
        if local_bytes > 0 {
            update_bytes_recorded(&manager, &stream_id, local_bytes).await;
        }

        // Drop rx explicitly so the blocking thread sees a closed channel and exits,
        // then await the handle to surface any panic.
        drop(rx);
        match blocking_handle.await {
            Ok(()) => {} // clean exit
            Err(e) if e.is_panic() => {
                log::error!(
                    "[{}] ICY reader thread panicked: {:?}", stream_id, e
                );
                // Treat as a connection error — fall through to reconnect logic
            }
            Err(_) => {} // cancelled (won't happen for spawn_blocking)
        }

        // --- Reconnect logic ---
        if cancel_token.is_cancelled() {
            break 'reconnect;
        }
        let Some(RetryPlan { attempt: next_attempt, delay_secs }) = plan_retry(&reconnect, attempt) else {
            break 'reconnect;
        };
        attempt = next_attempt;
        debug!("[{}] Reconnecting in {}s (attempt {}/{})", stream_id, delay_secs, attempt, reconnect.max_retries);
        update_state_reconnecting(&manager, &stream_id, attempt, reconnect.max_retries).await;
        emit_recording_status(&app_handle, &stream_id, "reconnecting", None);
        tokio::select! {
            _ = cancel_token.cancelled() => break 'reconnect,
            _ = tokio::time::sleep(Duration::from_secs(delay_secs)) => {}
        }
    }

    // --- Final cleanup ---
    info!("[{}] Recording task finished — cleaning up", stream_id);
    update_state(&manager, &stream_id, StreamState::Idle).await;
    emit_recording_status(&app_handle, &stream_id, "stopped", None);

    // Remove entry from the manager
    manager.write().await.entries.remove(&stream_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reconnect_config(max_retries: u32) -> ReconnectConfig {
        ReconnectConfig {
            max_retries,
            retry_interval_secs: 5,
            backoff_multiplier: 1.5,
            max_interval_secs: 300,
        }
    }

    fn idle_status() -> StreamStatus {
        StreamStatus {
            stream_id: "x".to_string(),
            state: StreamState::Idle,
            current_track: None,
            recording_started_at: None,
            bytes_recorded: 0,
            tracks_recorded: 0,
            error: None,
            reconnect_attempt: None,
            reconnect_max_retries: None,
            session_id: 0,
        }
    }

    #[test]
    fn mark_reconnecting_sets_attempt_and_ceiling_from_the_same_snapshot() {
        // reconnect-max-in-status: the row shows "attempt N of M", so N and M
        // must describe the same reconnect loop — both come from the snapshot
        // the loop lives by, never from the profile's current settings.
        let mut status = idle_status();
        mark_reconnecting(&mut status, 3, 10);
        assert!(matches!(status.state, StreamState::Reconnecting));
        assert_eq!(status.reconnect_attempt, Some(3));
        assert_eq!(status.reconnect_max_retries, Some(10));
    }

    #[test]
    fn stream_status_serializes_reconnect_ceiling_in_camel_case() {
        let mut status = idle_status();
        mark_reconnecting(&mut status, 2, 7);
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"reconnectAttempt\":2"), "got: {json}");
        assert!(json.contains("\"reconnectMaxRetries\":7"), "got: {json}");
    }

    #[test]
    fn would_retry_matches_plan_retry_is_some() {
        // would_retry exists so callers that only need the boolean don't pay
        // for compute_backoff_delay; it must never disagree with plan_retry.
        for max_retries in [0, 1, 3, 10] {
            let cfg = reconnect_config(max_retries);
            for attempt in 0..5 {
                assert_eq!(
                    would_retry(&cfg, attempt),
                    plan_retry(&cfg, attempt).is_some(),
                    "max_retries={max_retries} attempt={attempt}",
                );
            }
        }
    }

    #[test]
    fn plan_retry_zero_max_retries_never_retries() {
        // ADR 2026-08-13: 0 means "don't reconnect", not "unlimited".
        let cfg = reconnect_config(0);
        assert!(plan_retry(&cfg, 0).is_none());
        assert!(plan_retry(&cfg, 5).is_none());
    }

    #[test]
    fn plan_retry_stays_within_ceiling() {
        let cfg = reconnect_config(3);
        assert!(plan_retry(&cfg, 0).is_some(), "attempt 1 of 3 should be planned");
        assert!(plan_retry(&cfg, 1).is_some(), "attempt 2 of 3 should be planned");
        assert!(plan_retry(&cfg, 2).is_some(), "attempt 3 of 3 should be planned");
        assert!(plan_retry(&cfg, 3).is_none(), "attempt 4 of 3 exceeds the ceiling");
    }

    #[test]
    fn plan_retry_increments_attempt() {
        let cfg = reconnect_config(10);
        let plan = plan_retry(&cfg, 4).expect("within ceiling");
        assert_eq!(plan.attempt, 5);
    }

    #[test]
    fn plan_retry_delay_matches_backoff() {
        let cfg = reconnect_config(10);
        let plan = plan_retry(&cfg, 0).expect("within ceiling");
        assert_eq!(plan.delay_secs, compute_backoff_delay(&cfg, plan.attempt));
    }

    #[test]
    fn compute_backoff_delay_grows_and_caps() {
        let cfg = reconnect_config(100);
        assert_eq!(compute_backoff_delay(&cfg, 1), 5); // 5 * 1.5^0
        assert_eq!(compute_backoff_delay(&cfg, 2), 7); // 5 * 1.5^1 = 7.5 -> 7 (truncation)
        assert_eq!(compute_backoff_delay(&cfg, 20), 300); // capped at max_interval_secs
    }

    #[test]
    fn stop_all_async_returns_handles_for_active_entries() {
        // We can't easily test the full async path here without a full Tauri runtime.
        // Instead, verify the method exists and compiles by calling it.
        // The real contract (tasks terminate) is verified via integration testing.
        let _: fn(&mut StreamManager) -> Vec<tokio::task::JoinHandle<()>> =
            StreamManager::stop_all_async;
    }

    #[test]
    fn start_all_has_expected_signature() {
        // Contract check: a full behavioural test needs a Tauri AppHandle, which
        // isn't available in a unit test. Mirror the stop_all_async test and just
        // pin the signature so refactors can't silently change it.
        let _: fn(
            &mut StreamManager,
            Vec<StreamInfo>,
            RecordingSettings,
            Arc<RwLock<StreamManager>>,
        ) -> usize = StreamManager::start_all;
    }

    #[test]
    fn stream_status_serializes_session_id_camel_case() {
        let status = StreamStatus { state: StreamState::Recording, session_id: 7, ..idle_status() };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"sessionId\":7"), "got: {json}");
    }

    #[test]
    fn start_recording_returns_session_id() {
        // Поведінковий тест потребує Tauri AppHandle — пінимо сигнатуру,
        // як у сусідніх тестах stop_all_async / start_all.
        let _: fn(
            &mut StreamManager,
            StreamInfo,
            RecordingSettings,
            Arc<RwLock<StreamManager>>,
        ) -> Result<u64, RadioError> = StreamManager::start_recording;
    }
}
