//! Tray menu and tooltip construction (pure functions).

use crate::player::engine::PlaybackState;
use crate::tray::MenuSnapshot;

const MAX_TOOLTIP_CHARS: usize = 127;

/// Build the Windows tray tooltip from a snapshot.
pub fn tooltip(snap: &MenuSnapshot) -> String {
    let playing = matches!(snap.player_state, PlaybackState::Playing);
    let station = snap.now_playing_label.as_deref();
    let rec = snap.active_recordings;

    let s = match (playing, station, rec) {
        (false, _, 0)       => "Tapir".to_string(),
        (true, Some(st), 0) => format!("Tapir — ▶ {st}"),
        (false, _, n)       => format!("Tapir — ● {n} записів"),
        (true, Some(st), n) => format!("Tapir — ▶ {st} · ● {n} записів"),
        (true, None, _)     => "Tapir — ▶".to_string(),
    };

    truncate_chars(&s, MAX_TOOLTIP_CHARS)
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max { return s.to_string(); }
    let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(state: PlaybackState, label: Option<&str>, rec: usize) -> MenuSnapshot {
        MenuSnapshot {
            player_state: state,
            now_playing_label: label.map(String::from),
            active_recordings: rec,
            window_visible: false,
        }
    }

    #[test]
    fn idle_shows_just_app_name() {
        assert_eq!(tooltip(&snap(PlaybackState::Stopped, None, 0)), "Tapir");
    }

    #[test]
    fn playing_only_shows_play_arrow_and_station() {
        let s = snap(PlaybackState::Playing, Some("SomaFM"), 0);
        assert_eq!(tooltip(&s), "Tapir — ▶ SomaFM");
    }

    #[test]
    fn recording_only_shows_recording_count() {
        let s = snap(PlaybackState::Stopped, None, 3);
        assert_eq!(tooltip(&s), "Tapir — ● 3 записів");
    }

    #[test]
    fn playing_and_recording_shows_both() {
        let s = snap(PlaybackState::Playing, Some("SomaFM"), 2);
        assert_eq!(tooltip(&s), "Tapir — ▶ SomaFM · ● 2 записів");
    }

    #[test]
    fn paused_does_not_show_play_arrow() {
        let s = snap(PlaybackState::Paused, Some("SomaFM"), 1);
        assert_eq!(tooltip(&s), "Tapir — ● 1 записів");
    }

    #[test]
    fn truncates_long_station_name() {
        let long = "a".repeat(200);
        let s = snap(PlaybackState::Playing, Some(&long), 0);
        let result = tooltip(&s);
        assert!(result.chars().count() <= 127);
        assert!(result.ends_with('…'));
    }

    #[test]
    fn handles_unicode_correctly_in_truncation() {
        let long: String = "Я".repeat(200);
        let s = snap(PlaybackState::Playing, Some(&long), 0);
        let result = tooltip(&s);
        assert!(result.chars().count() <= 127);
    }
}
