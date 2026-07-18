//! The single source-aware playback-toggle entry point (Ctrl+Shift+K and the
//! tray Play/Pause item), plus cold-start resume and the persistence that
//! revives the dormant `PlayerSession` resume fields.
//!
//! Pure decision logic lives in `decide_toggle` / `decide_cold_start` and is
//! unit-tested here; the async orchestration (Task 4) is thin glue over them.

use crate::app_state::AppState;
use crate::player::engine::{PlaybackSource, PlaybackState, PlayerStatus};
use crate::profile::{FilePosition, LastActive, PlayerSession};
use crate::settings::ResumeFileFrom;
use tauri::{AppHandle, Emitter, Manager};

/// Cold-start hints the webview can't derive from `player-status`. The webview
/// localizes `kind` via Paraglide (backend never sends ready-made strings).
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackAnnounce {
    kind: String,
    name: Option<String>,
    position_ms: Option<u64>,
}

fn emit_announce(app: &AppHandle, kind: &str, name: Option<String>) {
    let payload = PlaybackAnnounce { kind: kind.to_string(), name, position_ms: None };
    if let Err(e) = app.emit("player-announce", payload) {
        log::warn!("playback: failed to emit player-announce: {e}");
    }
}

/// "Playing — X, from mm:ss": emitted BEFORE `play_file` (mirrors "connecting"
/// before `play_stream`) so the webview arms the started-suppression in time.
fn emit_resuming(app: &AppHandle, name: String, position_ms: u64) {
    let payload = PlaybackAnnounce {
        kind: "resuming".to_string(),
        name: Some(name),
        position_ms: Some(position_ms),
    };
    if let Err(e) = app.emit("player-announce", payload) {
        log::warn!("playback: failed to emit player-announce: {e}");
    }
}

/// What `toggle_playback` should do for a given live status. Branch by source
/// **type first** (impl-decision #4): a `Stream` is stopped whether Playing or
/// Paused — resuming a live buffer is meaningless (you'd replay a stale buffer
/// and lag the broadcast). A `Paused + Stream` state can still arise at runtime
/// (the player-panel Pause button and the SMTC Pause key both pause a live
/// stream), so this arm handles it explicitly and resolves it to stop.
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

/// How the cold-start `PlayFile` branch starts the file. `FromStart` = play at 0,
/// no seek, no position announce (mode `start`, or a saved position of 0);
/// `FromPosition` = announce "resuming" then play + seek.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum FileResumePlan {
    FromStart,
    FromPosition { position_ms: u64 },
}

pub(crate) fn plan_file_resume(mode: ResumeFileFrom, position_ms: u64) -> FileResumePlan {
    match mode {
        ResumeFileFrom::Start => FileResumePlan::FromStart,
        ResumeFileFrom::Position if position_ms > 0 => FileResumePlan::FromPosition { position_ms },
        ResumeFileFrom::Position => FileResumePlan::FromStart,
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

/// Snapshot the current live status into the active profile's `player_session`
/// and save. No-op for Preview/None (transient). Called on play-start and before
/// a file pause/stop, so the dormant resume fields stay current. Position writes
/// happen only on these transitions — never per progress-tick.
pub async fn persist_session_snapshot(app: &AppHandle) {
    let state = app.state::<AppState>();
    let status = state.player.get_status().await;
    if !matches!(
        status.source,
        Some(PlaybackSource::Stream { .. }) | Some(PlaybackSource::File { .. })
    ) {
        return;
    }
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        apply_session_snapshot(&mut profile.player_session, &status);
        profile.clone()
    };
    match tokio::task::spawn_blocking(move || snapshot.save()).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => log::warn!("playback: failed to save session snapshot: {e}"),
        Err(e) => log::warn!("playback: session snapshot save task panicked: {e}"),
    }
}

/// Clear the resume record (stale/dangling target). Save follows the same
/// clone-then-blocking-save pattern.
async fn clear_last_session(app: &AppHandle) {
    let state = app.state::<AppState>();
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        profile.player_session.last_active = None;
        profile.player_session.last_stream_id = None;
        profile.player_session.last_file_position = None;
        profile.clone()
    };
    match tokio::task::spawn_blocking(move || snapshot.save()).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => log::warn!("playback: failed to clear session record: {e}"),
        Err(e) => log::warn!("playback: clear session task panicked: {e}"),
    }
}

/// The single Ctrl+Shift+K / tray Play-Pause entry point. Debounced through the
/// cell shared with the hotkey and SMTC (a hotkey + media key near-simultaneous
/// must yield one action).
pub async fn toggle_playback(app: &AppHandle) {
    if crate::shortcuts::recently_fired(&crate::shortcuts::LAST_TOGGLE_PLAYBACK_MS) {
        log::debug!("playback: toggle_playback ignored (debounce)");
        return;
    }
    let state = app.state::<AppState>();
    let status = state.player.get_status().await;
    match decide_toggle(status.source.as_ref(), status.state.clone()) {
        ToggleAction::StopStream => {
            // Discriminator already set at play-start; stream has no position.
            let _ = state.player.stop_playback(app).await;
        }
        ToggleAction::StopPreview => {
            // Preview is transient — never persisted.
            let _ = state.player.stop_playback(app).await;
        }
        ToggleAction::PauseFile => {
            persist_session_snapshot(app).await; // capture position before pause
            let _ = state.player.pause_playback(app).await;
        }
        ToggleAction::ResumeFile => {
            let _ = state.player.resume_playback(app).await;
        }
        ToggleAction::ResumeLast => resume_last(app).await,
        ToggleAction::Noop => log::info!("playback: toggle — nothing to do"),
    }
}

