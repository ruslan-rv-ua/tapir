use crate::app_state::AppState;
use crate::profile::StreamInfo;
use crate::stream::manager::{StreamState, StreamStatus};
use crate::stream::playlist;

/// Whether a stream transfer leaves the source in place (`Copy`) or removes it
/// from the active profile (`Move`). Deserialized from the JS string "copy"/"move".
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferMode {
    Copy,
    Move,
}

/// Build the `StreamInfo` to insert into the target profile. For `Copy` it gets a
/// fresh id + `added_at` so it is a distinct entry; for `Move` the id and
/// `added_at` are preserved. Passwords/usernames/ignorelist are always kept (a
/// local transfer keeps DPAPI ciphertext valid).
fn prepare_transfer_stream(source: &StreamInfo, mode: &TransferMode, now: String) -> StreamInfo {
    let mut out = source.clone();
    if *mode == TransferMode::Copy {
        out.id = nanoid::nanoid!();
        out.added_at = now;
    }
    out
}

/// A move is blocked only while the source stream is actively recording /
/// connecting / reconnecting. An `Error`-state manager entry can linger during
/// retries but must not block a move (matches the UI's disabled condition).
fn move_blocked_by_state(state: &StreamState) -> bool {
    matches!(
        state,
        StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting
    )
}

#[tauri::command]
pub async fn get_streams(state: tauri::State<'_, AppState>) -> Result<Vec<StreamInfo>, String> {
    let profile = state.active_profile.read().await;
    Ok(profile.streams.clone())
}

#[tauri::command]
pub async fn add_stream(
    url: String,
    name: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<StreamInfo, String> {
    let resolved_url = playlist::resolve_playlist_url(&url)
        .await
        .map_err(|e| e.to_string())?;

    let stream_name = name.unwrap_or_else(|| resolved_url.clone());

    let new_stream = StreamInfo {
        id: nanoid::nanoid!(),
        url: resolved_url,
        name: stream_name,
        format: None,
        bitrate: None,
        icy_name: None,
        icy_genre: None,
        icy_url: None,
        ignorelist: Vec::new(),
        username: None,
        password: None,
        added_at: chrono::Local::now().to_rfc3339(),
    };

    let snapshot = {
        let mut profile = state.active_profile.write().await;
        profile.streams.push(new_stream.clone());
        profile.clone()
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    Ok(new_stream)
}

#[tauri::command]
pub async fn remove_stream(
    stream_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // 1. Stop recording first (best-effort, ignore NotFound error)
    {
        let mut manager = state.stream_manager.write().await;
        let _ = manager.stop_recording(&stream_id);
    }

    // 2. Remove from profile (snapshot while write lock is held)
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        profile.streams.retain(|s| s.id != stream_id);
        profile.clone()
    };

    // 3. Save on a blocking thread to avoid starving the async worker
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_stream(
    stream_id: String,
    name: String,
    state: tauri::State<'_, AppState>,
) -> Result<StreamInfo, String> {
    let (updated, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let stream = profile
            .streams
            .iter_mut()
            .find(|s| s.id == stream_id)
            .ok_or_else(|| format!("Stream {} not found", stream_id))?;
        stream.name = name;
        let updated = stream.clone();
        let snapshot = profile.clone();
        (updated, snapshot)
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(updated)
}

#[tauri::command]
pub async fn start_recording(
    stream_id: String,
    state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    let stream = {
        let profile = state.active_profile.read().await;
        profile
            .streams
            .iter()
            .find(|s| s.id == stream_id)
            .cloned()
            .ok_or_else(|| format!("Stream {} not found", stream_id))?
    };

    let settings = {
        let profile = state.active_profile.read().await;
        profile.recording.clone()
    };

    let manager_arc = state.stream_manager.clone();
    let mut manager = manager_arc.write().await;
    manager
        .start_recording(stream, settings, manager_arc.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_recording(
    stream_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut manager = state.stream_manager.write().await;
    manager.stop_recording(&stream_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_all_recordings(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut manager = state.stream_manager.write().await;
    manager.stop_all();
    Ok(())
}

#[tauri::command]
pub async fn start_all_recordings(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let (streams, settings) = {
        let profile = state.active_profile.read().await;
        (profile.streams.clone(), profile.recording.clone())
    };

    let manager_arc = state.stream_manager.clone();
    let mut manager = manager_arc.write().await;
    Ok(manager.start_all(streams, settings, manager_arc.clone()))
}

#[tauri::command]
pub async fn get_stream_status(
    stream_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<StreamStatus, String> {
    let manager = state.stream_manager.read().await;
    manager
        .get_status(&stream_id)
        .ok_or_else(|| format!("Stream {} not found", stream_id))
}

#[tauri::command]
pub async fn get_all_statuses(state: tauri::State<'_, AppState>) -> Result<Vec<StreamStatus>, String> {
    let manager = state.stream_manager.read().await;
    Ok(manager.get_all_statuses())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> StreamInfo {
        StreamInfo {
            id: "src-id".into(), url: "http://x".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec!["*ad*".into()],
            username: Some("u".into()), password: Some("DPAPI:abc".into()),
            added_at: "2026-01-01".into(),
        }
    }

    #[test]
    fn copy_assigns_fresh_id_and_added_at_but_keeps_password() {
        let src = sample();
        let out = prepare_transfer_stream(&src, &TransferMode::Copy, "NOW".into());
        assert_ne!(out.id, src.id, "copy must get a fresh id");
        assert_eq!(out.added_at, "NOW");
        assert_eq!(out.password.as_deref(), Some("DPAPI:abc"), "password preserved");
        assert_eq!(out.url, "http://x");
        assert_eq!(out.ignorelist, vec!["*ad*".to_string()]);
    }

    #[test]
    fn move_preserves_id_and_added_at() {
        let src = sample();
        let out = prepare_transfer_stream(&src, &TransferMode::Move, "NOW".into());
        assert_eq!(out.id, "src-id");
        assert_eq!(out.added_at, "2026-01-01");
        assert_eq!(out.password.as_deref(), Some("DPAPI:abc"));
    }

    #[test]
    fn move_blocked_only_for_active_states() {
        assert!(move_blocked_by_state(&StreamState::Recording));
        assert!(move_blocked_by_state(&StreamState::Connecting));
        assert!(move_blocked_by_state(&StreamState::Reconnecting));
        assert!(!move_blocked_by_state(&StreamState::Idle));
        // An Error-state entry can linger during retries; it must NOT block a move.
        assert!(!move_blocked_by_state(&StreamState::Error));
    }
}
