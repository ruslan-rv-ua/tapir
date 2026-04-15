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
use rodio::{ChannelCount, Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, SampleRate, Source};
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
    /// Create a new PlayerEngine with the given initial volume and output device.
    /// Verifies that the default audio output can be opened at startup (fail fast).
    pub fn new(initial_volume: f32, initial_device: Option<String>) -> Result<Self> {
        // Verify we can open the default device at startup (fail fast).
        // We don't keep the sink here; each session opens its own.
        DeviceSinkBuilder::open_default_sink()
            .context("Failed to open audio output stream")?;
        Ok(Self {
            session: Arc::new(Mutex::new(None)),
            volume: Arc::new(Mutex::new(initial_volume.clamp(0.0, 1.0))),
            output_device_name: Arc::new(Mutex::new(initial_device)),
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

        let device_name = self.output_device_name.lock().await.clone();
        let device_sink = open_device_sink(device_name.as_deref())
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
        let volume_arc = Arc::clone(&self.volume);

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
                let current_volume = *volume_arc.lock().await;
                let _ = app_clone.emit("player-status", PlayerStatus {
                    state: PlaybackState::Stopped,
                    source: None,
                    volume: current_volume,
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
    /// Set volume (0.0–1.0). Applied immediately to any active session.
    pub async fn set_volume(&self, volume: f32, app: &AppHandle) -> Result<()> {
        let volume = volume.clamp(0.0, 1.0);
        // Take session first (established lock order: session → volume)
        {
            let session = self.session.lock().await;
            *self.volume.lock().await = volume;
            if let Some(s) = session.as_ref() {
                s.player.set_volume(volume);
            }
            // both locks dropped here
        }
        let status = self.get_status().await;
        if let Err(e) = app.emit("player-status", status) {
            log::warn!("Player: failed to emit player-status: {e}");
        }
        Ok(())
    }

    pub async fn current_volume(&self) -> f32 {
        *self.volume.lock().await
    }

    /// Enumerate system audio output devices. Runs in spawn_blocking because cpal is sync.
    pub async fn list_output_devices() -> Result<Vec<AudioDevice>> {
        tokio::task::spawn_blocking(|| -> anyhow::Result<Vec<AudioDevice>> {
            use rodio::cpal::traits::{DeviceTrait, HostTrait};
            let host = rodio::cpal::default_host();
            let default_name = host
                .default_output_device()
                .and_then(|d| d.description().ok().map(|desc| desc.name().to_string()));
            let devices = host
                .output_devices()
                .context("failed to enumerate audio output devices")?
                .filter_map(|d| {
                    d.description().ok().map(|desc| {
                        let name = desc.name().to_string();
                        AudioDevice {
                            is_default: Some(&name) == default_name.as_ref(),
                            name,
                        }
                    })
                })
                .collect();
            Ok(devices)
        })
        .await
        .context("device enumeration task panicked")?
        .context("device enumeration failed")
    }

    /// Switch audio output device. Stops current playback.
    /// `name` = None means revert to system default.
    pub async fn set_output_device(&self, name: Option<String>, app: &AppHandle) -> Result<()> {
        self.stop_session().await;
        info!("Player: switched output device to {:?}", name);
        // Lock order: session (already released by stop_session) → volume → output_device_name
        let volume = *self.volume.lock().await;
        *self.output_device_name.lock().await = name;
        if let Err(e) = app.emit("player-status", PlayerStatus {
            state: PlaybackState::Stopped,
            source: None,
            volume,
            position_ms: None,
            duration_ms: None,
        }) {
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
                if let Err(e) = app.emit("player-progress", PlayerProgressPayload {
                    position_ms: pos,
                    duration_ms: dur,
                }) {
                    log::warn!("Player: failed to emit player-progress: {e}");
                }
            }
        }
        Ok(())
    }
}

use std::collections::VecDeque;
use std::io::{self, Read};

// ── RtrbReader ─────────────────────────────────────────────────────────────

/// Wraps an rtrb Consumer as a std::io::Read.
/// Spin-yields until data is available or producer is dropped.
struct RtrbReader {
    consumer: std::sync::Mutex<rtrb::Consumer<u8>>,
}

impl Read for RtrbReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if buf.is_empty() { return Ok(0); }
        let mut consumer = self.consumer.lock().unwrap();
        loop {
            let available = consumer.slots();
            if available == 0 {
                if consumer.is_abandoned() {
                    return Ok(0); // producer dropped — EOF
                }
                std::thread::sleep(std::time::Duration::from_millis(1));
                continue;
            }
            let n = available.min(buf.len());
            let chunk = consumer.read_chunk(n).map_err(|_| {
                io::Error::new(io::ErrorKind::UnexpectedEof, "rtrb read failed")
            })?;
            let (head, tail) = chunk.as_slices();
            let head_n = head.len().min(n);
            buf[..head_n].copy_from_slice(&head[..head_n]);
            let tail_n = (n - head_n).min(tail.len());
            buf[head_n..head_n + tail_n].copy_from_slice(&tail[..tail_n]);
            chunk.commit(n);
            return Ok(n);
        }
    }
}

// ── LiveSource ─────────────────────────────────────────────────────────────

use symphonia::core::audio::{SampleBuffer, SignalSpec};
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::{MediaSourceStream, ReadOnlySource};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Symphonia-backed audio source for live HTTP streams.
/// Receives raw audio bytes from the writer task via rtrb, decodes via
/// symphonia, and yields f32 samples to rodio's mixer.
struct LiveSource {
    format: Box<dyn symphonia::core::formats::FormatReader>,
    decoder: Box<dyn symphonia::core::codecs::Decoder>,
    track_id: u32,
    buffer: VecDeque<f32>,
    spec: SignalSpec,
}

impl LiveSource {
    fn new(consumer: rtrb::Consumer<u8>, hint_mime: Option<&str>) -> anyhow::Result<Self> {
        let reader = RtrbReader { consumer: std::sync::Mutex::new(consumer) };
        let source = ReadOnlySource::new(reader);
        let mss = MediaSourceStream::new(Box::new(source), Default::default());
        let mut hint = Hint::new();
        if let Some(mime) = hint_mime {
            hint.mime_type(mime);
        }
        let probe = symphonia::default::get_probe()
            .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
            .context("could not probe live stream format")?;
        let format = probe.format;
        let track = format.default_track()
            .ok_or_else(|| anyhow::anyhow!("no default track in live stream"))?;
        let track_id = track.id;
        let decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .context("unsupported codec in live stream")?;
        let spec = SignalSpec::new(
            track.codec_params.sample_rate.unwrap_or(44100),
            track.codec_params.channels.unwrap_or_default(),
        );
        Ok(Self { format, decoder, track_id, buffer: VecDeque::new(), spec })
    }

    fn decode_next_packet(&mut self) -> bool {
        let mut consecutive_errors: u32 = 0;
        loop {
            match self.format.next_packet() {
                Ok(packet) if packet.track_id() == self.track_id => {
                    match self.decoder.decode(&packet) {
                        Ok(decoded) => {
                            let mut samples = SampleBuffer::<f32>::new(
                                decoded.frames() as u64, self.spec
                            );
                            samples.copy_interleaved_ref(decoded);
                            self.buffer.extend(samples.samples().iter().copied());
                            return true;
                        }
                        Err(e) => {
                            consecutive_errors += 1;
                            log::warn!(
                                "[LiveSource] decoder error (track {}, consecutive {}): {e}",
                                self.track_id, consecutive_errors
                            );
                            if consecutive_errors >= 32 {
                                log::warn!("[LiveSource] too many consecutive errors, stopping");
                                return false;
                            }
                            continue;
                        }
                    }
                }
                Ok(_) => continue, // different track — skip
                Err(e) => {
                    log::warn!("[LiveSource] format reader ended: {e}");
                    return false;
                }
            }
        }
    }
}

impl Iterator for LiveSource {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        if self.buffer.is_empty() && !self.decode_next_packet() {
            return None;
        }
        self.buffer.pop_front()
    }
}

