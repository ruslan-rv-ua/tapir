use serde::{Deserialize, Serialize};

// ── Serializable types (IPC / event payloads) ──────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStatus {
    pub state: PlaybackState,
    pub source: Option<PlaybackSource>,
    pub volume: f32,
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackState {
    Stopped,
    Playing,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PlaybackSource {
    #[serde(rename = "stream", rename_all = "camelCase")]
    Stream { stream_id: String },
    #[serde(rename = "file", rename_all = "camelCase")]
    File { path: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerProgressPayload {
    pub position_ms: u64,
    pub duration_ms: u64,
}

use std::sync::Arc;
use std::time::Duration;
use anyhow::{Context, Result};
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use log::info;

// ── Internal runtime types (not serialized) ────────────────────────────────

// MixerDeviceSink wraps a cpal::Stream which is !Send on some platforms.
// We store it behind a Mutex so it stays on a single thread conceptually,
// and we never actually send it across threads — we only drop it.
struct PlaybackSession {
    player: Arc<Player>,
    cancel: CancellationToken,
    source: PlaybackSource,
    duration_ms: Option<u64>,  // Some for files, None for live streams
    progress_task: JoinHandle<()>,
    // Keep MixerDeviceSink alive as long as the session exists.
    // Wrapped to allow interior mutability without &mut self.
    _device_sink: Arc<std::sync::Mutex<Option<MixerDeviceSink>>>,
}

// Lock acquisition order (must be consistent to avoid deadlock):
// 1. session
// 2. volume
// 3. output_device_name
pub struct PlayerEngine {
    session: Arc<Mutex<Option<PlaybackSession>>>,
    volume: Arc<Mutex<f32>>,
    output_device_name: Arc<Mutex<Option<String>>>,
}

impl PlayerEngine {
    /// Create a new PlayerEngine using the system default audio output device.
    pub fn new() -> Result<Self> {
        // Verify we can open the default device at startup (fail fast).
        // We don't keep the sink here; each session opens its own.
        DeviceSinkBuilder::open_default_sink()
            .context("Failed to open audio output stream")?;
        Ok(Self {
            session: Arc::new(Mutex::new(None)),
            volume: Arc::new(Mutex::new(0.75)),
            output_device_name: Arc::new(Mutex::new(None)), // Used in Task 5: set_output_device
        })
    }

    /// Build a PlayerStatus snapshot from current engine state.
    pub async fn get_status(&self) -> PlayerStatus {
        let session = self.session.lock().await;
        let volume = *self.volume.lock().await;
        match session.as_ref() {
            None => PlayerStatus {
                state: PlaybackState::Stopped,
                source: None,
                volume,
                position_ms: None,
                duration_ms: None,
            },
            Some(s) => {
                let pos = s.player.get_pos().as_millis() as u64;
                let paused = s.player.is_paused();
                PlayerStatus {
                    state: if paused { PlaybackState::Paused } else { PlaybackState::Playing },
                    source: Some(s.source.clone()),
                    volume,
                    position_ms: Some(pos),
                    duration_ms: s.duration_ms,
                }
            }
        }
    }

    /// Stop and drop the current session if any.
    async fn stop_session(&self) {
        let mut session = self.session.lock().await;
        if let Some(s) = session.take() {
            s.cancel.cancel();
            s.progress_task.abort();
            // Player and MixerDeviceSink stop automatically when dropped
        }
    }

    /// Public wrapper for graceful shutdown from lib.rs.
    pub async fn stop_session_public(&self) {
        self.stop_session().await;
    }
}

impl PlayerEngine {
    pub async fn play_file(&self, path: String, app: &AppHandle) -> Result<()> {
        self.stop_session().await;

        let file = std::fs::File::open(&path)
            .with_context(|| format!("File not found: {path}"))?;
        let reader = std::io::BufReader::new(file);
        let decoder = Decoder::new(reader)
            .context("Unsupported audio format")?;

        let duration_ms = decoder.total_duration().map(|d| d.as_millis() as u64);

        let device_sink = DeviceSinkBuilder::open_default_sink()
            .context("Failed to open audio output stream")?;
        let player = Arc::new(Player::connect_new(&device_sink.mixer()));

        let volume = *self.volume.lock().await;
        player.set_volume(volume);
        player.append(decoder);

        let cancel = CancellationToken::new();
        let cancel_clone = cancel.clone();
        let player_clone = Arc::clone(&player);
        let app_clone = app.clone();
        let dur = duration_ms.unwrap_or(0);

        let progress_task = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(1));
            let mut ended_naturally = false;
            loop {
                tokio::select! {
                    _ = cancel_clone.cancelled() => break,
                    _ = interval.tick() => {
                        if player_clone.empty() {
                            ended_naturally = true;
                            break;
                        }
                        let pos = player_clone.get_pos().as_millis() as u64;
                        let _ = app_clone.emit("player-progress", PlayerProgressPayload {
                            position_ms: pos,
                            duration_ms: dur,
                        });
                    }
                }
            }
            if ended_naturally {
                let _ = app_clone.emit("player-status", PlayerStatus {
                    state: PlaybackState::Stopped,
                    source: None,
                    volume,
                    position_ms: None,
                    duration_ms: None,
                });
            }
        });

        let device_sink_arc = Arc::new(std::sync::Mutex::new(Some(device_sink)));

        *self.session.lock().await = Some(PlaybackSession {
            player: Arc::clone(&player),
            cancel,
            source: PlaybackSource::File { path: path.clone() },
            duration_ms,
            progress_task,
            _device_sink: device_sink_arc,
        });

        let status = self.get_status().await;
        if let Err(e) = app.emit("player-status", status) {
            log::warn!("Player: failed to emit player-status: {e}");
        }
        info!("Player: playing file {path}");
        Ok(())
    }
}

