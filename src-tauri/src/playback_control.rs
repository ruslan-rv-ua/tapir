//! The single source-aware playback-toggle entry point (Ctrl+Shift+K and the
//! tray's primary item), plus resuming the last source and the persistence
//! that revives the dormant `PlayerSession` resume fields.
//!
//! Pure decision logic lives in `decide_toggle` / `decide_resume_last` and is
//! unit-tested here; the async orchestration (Task 4) is thin glue over them.

use crate::app_state::AppState;
use crate::player::engine::{PlaybackSource, PlaybackState, PlayerStatus};
use crate::profile::{FilePosition, LastActive, PlayerSession};
use crate::profile::ResumeFileFrom;
use crate::tray::notify::ResumeFailure;
use tauri::{AppHandle, Emitter, Manager};

/// What the webview is being asked to say. A closed set, not a free string:
/// every consumer branches on it, nothing parses it, and it only ever travels
/// outwards — so the type can say what the TS union already said by hand
/// (`tauri-ts-type-drift`, decision 9). `Serialize` only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AnnounceKind {
    Connecting,
    Unavailable,
    Error,
    Resuming,
    Volume,
}

/// Hints the webview can't derive from `player-status`. The webview localizes
/// `kind` via Paraglide (backend never sends ready-made strings).
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackAnnounce {
    kind: AnnounceKind,
    name: Option<String>,
    position_ms: Option<u64>,
}

/// Ask the webview to say something it could not have worked out on its own.
/// `pub(crate)` for `shortcuts.rs`: the global volume keys change the level here
/// in Rust and only ASK for the sentence — the number itself the webview reads
/// off its own `$playerStatus`, so no level travels in the payload.
pub(crate) fn emit_announce(app: &AppHandle, kind: AnnounceKind, name: Option<String>) {
    let payload = PlaybackAnnounce { kind, name, position_ms: None };
    if let Err(e) = app.emit("player-announce", payload) {
        log::warn!("playback: failed to emit player-announce: {e}");
    }
}

/// "Playing — X, from mm:ss": emitted BEFORE `play_file` (mirrors "connecting"
/// before `play_stream`) so the webview arms the started-suppression in time.
fn emit_resuming(app: &AppHandle, name: String, position_ms: u64) {
    let payload = PlaybackAnnounce {
        kind: AnnounceKind::Resuming,
        name: Some(name),
        position_ms: Some(position_ms),
    };
    if let Err(e) = app.emit("player-announce", payload) {
        log::warn!("playback: failed to emit player-announce: {e}");
    }
}

/// What `toggle_playback` should do for a given live status. Branch by source
/// **type first** (impl-decision #4): live sound — a `Stream` or a `Preview` —
/// is stopped whatever the state, because resuming it is meaningless (you'd
/// replay a stale buffer and lag the broadcast). Only a `File` reads the state
/// at all.
///
/// Nothing in the app pauses live sound any more: the player's primary control,
/// this toggle and the SMTC `Pause` key all stop it (`PlaybackSource::is_live`).
/// The `Paused` arm therefore belongs to `File` alone — a paused live source is
/// unreachable, and the two stop arms below would resolve it anyway.
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

/// What `resume_last` does with the last source — for each of its callers: the
/// tray item and `Ctrl+Shift+K` when nothing plays, and startup autoplay.
/// `NoLastSource` clears the record without an announce (nothing saved, or a
/// dangling discriminator — impl-decision #1; `PlayerSession::last_source`
/// reads it, and the tray greys its item on that same reading); `Unavailable`
/// answers then clears (stale target: stream deleted / file moved).
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ResumeLastAction {
    PlayStream,
    PlayFile,
    Unavailable,
    NoLastSource,
}

pub(crate) fn decide_resume_last(
    session: &PlayerSession,
    stream_in_profile: bool,
    file_exists: bool,
) -> ResumeLastAction {
    match session.last_source() {
        None => ResumeLastAction::NoLastSource, // nothing saved, or dangling
        Some(LastActive::Stream) => {
            if stream_in_profile {
                ResumeLastAction::PlayStream
            } else {
                ResumeLastAction::Unavailable // stream deleted from profile
            }
        }
        Some(LastActive::File) => {
            if file_exists {
                ResumeLastAction::PlayFile
            } else {
                ResumeLastAction::Unavailable // file moved / deleted
            }
        }
    }
}

