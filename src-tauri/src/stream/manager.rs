use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::errors::RadioError;
use crate::portable;
use crate::profile::{AudioFormat, RecordingSettings, ReconnectConfig, StreamInfo};
use crate::stream::{connection, format, recorder, splitter};
use log::{info, warn, error, debug};
use crate::wishlist::matcher;

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
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamErrorPayload {
    stream_id: String,
    message: String,
    will_retry: bool,
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WishlistMatchPayload {
    stream_id: String,
    artist: String,
    title: String,
    pattern: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackIgnoredPayload {
    stream_id: String,
    artist: String,
    title: String,
    pattern: String,
}

// ---------------------------------------------------------------------------
// Internal entry held per active stream
// ---------------------------------------------------------------------------

struct StreamEntry {
    #[allow(dead_code)] // used by get_all_stream_info scaffold
    info: StreamInfo,
    status: StreamStatus,
    cancel_token: CancellationToken,
    #[allow(dead_code)]
    join_handle: JoinHandle<()>,
}

// ---------------------------------------------------------------------------
// StreamManager
// ---------------------------------------------------------------------------

pub struct StreamManager {
    app_handle: AppHandle,
    entries: HashMap<String, StreamEntry>,
}

impl StreamManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            entries: HashMap::new(),
        }
    }

    /// Start recording a stream. Returns an error if the stream is already recording.
    pub fn start_recording(
        &mut self,
        stream_info: StreamInfo,
        recording_settings: RecordingSettings,
        manager_ref: Arc<RwLock<Self>>,
    ) -> Result<(), RadioError> {
        let stream_id = stream_info.id.clone();

        if self.entries.contains_key(&stream_id) {
            return Err(RadioError::Other(format!(
                "Stream '{}' is already recording",
                stream_id
            )));
        }

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

        Ok(())
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

fn emit_track_changed(app: &AppHandle, stream_id: &str, artist: &str, title: &str, album: &str) {
    app.emit(
        "track-changed",
        TrackChangedPayload {
            stream_id: stream_id.to_string(),
            artist: artist.to_string(),
            title: title.to_string(),
            album: album.to_string(),
        },
    )
    .ok();
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

fn emit_wishlist_match(app: &AppHandle, stream_id: &str, artist: &str, title: &str, pattern: &str) {
    app.emit(
        "wishlist-match",
        WishlistMatchPayload {
            stream_id: stream_id.to_string(),
            artist: artist.to_string(),
            title: title.to_string(),
            pattern: pattern.to_string(),
        },
    )
    .ok();
}

fn emit_track_ignored(app: &AppHandle, stream_id: &str, artist: &str, title: &str, pattern: &str) {
    app.emit(
        "track-ignored",
        TrackIgnoredPayload {
            stream_id: stream_id.to_string(),
            artist: artist.to_string(),
            title: title.to_string(),
            pattern: pattern.to_string(),
        },
    )
    .ok();
}

// ---------------------------------------------------------------------------
// Status update helpers (never hold the lock across await)
// ---------------------------------------------------------------------------

async fn update_state(manager: &Arc<RwLock<StreamManager>>, stream_id: &str, state: StreamState) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = state;
        entry.status.error = None;
    }
}

