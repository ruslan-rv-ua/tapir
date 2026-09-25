//! Global recording toggle: decide start-vs-stop and orchestrate the manager.
//!
//! Used by the global `toggle_recording` shortcut. The pure helpers
//! (`is_active`, `count_active`, `decide`, `start_outcome`) are unit-tested;
//! `toggle_all` is thin orchestration over `check_disk_space` and
//! `StreamManager::{start_all, stop_all}` and is exercised via
//! manual/integration runs. Its start goes through the same disk-space check
//! as every other start path. `stop_all_now` (global stop-all shortcut, KB-12)
//! is likewise thin orchestration.

use std::collections::HashSet;
use tauri::{AppHandle, Manager};

use crate::app_state::AppState;
use crate::commands::stream_commands::check_disk_space;
use crate::errors::RadioError;
use crate::stream::manager::{StreamState, StreamStatus};

/// Result of a toggle, used to build the NVDA toast.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToggleOutcome {
    /// `n` streams were newly started.
    Started(usize),
    /// `n` streams were active and got stopped.
    Stopped(usize),
    /// Start was requested but the active profile has nothing to start.
    NothingToStart,
    /// Start was refused: free space on the recordings volume is below the
    /// profile's disk threshold. Nothing was started.
    DiskSpaceLow,
}

/// Which direction the toggle goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToggleAction {
    Start,
    Stop,
}

/// A stream counts as "active" while a recording task is in flight:
/// recording, connecting, or reconnecting. `Error` streams have no live task
/// (they are dropped from the manager's `entries`), so they are not active and
/// `start_all` will restart them.
pub fn is_active(state: &StreamState) -> bool {
    matches!(
        state,
        StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting
    )
}

/// Count how many of the given statuses are active (see [`is_active`]).
pub fn count_active(statuses: &[StreamStatus]) -> usize {
    statuses.iter().filter(|s| is_active(&s.state)).count()
}

/// Toggle rule: if anything is active, one press stops everything; otherwise
/// it starts everything in the active profile.
pub fn decide(active_count: usize) -> ToggleAction {
    if active_count > 0 {
        ToggleAction::Stop
    } else {
        ToggleAction::Start
    }
}

/// Outcome of the start branch: the disk verdict gates the start, and `start`
/// runs only when the disk allows it. An empty profile below the threshold is
/// a refusal too, as in `start_all_recordings`. Only `DiskSpaceLow` refuses:
/// the toast names the disk, so another error must not borrow that text —
/// it fails open, like `check_disk_space` itself when it cannot measure.
pub fn start_outcome(
    disk: Result<(), RadioError>,
    start: impl FnOnce() -> usize,
) -> ToggleOutcome {
    if matches!(disk, Err(RadioError::DiskSpaceLow { .. })) {
        return ToggleOutcome::DiskSpaceLow;
    }
    match start() {
        0 => ToggleOutcome::NothingToStart,
        n => ToggleOutcome::Started(n),
    }
}

/// Pick (stream_id, session_id) of active recordings that pass the optional id
/// filter (None = all active), in status order. Pure — unit-tested without an
/// AppHandle.
fn active_targets(statuses: &[StreamStatus], filter: Option<&HashSet<String>>) -> Vec<(String, u64)> {
    statuses
        .iter()
        .filter(|s| is_active(&s.state) && filter.is_none_or(|f| f.contains(&s.stream_id)))
        .map(|s| (s.stream_id.clone(), s.session_id))
        .collect()
}

/// Stop active recordings passing `filter` (None = all). Returns how many were
/// stopped. session_ids are read BEFORE cancel (§3.3 — entries vanish from the
/// manager async after cancel), then the shared `notify_manual_stop` hook runs.
/// `None` keeps the original whole-profile semantics (`mgr.stop_all()` cancels
/// every entry); `Some` cancels only the filtered active ids.
pub async fn stop_now(app: &AppHandle, filter: Option<&HashSet<String>>) -> usize {
    let state = app.state::<AppState>();
    let targets: Vec<(String, u64)> = {
        let mut mgr = state.stream_manager.write().await;
        let targets = active_targets(&mgr.get_all_statuses(), filter);
        match filter {
            None => mgr.stop_all(),
            Some(_) => {
                for (stream_id, _) in &targets {
                    let _ = mgr.stop_recording(stream_id);
                }
            }
        }
        targets
    };
    for (stream_id, session_id) in &targets {
        crate::scheduler::timer::notify_manual_stop(app, stream_id, *session_id).await;
    }
    targets.len()
}