/// How the `PlayFile` branch of `resume_last` starts the file. `FromStart` = play at 0,
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
    let committed = state
        .commit_profile(|profile| {
            apply_session_snapshot(&mut profile.player_session, &status);
            crate::store::Commit::Save(())
        })
        .await;
    if let Err(e) = committed {
        log::warn!("playback: failed to save session snapshot: {e}");
    }
}

/// Clear the resume record (stale/dangling target). Save follows the same
/// clone-then-blocking-save pattern.
async fn clear_last_session(app: &AppHandle) {
    let state = app.state::<AppState>();
    let committed = state
        .commit_profile(|profile| {
            profile.player_session.last_active = None;
            profile.player_session.last_stream_id = None;
            profile.player_session.last_file_position = None;
            crate::store::Commit::Save(())
        })
        .await;
    if let Err(e) = committed {
        log::warn!("playback: failed to clear session record: {e}");
    }
    // With nothing recorded the tray greys "Play" — but the menu is built ahead
    // of the click, and clearing the record changes no player state, so nothing
    // else would rebuild it.
    crate::tray::notify_state_changed(app);
}

/// The single Ctrl+Shift+K / tray primary-item entry point. Debounced through the
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

/// One-shot latch so startup autoplay fires at most once per app launch.
/// `frontend_ready` is idempotent (a webview reload calls it again); without this
/// a reload after a manual stop would restart playback. Held as managed state,
/// like `StartupNotice`.
pub struct AutoplayGuard(std::sync::atomic::AtomicBool);

impl Default for AutoplayGuard {
    fn default() -> Self {
        Self::new()
    }
}

impl AutoplayGuard {
    pub fn new() -> Self {
        Self(std::sync::atomic::AtomicBool::new(true))
    }
    /// Returns `true` exactly once — on the first call — and `false` thereafter.
    pub fn take(&self) -> bool {
        self.0.swap(false, std::sync::atomic::Ordering::SeqCst)
    }
}