/// Cold-start: resume the newest saved source (impl "найновіше джерело" —
/// `last_active` is the single marker). Stale target → announce + clear;
/// dangling/empty → silent + clear.
async fn resume_last(app: &AppHandle) {
    let state = app.state::<AppState>();

    // Read everything needed under one short read-lock.
    let (last_active, last_stream_id, last_file, stream) = {
        let profile = state.active_profile.read().await;
        let ps = &profile.player_session;
        let stream = ps.last_stream_id.as_ref().and_then(|id| {
            profile.streams.iter().find(|s| &s.id == id)
                .map(|s| (s.id.clone(), s.url.clone(), s.name.clone()))
        });
        (ps.last_active.clone(), ps.last_stream_id.clone(), ps.last_file_position.clone(), stream)
    };

    let has_stream_id = last_stream_id.is_some();
    let stream_in_profile = stream.is_some();
    let has_file = last_file.is_some();
    // The `exists()` stat is blocking — keep it off the async executor thread.
    let file_exists = match last_file.as_ref() {
        Some(f) => {
            let path = f.path.clone();
            tokio::task::spawn_blocking(move || std::path::Path::new(&path).exists())
                .await
                .unwrap_or(false)
        }
        None => false,
    };

    match decide_cold_start(last_active.as_ref(), has_stream_id, stream_in_profile, has_file, file_exists) {
        ColdStart::PlayStream => {
            let (id, url, name) = stream.expect("PlayStream implies Some(stream)");
            // Before the ≤15 s blocking connect. The webview arms a one-shot
            // suppression so the eventual stopped→playing "started" for this
            // source is not announced on top of "Connecting — X".
            emit_announce(app, "connecting", Some(name));
            match state.player.play_stream(id, url, app).await {
                Ok(()) => persist_session_snapshot(app).await,
                Err(e) => {
                    log::warn!("playback: cold-start stream failed: {e}");
                    emit_announce(app, "error", None); // transient — keep the record
                }
            }
        }
        ColdStart::PlayFile => {
            let fp = last_file.expect("PlayFile implies Some(file)");
            let mode = state.settings.read().await.resume_file_from;
            let plan = plan_file_resume(mode, fp.position_ms);
            if let FileResumePlan::FromPosition { position_ms } = &plan {
                // Basename must match the webview's `nameOf()` for a file source
                // (path basename with extension) or the started-suppression
                // won't engage and NVDA would hear a duplicate.
                let name = std::path::Path::new(&fp.path)
                    .file_name()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| fp.path.clone());
                emit_resuming(app, name, *position_ms);
            }
            match state.player.play_file(fp.path.clone(), app).await {
                Ok(()) => {
                    if let FileResumePlan::FromPosition { position_ms } = plan {
                        if let Err(e) = state.player.seek_playback(position_ms, app).await {
                            // Best-effort: stay at the start rather than fail the resume.
                            log::warn!("playback: cold-start seek failed, staying at start: {e}");
                        }
                    }
                    persist_session_snapshot(app).await;
                    // FromStart: `playback_started` (stopped→playing, file) announces
                    // webview-side, unchanged.
                }
                Err(e) => {
                    log::warn!("playback: cold-start file failed: {e}");
                    emit_announce(app, "error", None); // keep the record; clears webview pending
                }
            }
        }
        ColdStart::Unavailable => {
            emit_announce(app, "unavailable", None);
            clear_last_session(app).await;
        }
        ColdStart::Silent => {
            // Nothing saved or dangling discriminator — clear silently.
            clear_last_session(app).await;
        }
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
    fn file_resume_position_mode_resumes_from_saved_position() {
        assert_eq!(
            plan_file_resume(ResumeFileFrom::Position, 4200),
            FileResumePlan::FromPosition { position_ms: 4200 }
        );
    }

    #[test]
    fn file_resume_start_mode_plays_from_zero() {
        assert_eq!(plan_file_resume(ResumeFileFrom::Start, 4200), FileResumePlan::FromStart);
    }

    #[test]
    fn file_resume_position_zero_behaves_like_start() {
        // No seek and no "resuming from 0:00" announce — same UX as a fresh start.
        assert_eq!(plan_file_resume(ResumeFileFrom::Position, 0), FileResumePlan::FromStart);
    }

    #[test]
    fn paused_file_resume_is_not_gated_by_resume_setting() {
        // Regression guard (spec §Не в скоупі): in-session pause→resume routes
        // through ToggleAction::ResumeFile → resume_playback and never consults
        // resume_file_from; only ColdStart::PlayFile calls plan_file_resume.
        assert_eq!(decide_toggle(Some(&file()), PlaybackState::Paused), ToggleAction::ResumeFile);
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