/// Stop all active recordings unconditionally; returns how many were active.
/// Single path for every whole-profile stop-all surface (tray, global hotkeys).
pub async fn stop_all_now(app: &AppHandle) -> usize {
    stop_now(app, None).await
}

/// Toggle recording for the whole active profile. Reads the manager to decide,
/// then reuses `stop_all_now`, or `check_disk_space` followed by `start_all`
/// (below the threshold nothing starts). Returns the outcome for the toast.
pub async fn toggle_all(app: &AppHandle) -> ToggleOutcome {
    let state = app.state::<AppState>();
    let active = {
        let mgr = state.stream_manager.read().await;
        count_active(&mgr.get_all_statuses())
    };

    match decide(active) {
        ToggleAction::Stop => ToggleOutcome::Stopped(stop_all_now(app).await),
        ToggleAction::Start => {
            let disk = check_disk_space(&state).await;
            let (streams, settings) = {
                let profile = state.active_profile.read().await;
                (profile.streams.clone(), profile.recording.clone())
            };
            let mgr_arc = state.stream_manager.clone();
            let mut mgr = mgr_arc.write().await;
            start_outcome(disk, || mgr.start_all(streams, settings, mgr_arc.clone()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_active_covers_in_flight_states_only() {
        assert!(is_active(&StreamState::Recording));
        assert!(is_active(&StreamState::Connecting));
        assert!(is_active(&StreamState::Reconnecting));
        assert!(!is_active(&StreamState::Idle));
        assert!(!is_active(&StreamState::Error));
    }

    #[test]
    fn decide_stops_when_anything_active() {
        assert_eq!(decide(1), ToggleAction::Stop);
        assert_eq!(decide(5), ToggleAction::Stop);
    }

    #[test]
    fn decide_starts_when_nothing_active() {
        assert_eq!(decide(0), ToggleAction::Start);
    }

    /// Нижче порогу диска до менеджера не доходимо: замикання старту не
    /// викликається взагалі, а не просто повертає нуль.
    #[test]
    fn start_outcome_refuses_below_disk_threshold_without_starting() {
        let mut called = false;
        let refusal = RadioError::DiskSpaceLow { free_bytes: 1, threshold_gb: 5 };
        let outcome = start_outcome(Err(refusal), || { called = true; 3 });
        assert_eq!(outcome, ToggleOutcome::DiskSpaceLow);
        assert!(!called, "старт не мав початися");
    }

    #[test]
    fn start_outcome_counts_started_streams_when_disk_allows() {
        assert_eq!(start_outcome(Ok(()), || 3), ToggleOutcome::Started(3));
        assert_eq!(start_outcome(Ok(()), || 0), ToggleOutcome::NothingToStart);
    }

    fn status(state: StreamState) -> StreamStatus {
        StreamStatus {
            stream_id: "x".to_string(),
            state,
            current_track: None,
            recording_started_at: None,
            bytes_recorded: 0,
            tracks_recorded: 0,
            error: None,
            reconnect: None,
            session_id: 0,
        }
    }

    #[test]
    fn count_active_counts_only_in_flight() {
        let statuses = vec![
            status(StreamState::Recording),
            status(StreamState::Connecting),
            status(StreamState::Reconnecting),
            status(StreamState::Idle),
            status(StreamState::Error),
        ];
        assert_eq!(count_active(&statuses), 3);
    }

    #[test]
    fn count_active_empty_is_zero() {
        assert_eq!(count_active(&[]), 0);
    }

    fn st(id: &str, state: StreamState, session: u64) -> StreamStatus {
        StreamStatus {
            stream_id: id.to_string(), state, current_track: None,
            recording_started_at: None, bytes_recorded: 0, tracks_recorded: 0,
            error: None, reconnect: None, session_id: session,
        }
    }

    #[test]
    fn active_targets_filters_by_state_and_optional_id() {
        let statuses = vec![
            st("a", StreamState::Recording, 1),
            st("b", StreamState::Connecting, 2),
            st("c", StreamState::Idle, 3),        // not active
            st("d", StreamState::Reconnecting, 4),
        ];
        // None → every active stream (a, b, d), in order.
        let all: Vec<String> = active_targets(&statuses, None).into_iter().map(|(id, _)| id).collect();
        assert_eq!(all, vec!["a", "b", "d"]);
        // Filter {a,c,d} → active ∩ filter = a, d (c is idle; b not in filter).
        let set: std::collections::HashSet<String> =
            ["a", "c", "d"].iter().map(|s| s.to_string()).collect();
        let some: Vec<String> = active_targets(&statuses, Some(&set)).into_iter().map(|(id, _)| id).collect();
        assert_eq!(some, vec!["a", "d"]);
    }
}