impl Source for LiveSource {
    fn current_span_len(&self) -> Option<usize> { None }
    fn channels(&self) -> ChannelCount {
        use std::num::NonZero;
        NonZero::new(self.spec.channels.count() as u16).unwrap_or(NonZero::new(2).unwrap())
    }
    fn sample_rate(&self) -> SampleRate {
        use std::num::NonZero;
        NonZero::new(self.spec.rate).unwrap_or(NonZero::new(44100).unwrap())
    }
    fn total_duration(&self) -> Option<Duration> { None }
}

impl PlayerEngine {
    pub async fn play_stream(
        &self,
        stream_id: String,
        url: String,
        app: &AppHandle,
    ) -> Result<()> {
        use crate::stream::connection;
        use futures_util::StreamExt;

        self.stop_session().await;

        // Connect first so we can extract content_type for symphonia probing
        let conn = connection::connect(&url).await
            .context("failed to connect to stream")?;
        let mime_hint: Option<String> = conn.content_type.clone();

        let (mut producer, consumer) = rtrb::RingBuffer::<u8>::new(512 * 1024);
        let cancel = CancellationToken::new();
        let cancel_writer = cancel.clone();
        let stream_id_clone = stream_id.clone();
        // Signals when the writer task exits (stream ended or errored, not user-cancelled).
        let writer_done = CancellationToken::new();
        let writer_done_signal = writer_done.clone();

        // Writer task: HTTP body → rtrb producer
        tokio::spawn(async move {
            let mut stream = conn.response.bytes_stream();
            loop {
                tokio::select! {
                    _ = cancel_writer.cancelled() => break,
                    chunk = stream.next() => {
                        match chunk {
                            None => break,
                            Some(Err(e)) => {
                                log::warn!("Player: stream error {stream_id_clone}: {e}");
                                break;
                            }
                            Some(Ok(bytes)) => {
                                let mut remaining: &[u8] = bytes.as_ref();
                                while !remaining.is_empty() {
                                    match producer.write_chunk(remaining.len()) {
                                        Ok(mut chunk) => {
                                            let (head, _) = chunk.as_mut_slices();
                                            let n = head.len().min(remaining.len());
                                            head[..n].copy_from_slice(&remaining[..n]);
                                            remaining = &remaining[n..];
                                            chunk.commit(n);
                                        }
                                        Err(_) => {
                                            log::debug!(
                                                "Player: ring buffer full for {stream_id_clone}, \
                                                 dropping {} bytes", remaining.len()
                                            );
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Signal that the writer exited (producer about to drop → LiveSource sees EOF).
            writer_done_signal.cancel();
        });

        // LiveSource::new blocks on RtrbReader (waits for symphonia to probe the stream)
        // — run in spawn_blocking so we don't block the tokio runtime
        let live_source = match tokio::task::spawn_blocking(move || {
            LiveSource::new(consumer, mime_hint.as_deref())
        })
        .await
        {
            Ok(Ok(src)) => src,
            Ok(Err(e)) => {
                cancel.cancel();
                return Err(e).context("LiveSource init failed");
            }
            Err(e) => {
                cancel.cancel();
                return Err(anyhow::anyhow!("LiveSource init task panicked: {e}"));
            }
        };

        let device_name = self.output_device_name.lock().await.clone();
        let device_sink = match open_device_sink(device_name.as_deref()) {
            Ok(s) => s,
            Err(e) => {
                cancel.cancel();
                return Err(e).context("Failed to open audio output stream");
            }
        };
        let player = Arc::new(Player::connect_new(&device_sink.mixer()));
        let device_sink_arc = Arc::new(std::sync::Mutex::new(Some(device_sink)));

        let volume = *self.volume.lock().await;
        player.set_volume(volume);
        player.append(live_source);

        let cancel_live = cancel.clone();
        let app_live = app.clone();
        let volume_arc = Arc::clone(&self.volume);
        let progress_task = tokio::spawn(async move {
            tokio::select! {
                _ = cancel_live.cancelled() => {
                    // User-initiated stop — stop_playback already emits player-status.
                }
                _ = writer_done.cancelled() => {
                    // HTTP stream ended or errored. Wait briefly for rodio to drain, then emit stopped.
                    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
                    let current_volume = *volume_arc.lock().await;
                    if let Err(e) = app_live.emit("player-status", PlayerStatus {
                        state: PlaybackState::Stopped,
                        source: None,
                        volume: current_volume,
                        position_ms: None,
                        duration_ms: None,
                    }) {
                        log::warn!("Player: failed to emit player-status on stream end: {e}");
                    }
                }
            }
        });

        *self.session.lock().await = Some(PlaybackSession {
            player: Arc::clone(&player),
            cancel,
            source: PlaybackSource::Stream { stream_id: stream_id.clone() },
            duration_ms: None,
            progress_task,
            _device_sink: device_sink_arc,
        });

        let status = self.get_status().await;
        if let Err(e) = app.emit("player-status", status) {
            log::warn!("Player: failed to emit player-status: {e}");
        }
        info!("Player: playing live stream {stream_id}");
        Ok(())
    }
}

/// Open a MixerDeviceSink for the named device, or the system default if name is None.
fn open_device_sink(device_name: Option<&str>) -> anyhow::Result<MixerDeviceSink> {
    match device_name {
        None => DeviceSinkBuilder::open_default_sink()
            .context("open default audio sink"),
        Some(name) => {
            use rodio::cpal::traits::{DeviceTrait, HostTrait};
            let host = rodio::cpal::default_host();
            let device = host
                .output_devices()
                .context("enumerate devices")?
                .find(|d| d.description().ok().map(|desc| desc.name().to_string()).as_deref() == Some(name))
                .with_context(|| format!("audio device not found: {name}"))?;
            DeviceSinkBuilder::from_device(device)
                .and_then(|b| b.open_stream())
                .context("open device audio sink")
        }
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