/// A file's name as the webview's `nameOf()` gives it for a file source: the
/// path's basename with its extension. The "resuming" announce must match it,
/// or the started-suppression won't engage and NVDA would hear a duplicate.
fn file_source_name(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

/// Answer a failed resume (backlog tray-cannot-resume-last §4, ADR 2026-09-01
/// §3). The announcement goes whatever the focus: the webview also drops its
/// pending "Connecting" on it, and one left unread in a background window does
/// no harm. Out of the foreground nobody reads the live region, and a failure
/// leaves the ear nothing to hear, so a background-feedback toast answers
/// there. Deciding here, in the action's own module, answers every caller at
/// once — the tray item, `Ctrl+Shift+K` and startup autoplay. `name` titles the
/// toast: the source's name when it is known.
fn answer_failure(app: &AppHandle, failure: ResumeFailure, name: Option<&str>) {
    let kind = match failure {
        ResumeFailure::Unavailable => AnnounceKind::Unavailable,
        ResumeFailure::Error => AnnounceKind::Error,
    };
    emit_announce(app, kind, None);
    if !crate::tray::window_in_foreground(app) {
        crate::tray::notify::notify_resume_failure(app, name, failure);
    }
}

/// Resume the last source — the newest saved one (impl "найновіше джерело" —
/// `last_active` is the single marker). Stale target → answer + clear;
/// dangling/empty → silent + clear; a failed start is answered and keeps the
/// record. A start is never answered out of the foreground: the ear hears it.
/// `pub(crate)` so `frontend_ready` can drive the same resume path used by
/// Ctrl+Shift+K and the tray item.
pub(crate) async fn resume_last(app: &AppHandle) {
    let state = app.state::<AppState>();

    // Read everything needed under one short read-lock.
    let (session, stream) = {
        let profile = state.active_profile.read().await;
        let session = profile.player_session.clone();
        let stream = session.last_stream_id.as_ref().and_then(|id| {
            profile.streams.iter().find(|s| &s.id == id)
                .map(|s| (s.id.clone(), s.url.clone(), s.name.clone()))
        });
        (session, stream)
    };

    let stream_in_profile = stream.is_some();
    // The `exists()` stat is blocking — keep it off the async executor thread.
    let file_exists = match session.last_file_position.as_ref() {
        Some(f) => {
            let path = f.path.clone();
            tokio::task::spawn_blocking(move || std::path::Path::new(&path).exists())
                .await
                .unwrap_or(false)
        }
        None => false,
    };

    match decide_resume_last(&session, stream_in_profile, file_exists) {
        ResumeLastAction::PlayStream => {
            let (id, url, name) = stream.expect("PlayStream implies Some(stream)");
            // Before the ≤15 s blocking connect. The webview arms a one-shot
            // suppression so the eventual stopped→playing "started" for this
            // source is not announced on top of "Connecting — X". Out of the
            // foreground this is the whole answer until the station sounds: up
            // to 15 s of silence, accepted over a toast on every good press.
            emit_announce(app, AnnounceKind::Connecting, Some(name.clone()));
            match state.player.play_stream(id, url, app).await {
                Ok(()) => persist_session_snapshot(app).await,
                Err(e) => {
                    log::warn!("playback: resume-last stream failed: {e}");
                    // Transient — keep the record.
                    answer_failure(app, ResumeFailure::Error, Some(&name));
                }
            }
        }
        ResumeLastAction::PlayFile => {
            let fp = session.last_file_position.clone().expect("PlayFile implies Some(file)");
            let name = file_source_name(&fp.path);
            let plan = plan_file_resume(session.resume_file_from, fp.position_ms);
            if let FileResumePlan::FromPosition { position_ms } = &plan {
                emit_resuming(app, name.clone(), *position_ms);
            }
            match state.player.play_file(fp.path.clone(), app).await {
                Ok(()) => {
                    if let FileResumePlan::FromPosition { position_ms } = plan
                        && let Err(e) = state.player.seek_playback(position_ms, app).await
                    {
                        // Best-effort: stay at the start rather than fail the resume.
                        log::warn!("playback: resume-last seek failed, staying at start: {e}");
                    }
                    persist_session_snapshot(app).await;
                    // FromStart: `playback_started` (stopped→playing, file) announces
                    // webview-side, unchanged.
                }
                Err(e) => {
                    log::warn!("playback: resume-last file failed: {e}");
                    // Keep the record; the announce clears the webview's pending.
                    answer_failure(app, ResumeFailure::Error, Some(&name));
                }
            }
        }
        ResumeLastAction::Unavailable => {
            // A moved file still has its name; a stream deleted from the
            // profile took its name with it.
            let name = match session.last_source() {
                Some(LastActive::File) => {
                    session.last_file_position.as_ref().map(|f| file_source_name(&f.path))
                }
                _ => None,
            };
            answer_failure(app, ResumeFailure::Unavailable, name.as_deref());
            clear_last_session(app).await;
        }
        ResumeLastAction::NoLastSource => {
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
    fn autoplay_guard_fires_exactly_once() {
        let g = AutoplayGuard::new();
        assert!(g.take(), "first take arms autoplay");
        assert!(!g.take(), "reload must not re-fire autoplay");
        assert!(!g.take());
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

    fn remembered_stream() -> PlayerSession {
        PlayerSession {
            last_active: Some(LastActive::Stream),
            last_stream_id: Some("s1".into()),
            ..Default::default()
        }
    }
    fn remembered_file() -> PlayerSession {
        PlayerSession {
            last_active: Some(LastActive::File),
            last_file_position: Some(FilePosition { path: "rec/a.mp3".into(), position_ms: 4200 }),
            ..Default::default()
        }
    }

    #[test]
    fn resume_last_with_nothing_saved_has_no_last_source() {
        assert_eq!(
            decide_resume_last(&PlayerSession::default(), false, false),
            ResumeLastAction::NoLastSource
        );
    }

    #[test]
    fn resume_last_stream_valid_plays() {
        assert_eq!(decide_resume_last(&remembered_stream(), true, false), ResumeLastAction::PlayStream);
    }

    #[test]
    fn resume_last_stream_deleted_is_unavailable() {
        assert_eq!(decide_resume_last(&remembered_stream(), false, false), ResumeLastAction::Unavailable);
    }

    #[test]
    fn resume_last_stream_dangling_has_no_last_source() {
        let dangling = PlayerSession { last_stream_id: None, ..remembered_stream() };
        assert_eq!(decide_resume_last(&dangling, false, false), ResumeLastAction::NoLastSource);
    }

    #[test]
    fn resume_last_file_valid_plays() {
        assert_eq!(decide_resume_last(&remembered_file(), false, true), ResumeLastAction::PlayFile);
    }

    #[test]
    fn resume_last_file_moved_is_unavailable() {
        assert_eq!(decide_resume_last(&remembered_file(), false, false), ResumeLastAction::Unavailable);
    }

    #[test]
    fn resume_last_file_dangling_has_no_last_source() {
        let dangling = PlayerSession { last_file_position: None, ..remembered_file() };
        assert_eq!(decide_resume_last(&dangling, false, false), ResumeLastAction::NoLastSource);
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
        // resume_file_from; only ResumeLastAction::PlayFile calls plan_file_resume.
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
