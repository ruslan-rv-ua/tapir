use thiserror::Error;

#[derive(Debug, Error)]
pub enum RadioError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Format error: {0}")]
    Format(String),

    #[error("Not found: {0}")]
    NotFound(String),

    /// The stream already has a live recording — in any of its phases
    /// (connecting, recording, reconnecting). The `start_recording` command
    /// puts it on the wire as the `REC_ERR_ALREADY_RECORDING` code
    /// (`recording_refusal_on_wire`); the scheduler and crash recovery only
    /// log this prose.
    #[error("Stream '{0}' is already recording")]
    AlreadyRecording(String),

    /// Nothing to stop: no live recording for the stream. The `stop_recording`
    /// command puts it on the wire as `REC_ERR_NOT_RECORDING`.
    #[error("No active recording for stream '{0}'")]
    NotRecording(String),

    /// Free space on the recording volume is under the profile's threshold.
    /// A refusal by Tapir, not a failure of the station — nothing is tried.
    /// `start_recording` / `start_all_recordings` put it on the wire as
    /// `REC_ERR_DISK_SPACE_LOW`; the numbers live in this prose for the log
    /// (ADR 2026-09-06 §5) — on screen the status bar already carries them.
    #[error("Not enough disk space: free {:.1} GB, required {threshold_gb} GB", gib(.free_bytes))]
    DiskSpaceLow { free_bytes: u64, threshold_gb: u32 },

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("{0}")]
    Other(String),

    #[error("Radio Browser API error: {0}")]
    BrowserApi(String),

    #[error("No Radio Browser servers available")]
    BrowserNoServers,

    #[error("Stream with this URL already exists")]
    DuplicateStream,

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("InvalidName: {0}")]
    InvalidName(String),

    #[error("InvalidData: {0}")]
    InvalidData(String),
}

impl From<RadioError> for String {
    fn from(e: RadioError) -> String {
        e.to_string()
    }
}

/// Bytes as gibibytes, for the one Display that quotes a size.
fn gib(bytes: &u64) -> f64 {
    *bytes as f64 / 1_073_741_824.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_display_prefixes() {
        assert_eq!(RadioError::Conflict("x".into()).to_string(), "Conflict: x");
        assert_eq!(RadioError::Forbidden("x".into()).to_string(), "Forbidden: x");
        assert_eq!(RadioError::InvalidName("x".into()).to_string(), "InvalidName: x");
        assert_eq!(RadioError::InvalidData("x".into()).to_string(), "InvalidData: x");
    }

    #[test]
    fn disk_space_low_display_keeps_the_numbers_for_the_log() {
        // The toast no longer quotes them (record-refusals-untranslated), so
        // this line is where they survive.
        let e = RadioError::DiskSpaceLow { free_bytes: 429_496_730, threshold_gb: 1 };
        assert_eq!(e.to_string(), "Not enough disk space: free 0.4 GB, required 1 GB");
    }
}
