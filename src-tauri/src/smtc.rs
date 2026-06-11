//! System Media Transport Controls (SMTC) integration.
//!
//! Owns all WinRT/COM interop for the Windows media session: hardware media
//! keys (play/pause, headset buttons) and the system media overlay. All
//! updates are serialized through a single worker task — rationale in
//! docs/decisions/2026-06-11-smtc-via-windows-crate.md.
//!
//! Init failure (e.g. Windows N without the Media Feature Pack) leaves the
//! channel unset and every public facade a silent no-op: recording and
//! global hotkeys never depend on SMTC.

use windows::Media::MediaPlaybackStatus;

use crate::player::engine::{PlaybackSource, PlaybackState};

// ── Pure helpers (unit-tested, no COM) ──────────────────────────────────────

/// What the overlay shows. Composition rules: spec §«Метадані (FR-4)».
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct SmtcMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
}

/// Metadata for a station/preview. `track` = (artist, title) from ICY;
/// title is always non-empty (guaranteed by parse_stream_title in engine.rs).
pub(crate) fn compose_live_metadata(station: &str, track: Option<(&str, &str)>) -> SmtcMetadata {
    match track {
        Some((artist, title)) => SmtcMetadata {
            title: title.to_string(),
            artist: artist.to_string(),
            album: station.to_string(),
        },
        None => SmtcMetadata {
            title: station.to_string(),
            ..Default::default()
        },
    }
}

/// Metadata for a file: tags, falling back to the file name without extension.
pub(crate) fn compose_file_metadata(path: &str, tag_artist: &str, tag_title: &str) -> SmtcMetadata {
    let title = if tag_title.is_empty() {
        std::path::Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(path)
            .to_string()
    } else {
        tag_title.to_string()
    };
    SmtcMetadata {
        title,
        artist: tag_artist.to_string(),
        album: String::new(),
    }
}

/// FR-1/FR-8: Stopped → Closed (clear_session additionally tears the session down).
pub(crate) fn map_playback_status(state: &PlaybackState) -> MediaPlaybackStatus {
    match state {
        PlaybackState::Playing => MediaPlaybackStatus::Playing,
        PlaybackState::Paused => MediaPlaybackStatus::Paused,
        PlaybackState::Stopped => MediaPlaybackStatus::Closed,
    }
}

/// Whether two playback sources are the same (a source change resets the ICY track).
pub(crate) fn same_source(a: Option<&PlaybackSource>, b: Option<&PlaybackSource>) -> bool {
    match (a, b) {
        (None, None) => true,
        (
            Some(PlaybackSource::Stream { stream_id: x }),
            Some(PlaybackSource::Stream { stream_id: y }),
        ) => x == y,
        (Some(PlaybackSource::File { path: x }), Some(PlaybackSource::File { path: y })) => x == y,
        (
            Some(PlaybackSource::Preview { url: x, .. }),
            Some(PlaybackSource::Preview { url: y, .. }),
        ) => x == y,
        _ => false,
    }
}

/// Whether an ICY update (keyed by stream_id) belongs to the current source.
/// Previews carry an empty stream_id.
pub(crate) fn track_matches_source(stream_id: &str, source: Option<&PlaybackSource>) -> bool {
    match source {
        Some(PlaybackSource::Stream { stream_id: id }) => {
            !stream_id.is_empty() && id == stream_id
        }
        Some(PlaybackSource::Preview { .. }) => stream_id.is_empty(),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn live_metadata_with_track_puts_station_in_album() {
        let md = compose_live_metadata("Радіо Київ", Some(("Океан Ельзи", "Обійми")));
        assert_eq!(md.title, "Обійми");
        assert_eq!(md.artist, "Океан Ельзи");
        assert_eq!(md.album, "Радіо Київ");
    }

    #[test]
    fn live_metadata_without_track_shows_station_as_title() {
        let md = compose_live_metadata("Радіо Київ", None);
        assert_eq!(md.title, "Радіо Київ");
        assert_eq!(md.artist, "");
        assert_eq!(md.album, "");
    }

    #[test]
    fn file_metadata_prefers_tags() {
        let md = compose_file_metadata(r"C:\rec\2026\song.mp3", "Artist", "Tagged Title");
        assert_eq!(md.title, "Tagged Title");
        assert_eq!(md.artist, "Artist");
        assert_eq!(md.album, "");
    }

    #[test]
    fn file_metadata_falls_back_to_file_stem() {
        let md = compose_file_metadata(r"C:\rec\2026\Океан Ельзи - Обійми.mp3", "", "");
        assert_eq!(md.title, "Океан Ельзи - Обійми");
        assert_eq!(md.artist, "");
    }

    #[test]
    fn playback_status_mapping() {
        assert_eq!(map_playback_status(&PlaybackState::Playing), MediaPlaybackStatus::Playing);
        assert_eq!(map_playback_status(&PlaybackState::Paused), MediaPlaybackStatus::Paused);
        assert_eq!(map_playback_status(&PlaybackState::Stopped), MediaPlaybackStatus::Closed);
    }

    #[test]
    fn same_source_compares_by_identity_fields() {
        let s1 = PlaybackSource::Stream { stream_id: "a".into() };
        let s2 = PlaybackSource::Stream { stream_id: "a".into() };
        let s3 = PlaybackSource::Stream { stream_id: "b".into() };
        let f = PlaybackSource::File { path: "x.mp3".into() };
        assert!(same_source(Some(&s1), Some(&s2)));
        assert!(!same_source(Some(&s1), Some(&s3)));
        assert!(same_source(None, None));
        assert!(!same_source(Some(&s1), None));
        assert!(!same_source(Some(&s1), Some(&f)));
    }

    #[test]
    fn track_updates_keyed_to_current_source() {
        let stream = PlaybackSource::Stream { stream_id: "a".into() };
        let preview = PlaybackSource::Preview { url: "http://x".into(), name: "X".into() };
        let file = PlaybackSource::File { path: "x.mp3".into() };
        assert!(track_matches_source("a", Some(&stream)));
        assert!(!track_matches_source("b", Some(&stream)));
        assert!(track_matches_source("", Some(&preview))); // previews carry an empty id
        assert!(!track_matches_source("a", Some(&preview)));
        assert!(!track_matches_source("", Some(&file)));
        assert!(!track_matches_source("a", None));
    }
}
