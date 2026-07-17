//! The single source-aware playback-toggle entry point (Ctrl+Shift+K and the
//! tray Play/Pause item), plus cold-start resume and the persistence that
//! revives the dormant `PlayerSession` resume fields.
//!
//! Pure decision logic lives in `decide_toggle` / `decide_cold_start` and is
//! unit-tested here; the async orchestration (Task 4) is thin glue over them.

use crate::player::engine::{PlaybackSource, PlaybackState, PlayerStatus};
use crate::profile::{FilePosition, LastActive, PlayerSession};

/// What `toggle_playback` should do for a given live status. Branch by source
/// **type first** (impl-decision #4): a `Stream` is stopped whether Playing or
/// Paused — resuming a live buffer is meaningless (you'd replay a stale buffer
/// and lag the broadcast). A legacy `Paused + Stream` (only an old build could
/// create it; an in-memory session never survives restart) thus resolves to
/// stop, correctly.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ToggleAction {
    StopStream,
    StopPreview,
    PauseFile,
    ResumeFile,
    ResumeLast,
    Noop,
}

pub(crate) fn decide_toggle(source: Option<&PlaybackSource>, state: PlaybackState) -> ToggleAction {
    match source {
        Some(PlaybackSource::Stream { .. }) => ToggleAction::StopStream,
        Some(PlaybackSource::Preview { .. }) => ToggleAction::StopPreview,
        Some(PlaybackSource::File { .. }) => match state {
            PlaybackState::Playing => ToggleAction::PauseFile,
            PlaybackState::Paused => ToggleAction::ResumeFile,
            // A source implies a live session; Stopped-with-source cannot occur.
            PlaybackState::Stopped => ToggleAction::Noop,
        },
        None => ToggleAction::ResumeLast,
    }
}

/// What cold-start `Ctrl+Shift+K` resumes. `Silent` clears the record without an
/// announce (nothing saved, or a dangling discriminator — impl-decision #1);
/// `Unavailable` announces then clears (stale target: stream deleted / file moved).
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ColdStart {
    PlayStream,
    PlayFile,
    Unavailable,
    Silent,
}

pub(crate) fn decide_cold_start(
    last_active: Option<&LastActive>,
    has_stream_id: bool,
    stream_in_profile: bool,
    has_file: bool,
    file_exists: bool,
) -> ColdStart {
    match last_active {
        None => ColdStart::Silent,
        Some(LastActive::Stream) => {
            if !has_stream_id {
                ColdStart::Silent // dangling discriminator
            } else if stream_in_profile {
                ColdStart::PlayStream
            } else {
                ColdStart::Unavailable // stream deleted from profile
            }
        }
        Some(LastActive::File) => {
            if !has_file {
                ColdStart::Silent // dangling discriminator
            } else if file_exists {
                ColdStart::PlayFile
            } else {
                ColdStart::Unavailable // file moved / deleted
            }
        }
    }
}

/// Update the dormant resume fields from a live status. Stream/File set the
/// discriminator (+ id / path+position); Preview and None are transient and
/// leave the session untouched. Shared by the runtime persistence helper and
/// `graceful_shutdown`.
pub(crate) fn apply_session_snapshot(session: &mut PlayerSession, status: &PlayerStatus) {
    match &status.source {
        Some(PlaybackSource::Stream { stream_id }) => {
            session.last_active = Some(LastActive::Stream);
            session.last_stream_id = Some(stream_id.clone());
        }
        Some(PlaybackSource::File { path }) => {
            session.last_active = Some(LastActive::File);
            session.last_file_position = Some(FilePosition {
                path: path.clone(),
                position_ms: status.position_ms.unwrap_or(0),
            });
        }
        _ => {} // Preview / None: do not persist
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stream() -> PlaybackSource { PlaybackSource::Stream { stream_id: "s1".into() } }
    fn file() -> PlaybackSource { PlaybackSource::File { path: "rec/a.mp3".into() } }
    fn preview() -> PlaybackSource {
        PlaybackSource::Preview { url: "http://x".into(), name: "X".into() }
    }
    fn status(source: Option<PlaybackSource>, position_ms: Option<u64>) -> PlayerStatus {
        PlayerStatus {
            state: PlaybackState::Playing,
            source,
            volume: 0.5,
            position_ms,
            duration_ms: None,
        }
    }

    #[test]
    fn stream_stops_whether_playing_or_paused() {
        assert_eq!(decide_toggle(Some(&stream()), PlaybackState::Playing), ToggleAction::StopStream);
        assert_eq!(decide_toggle(Some(&stream()), PlaybackState::Paused), ToggleAction::StopStream);
    }

    #[test]
    fn preview_stops() {
        assert_eq!(decide_toggle(Some(&preview()), PlaybackState::Playing), ToggleAction::StopPreview);
    }

    #[test]
    fn file_pauses_and_resumes() {
        assert_eq!(decide_toggle(Some(&file()), PlaybackState::Playing), ToggleAction::PauseFile);
        assert_eq!(decide_toggle(Some(&file()), PlaybackState::Paused), ToggleAction::ResumeFile);
    }

    #[test]
    fn no_source_resumes_last() {
        assert_eq!(decide_toggle(None, PlaybackState::Stopped), ToggleAction::ResumeLast);
    }

    #[test]
    fn cold_start_nothing_saved_is_silent() {
        assert_eq!(decide_cold_start(None, false, false, false, false), ColdStart::Silent);
    }

    #[test]
    fn cold_start_stream_valid_plays() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::Stream), true, true, false, false),
            ColdStart::PlayStream
        );
    }

    #[test]
    fn cold_start_stream_deleted_is_unavailable() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::Stream), true, false, false, false),
            ColdStart::Unavailable
        );
    }

    #[test]
    fn cold_start_stream_dangling_is_silent() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::Stream), false, false, false, false),
            ColdStart::Silent
        );
    }

    #[test]
    fn cold_start_file_valid_plays() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::File), false, false, true, true),
            ColdStart::PlayFile
        );
    }

    #[test]
    fn cold_start_file_moved_is_unavailable() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::File), false, false, true, false),
            ColdStart::Unavailable
        );
    }

    #[test]
    fn cold_start_file_dangling_is_silent() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::File), false, false, false, false),
            ColdStart::Silent
        );
    }

    #[test]
    fn snapshot_records_stream_id() {
        let mut s = PlayerSession::default();
        apply_session_snapshot(&mut s, &status(Some(stream()), None));
        assert_eq!(s.last_active, Some(LastActive::Stream));
        assert_eq!(s.last_stream_id.as_deref(), Some("s1"));
    }

    #[test]
    fn snapshot_records_file_position() {
        let mut s = PlayerSession::default();
        apply_session_snapshot(&mut s, &status(Some(file()), Some(4200)));
        assert_eq!(s.last_active, Some(LastActive::File));
        let fp = s.last_file_position.unwrap();
        assert_eq!(fp.path, "rec/a.mp3");
        assert_eq!(fp.position_ms, 4200);
    }

    #[test]
    fn snapshot_ignores_preview_and_none() {
        let mut s = PlayerSession::default();
        apply_session_snapshot(&mut s, &status(Some(preview()), None));
        apply_session_snapshot(&mut s, &status(None, None));
        assert_eq!(s.last_active, None);
        assert!(s.last_stream_id.is_none());
        assert!(s.last_file_position.is_none());
    }
}
