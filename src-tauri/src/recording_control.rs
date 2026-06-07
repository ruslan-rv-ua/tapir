//! Global recording toggle: decide start-vs-stop and orchestrate the manager.
//!
//! Used by the global `toggle_recording` shortcut. The pure helpers
//! (`is_active`, `count_active`, `decide`) are unit-tested; `toggle_all` is
//! thin orchestration over `StreamManager::{start_all, stop_all}` and is
//! exercised via manual/integration runs.

use crate::app_state::AppState;
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

/// Toggle recording for the whole active profile. Reads the manager to decide,
/// then reuses `stop_all` / `start_all`. Returns the outcome for the toast.
/// (Implemented in Task 3 — left stubbed here.)
pub async fn toggle_all(_state: &AppState) -> ToggleOutcome {
    todo!()
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

    fn status(state: StreamState) -> StreamStatus {
        StreamStatus {
            stream_id: "x".to_string(),
            state,
            current_track: None,
            recording_started_at: None,
            bytes_recorded: 0,
            tracks_recorded: 0,
            error: None,
            reconnect_attempt: None,
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
}
