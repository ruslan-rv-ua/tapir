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