impl PlayerEngine {
    pub async fn stop_playback(&self, app: &AppHandle) -> Result<()> {
        self.stop_session().await;
        let volume = *self.volume.lock().await;
        app.emit("player-status", PlayerStatus {
            state: PlaybackState::Stopped,
            source: None,
            volume,
            position_ms: None,
            duration_ms: None,
        })?;
        info!("Player: stopped");
        Ok(())
    }
}

impl PlayerEngine {
    pub async fn pause_playback(&self, app: &AppHandle) -> Result<()> {
        let session = self.session.lock().await;
        let s = session.as_ref().ok_or_else(|| anyhow::anyhow!("not playing"))?;
        s.player.pause();
        drop(session);
        let status = self.get_status().await;
        if let Err(e) = app.emit("player-status", status) {
            log::warn!("Player: failed to emit player-status: {e}");
        }
        Ok(())
    }
}

impl PlayerEngine {
    pub async fn resume_playback(&self, app: &AppHandle) -> Result<()> {
        let session = self.session.lock().await;
        let s = session.as_ref().ok_or_else(|| anyhow::anyhow!("not playing"))?;
        s.player.play();
        drop(session);
        let status = self.get_status().await;
        if let Err(e) = app.emit("player-status", status) {
            log::warn!("Player: failed to emit player-status: {e}");
        }
        Ok(())
    }
}

impl PlayerEngine {
    pub async fn seek_playback(&self, position_ms: u64, app: &AppHandle) -> Result<()> {
        let session = self.session.lock().await;
        let s = session.as_ref().ok_or_else(|| anyhow::anyhow!("not playing"))?;

        match &s.source {
            PlaybackSource::Stream { .. } => {
                return Err(anyhow::anyhow!("seek unavailable for live stream"));
            }
            PlaybackSource::File { .. } => {
                s.player
                    .try_seek(std::time::Duration::from_millis(position_ms))
                    .map_err(|e| anyhow::anyhow!("seek failed: {e}"))?;
                let pos = s.player.get_pos().as_millis() as u64;
                let dur = s.duration_ms.unwrap_or(0);
                drop(session);
                let _ = app.emit("player-progress", PlayerProgressPayload {
                    position_ms: pos,
                    duration_ms: dur,
                });
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn player_status_stopped_serializes() {
        let status = PlayerStatus {
            state: PlaybackState::Stopped,
            source: None,
            volume: 0.75,
            position_ms: None,
            duration_ms: None,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"state\":\"stopped\""));
        assert!(json.contains("\"volume\":0.75"));
        assert!(json.contains("\"source\":null"));
        assert!(json.contains("\"positionMs\":null"));
        assert!(json.contains("\"durationMs\":null"));
    }

    #[test]
    fn playback_source_stream_serializes() {
        let src = PlaybackSource::Stream { stream_id: "abc".into() };
        let json = serde_json::to_string(&src).unwrap();
        assert!(json.contains("\"type\":\"stream\""));
        assert!(json.contains("\"streamId\":\"abc\""));
    }

    #[test]
    fn playback_source_file_serializes() {
        let src = PlaybackSource::File { path: "recordings/test.mp3".into() };
        let json = serde_json::to_string(&src).unwrap();
        assert!(json.contains("\"type\":\"file\""));
        assert!(json.contains("\"path\":\"recordings/test.mp3\""));
    }

    #[test]
    fn audio_device_serializes() {
        let dev = AudioDevice { name: "Speakers".into(), is_default: true };
        let json = serde_json::to_string(&dev).unwrap();
        assert!(json.contains("\"isDefault\":true"));
    }

    #[test]
    fn playback_state_variants() {
        let playing = serde_json::to_string(&PlaybackState::Playing).unwrap();
        let paused  = serde_json::to_string(&PlaybackState::Paused).unwrap();
        let stopped = serde_json::to_string(&PlaybackState::Stopped).unwrap();
        assert_eq!(playing,  "\"playing\"");
        assert_eq!(paused,   "\"paused\"");
        assert_eq!(stopped,  "\"stopped\"");
    }
}
