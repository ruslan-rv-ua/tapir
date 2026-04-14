use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::errors::RadioError;
use crate::portable;
use crate::profile::{AudioFormat, RecordingSettings, ReconnectConfig, StreamInfo};
use crate::stream::{connection, format, recorder, splitter};

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

// ---------------------------------------------------------------------------
// Internal entry held per active stream
// ---------------------------------------------------------------------------

struct StreamEntry {
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

    pub fn get_all_stream_info(&self) -> Vec<StreamInfo> {
        self.entries.values().map(|e| e.info.clone()).collect()
    }
}

// ---------------------------------------------------------------------------
// Helper emit functions (fire-and-forget)
// ---------------------------------------------------------------------------

fn emit_recording_status(app: &AppHandle, stream_id: &str, status: &str, error: Option<String>) {
    app.emit(
        "recording-status",
        RecordingStatusPayload {
            stream_id: stream_id.to_string(),
            status: status.to_string(),
            error,
        },
    )
    .ok();
}

fn emit_track_changed(app: &AppHandle, stream_id: &str, artist: &str, title: &str) {
    app.emit(
        "track-changed",
        TrackChangedPayload {
            stream_id: stream_id.to_string(),
            artist: artist.to_string(),
            title: title.to_string(),
            album: String::new(),
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
            Ok(c) => c,
            Err(e) => {
                let msg = e.to_string();
                update_state_error(&manager, &stream_id, &msg).await;
                emit_stream_error(
                    &app_handle,
                    &stream_id,
                    &msg,
                    reconnect.max_retries > 0 && attempt < reconnect.max_retries,
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

        // --- Set up recorder ---
        let output_dir = portable::recordings_dir();
        let content_type = conn.content_type.as_deref().unwrap_or("");
        let detected_format = format::detect_from_content_type(content_type)
            .unwrap_or(AudioFormat::Mp3);

        let mut rec = recorder::Recorder::new(
            output_dir,
            recording_settings.clone(),
            detected_format,
            station_name.clone(),
        );

        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        if let Err(e) = rec.open_stream_file(&station_name, &today).await {
            tracing::warn!(stream_id = %stream_id, "Failed to open stream file: {}", e);
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

        tokio::task::spawn_blocking(move || {
            use icy_metadata::{IcyMetadata, IcyMetadataReader};
            use std::io::Read;

            // We need a synchronous reader from the reqwest response.
            // reqwest doesn't expose a sync Read directly, but we can use
            // `bytes_stream()` collected into a synchronous cursor via a custom adapter.
            // The simplest approach: use a channel-based SyncStream that blocks on
            // tokio::runtime::Handle to poll chunks.
            //
            // We get the current tokio runtime handle and use block_on to drive
            // the async stream synchronously inside spawn_blocking.
            let rt = tokio::runtime::Handle::current();

            // Shared slot for metadata received by the callback
            let meta_slot: Arc<std::sync::Mutex<Option<(String, String)>>> =
                Arc::new(std::sync::Mutex::new(None));
            let meta_slot_cb = Arc::clone(&meta_slot);

            // Build a synchronous adapter that drives the reqwest bytes_stream
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
                            // Store leftover
                            self.buf = bytes.slice(n..);
                            Ok(n)
                        }
                    }
                }
            }

            let stream_box: futures_util::stream::BoxStream<'static, Result<bytes::Bytes, reqwest::Error>> =
                Box::pin(response.bytes_stream());

            let inner_reader = ReqwestSyncReader {
                stream: stream_box,
                buf: bytes::Bytes::new(),
                rt,
            };

            let mut icy_reader = IcyMetadataReader::new(
                inner_reader,
                metaint,
                move |result: Result<IcyMetadata, _>| {
                    if let Ok(meta) = result {
                        if let Some(title_str) = meta.stream_title() {
                            // Parse "Artist - Title" from stream_title
                            let (artist, title) = if let Some(pos) = title_str.find(" - ") {
                                (
                                    title_str[..pos].trim().to_string(),
                                    title_str[pos + 3..].trim().to_string(),
                                )
                            } else {
                                (String::new(), title_str.trim().to_string())
                            };
                            if let Ok(mut slot) = meta_slot_cb.lock() {
                                *slot = Some((artist, title));
                            }
                        }
                    }
                },
            );

            let mut buf = vec![0u8; 8192];
            // Track accumulated bytes since last flush to manager (update every ~64 KB)
            let mut byte_accumulator: u64 = 0;
            const FLUSH_THRESHOLD: u64 = 65536;

            loop {
                match icy_reader.read(&mut buf) {
                    Err(e) => {
                        let _ = tx.blocking_send(ReadEvent::Error(e.to_string()));
                        break;
                    }
                    Ok(0) => {
                        let _ = tx.blocking_send(ReadEvent::Eof);
                        break;
                    }
                    Ok(n) => {
                        // Check if cancelled (channel closed)
                        if tx.is_closed() {
                            break;
                        }

                        // Drain any pending metadata from the callback slot
                        let meta_event = {
                            let mut slot = meta_slot.lock().unwrap();
                            slot.take()
                        };
                        if let Some((artist, title)) = meta_event {
                            // Send metadata event first, then audio (order matters)
                            if tx.blocking_send(ReadEvent::MetadataChanged(artist, title)).is_err() {
                                break;
                            }
                        }

                        byte_accumulator += n as u64;
                        if byte_accumulator >= FLUSH_THRESHOLD {
                            // Flush is implicit - no separate flush event needed
                            byte_accumulator = 0;
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
                    // Drop rx to signal the blocking thread, then close recorder
                    drop(rx);
                    rec.close().await.ok();
                    break 'reconnect;
                }
                event = rx.recv() => {
                    match event {
                        None => {
                            // Channel closed (blocking thread exited cleanly)
                            rec.close().await.ok();
                            break 'read;
                        }
                        Some(ReadEvent::Eof) => {
                            rec.close().await.ok();
                            break 'read;
                        }
                        Some(ReadEvent::Error(msg)) => {
                            rec.close().await.ok();
                            let will_retry = reconnect.max_retries > 0
                                && attempt < reconnect.max_retries;
                            emit_stream_error(&app_handle, &stream_id, &msg, will_retry);
                            break 'read;
                        }
                        Some(ReadEvent::MetadataChanged(artist, title)) => {
                            let meta = connection::TrackMetadata {
                                artist: artist.clone(),
                                title: title.clone(),
                            };
                            match spl.on_metadata_change(meta) {
                                splitter::SplitAction::Skip => {}
                                splitter::SplitAction::StartTrack(m) => {
                                    rec.start_track(&m.artist, &m.title).await.ok();
                                    emit_track_changed(&app_handle, &stream_id, &m.artist, &m.title);
                                    update_track_info(&manager, &stream_id, &m.artist, &m.title).await;
                                }
                                splitter::SplitAction::FinalizeAndStart { completed, new, duration_ms } => {
                                    rec.finalize_track(&completed.artist, &completed.title, duration_ms).await.ok();
                                    rec.start_track(&new.artist, &new.title).await.ok();
                                    emit_track_changed(&app_handle, &stream_id, &new.artist, &new.title);
                                    update_track_info(&manager, &stream_id, &new.artist, &new.title).await;
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
    update_state(&manager, &stream_id, StreamState::Idle).await;
    emit_recording_status(&app_handle, &stream_id, "stopped", None);

    // Remove entry from the manager
    manager.write().await.entries.remove(&stream_id);
}