async fn update_state_reconnecting(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    attempt: u32,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = StreamState::Reconnecting;
        entry.status.reconnect_attempt = Some(attempt);
    }
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
) {
    let started_at = chrono::Local::now().to_rfc3339();
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.current_track = Some(TrackInfo {
            artist: artist.to_string(),
            title: title.to_string(),
            album: String::new(),
            started_at,
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

// ---------------------------------------------------------------------------
// ICY metadata parser
// ---------------------------------------------------------------------------

/// Parse `StreamTitle='...'` from ICY metadata string.
fn parse_stream_title(meta: &str) -> Option<&str> {
    let prefix = "StreamTitle='";
    let start = meta.find(prefix)? + prefix.len();
    let end = meta[start..].find('\'')?;
    let title = &meta[start..start + end];
    if title.is_empty() { None } else { Some(title) }
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
            emit_track_changed(app_handle, stream_id, artist, title, "");
            update_track_info(manager, stream_id, artist, title).await;
        }
        splitter::SplitAction::StartTrack(m) => {
            if let Ok(file_name) = rec.start_track(&m.artist, &m.title).await {
                emit_recording_started(app_handle, stream_id, &file_name);
            }
            emit_track_changed(app_handle, stream_id, &m.artist, &m.title, "");
            update_track_info(manager, stream_id, &m.artist, &m.title).await;
        }
        splitter::SplitAction::FinalizeAndStart { completed, new, duration_ms } => {
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
            emit_track_changed(app_handle, stream_id, &new.artist, &new.title, "");
            update_track_info(manager, stream_id, &new.artist, &new.title).await;
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
                // attempt will be incremented below, so use attempt + 1 to correctly
                // predict whether a retry will actually happen.
                emit_stream_error(
                    &app_handle,
                    &stream_id,
                    &msg,
                    reconnect.max_retries > 0 && (attempt + 1) <= reconnect.max_retries,
                );
                // fall through to reconnect logic
                if reconnect.max_retries == 0 {
                    break 'reconnect;
                }
                attempt += 1;
                if attempt > reconnect.max_retries {
                    break 'reconnect;
                }
                let delay = compute_backoff_delay(&reconnect, attempt);
                update_state_reconnecting(&manager, &stream_id, attempt).await;
                emit_recording_status(&app_handle, &stream_id, "reconnecting", None);
                tokio::select! {
                    _ = cancel_token.cancelled() => break 'reconnect,
                    _ = tokio::time::sleep(Duration::from_secs(delay)) => {}
                }
                continue 'reconnect;
            }
        };

        // Reset attempt counter on successful connection
        attempt = 0;

        // --- Update profile with ICY headers ---
        let icy_bitrate = conn.headers.bitrate();
        let icy_name_val: Option<String> = conn.headers.name().map(str::to_string);
        let icy_genre_val: Option<String> = conn.headers.genre().first().map(|s| s.to_string());
        // IcyHeaders doesn't expose a url() method
        let icy_url_val: Option<String> = None;

        let content_type = conn.content_type.as_deref().unwrap_or("");
        let detected_format = format::detect_from_content_type(content_type)
            .unwrap_or(AudioFormat::Mp3);

        {
            let state = app_handle.state::<crate::app_state::AppState>();
            let (updated_stream, snapshot) = {
                let mut profile = state.active_profile.write().await;
                if let Some(s) = profile.streams.iter_mut().find(|s| s.id == stream_id) {
                    if let Some(br) = icy_bitrate {
                        s.bitrate = Some(br as u32);
                    }
                    if icy_name_val.is_some() {
                        let name = icy_name_val.as_ref().unwrap();
                        if s.name == s.url {
                            s.name = name.clone();
                        }
                        s.icy_name = icy_name_val.clone();
                    }
                    if icy_genre_val.is_some() {
                        s.icy_genre = icy_genre_val.clone();
                    }
                    if icy_url_val.is_some() {
                        s.icy_url = icy_url_val.clone();
                    }
                    s.format = Some(detected_format.clone());
                    (Some(s.clone()), Some(profile.clone()))
                } else {
                    (None, None)
                }
            };
            if let (Some(updated), Some(snap)) = (updated_stream, snapshot) {
                let _ = tokio::task::spawn_blocking(move || -> Result<(), crate::errors::RadioError> { snap.save() }).await;
                app_handle.emit("stream-info-updated", updated).ok();
            }
        }

        // Use ICY name for recording paths if discovered
        let station_name = icy_name_val.unwrap_or_else(|| station_name.clone());

        // --- Set up recorder ---
        let output_dir = portable::recordings_dir();

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

        let metaint: Option<NonZeroUsize> = conn.headers.metadata_interval();
        // Move the reqwest Response into the blocking thread.
        // reqwest::Response is not Send+Sync directly in all configurations; however
        // since we are on tokio and reqwest uses tokio internally, the response is Send.
        let response = conn.response;

        let blocking_handle = tokio::task::spawn_blocking(move || {
            use std::io::Read;

            // Build a synchronous adapter that drives the reqwest bytes_stream
            let rt = tokio::runtime::Handle::current();

            struct ReqwestSyncReader {
                stream: futures_util::stream::BoxStream<'static, Result<bytes::Bytes, reqwest::Error>>,
                buf: bytes::Bytes,
                rt: tokio::runtime::Handle,
            }

            impl Read for ReqwestSyncReader {
                fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
                    // Drain our internal buffer first
                    if !self.buf.is_empty() {
                        let n = out.len().min(self.buf.len());
                        out[..n].copy_from_slice(&self.buf[..n]);
                        self.buf = self.buf.slice(n..);
                        return Ok(n);
                    }
                    // Poll next chunk from the async stream
                    let chunk = self.rt.block_on(async {
                        use futures_util::StreamExt;
                        self.stream.next().await
                    });
                    match chunk {
                        None => Ok(0), // EOF
                        Some(Err(e)) => Err(std::io::Error::new(std::io::ErrorKind::Other, e)),
                        Some(Ok(bytes)) => {
                            let n = out.len().min(bytes.len());
                            out[..n].copy_from_slice(&bytes[..n]);
                            self.buf = bytes.slice(n..);
                            Ok(n)
                        }
                    }
                }
            }

            let stream_box: futures_util::stream::BoxStream<'static, Result<bytes::Bytes, reqwest::Error>> =
                Box::pin(response.bytes_stream());

            let mut reader = ReqwestSyncReader {
                stream: stream_box,
                buf: bytes::Bytes::new(),
                rt,
            };

            let metaint_val = metaint.map(|m| m.get()).unwrap_or(0);
            let mut bytes_until_meta = metaint_val;
            let mut buf = vec![0u8; 8192];

            loop {
                if tx.is_closed() {
                    break;
                }

                if metaint_val > 0 && bytes_until_meta == 0 {
                    // --- Read ICY metadata block ---
                    let mut len_byte = [0u8; 1];
                    if let Err(e) = reader.read_exact(&mut len_byte) {
                        log::error!("[ICY reader] Failed to read metadata length: {}", e);
                        let _ = tx.blocking_send(ReadEvent::Error(e.to_string()));
                        break;
                    }
                    let meta_len = len_byte[0] as usize * 16;
                    if meta_len > 0 {
                        let mut meta_buf = vec![0u8; meta_len];
                        if let Err(e) = reader.read_exact(&mut meta_buf) {
                            log::error!("[ICY reader] Failed to read metadata: {}", e);
                            let _ = tx.blocking_send(ReadEvent::Error(e.to_string()));
                            break;
                        }
                        // Parse StreamTitle from metadata
                        let meta_str = String::from_utf8_lossy(&meta_buf);
                        let meta_str = meta_str.trim_end_matches('\0');
                        if let Some(title_str) = parse_stream_title(meta_str) {
                            let (artist, title) = if let Some(pos) = title_str.find(" - ") {
                                (
                                    title_str[..pos].trim().to_string(),
                                    title_str[pos + 3..].trim().to_string(),
                                )
                            } else {
                                (String::new(), title_str.trim().to_string())
                            };
                            if tx.blocking_send(ReadEvent::MetadataChanged(artist, title)).is_err() {
                                break;
                            }
                        }
                    }
                    bytes_until_meta = metaint_val;
                }

                // --- Read audio data ---
                let max_read = if metaint_val > 0 {
                    buf.len().min(bytes_until_meta)
                } else {
                    buf.len()
                };

                match reader.read(&mut buf[..max_read]) {
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
                        if metaint_val > 0 {
                            bytes_until_meta -= n;
                        }
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
                            // attempt will be incremented after the 'read loop, so use
                            // attempt + 1 to correctly predict whether a retry will occur.
                            let will_retry = reconnect.max_retries > 0
                                && (attempt + 1) <= reconnect.max_retries;
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
                                    emit_track_changed(&app_handle, &stream_id, &artist, &title, "");
                                    update_track_info(&manager, &stream_id, &artist, &title).await;
                                    emit_track_ignored(&app_handle, &stream_id, &artist, &title, pattern);
                                    info!("[{}] Track ignored ({}): {} - {}", stream_id, pattern, artist, title);
                                }
                                matcher::TrackAction::WishlistMatch { ref pattern } => {
                                    emit_wishlist_match(&app_handle, &stream_id, &artist, &title, pattern);
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
        if reconnect.max_retries == 0 {
            break 'reconnect;
        }
        attempt += 1;
        if attempt > reconnect.max_retries {
            break 'reconnect;
        }
        let delay = compute_backoff_delay(&reconnect, attempt);
        update_state_reconnecting(&manager, &stream_id, attempt).await;
        emit_recording_status(&app_handle, &stream_id, "reconnecting", None);
        tokio::select! {
            _ = cancel_token.cancelled() => break 'reconnect,
            _ = tokio::time::sleep(Duration::from_secs(delay)) => {}
        }
    }

    // --- Final cleanup ---
    info!("[{}] Recording task finished — cleaning up", stream_id);
    update_state(&manager, &stream_id, StreamState::Idle).await;
    emit_recording_status(&app_handle, &stream_id, "stopped", None);

    // Remove entry from the manager
    manager.write().await.entries.remove(&stream_id);
}
