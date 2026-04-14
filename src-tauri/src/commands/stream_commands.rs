use crate::app_state::AppState;
use crate::profile::StreamInfo;
use crate::stream::manager::StreamStatus;
use crate::stream::playlist;

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

    {
        let mut profile = state.active_profile.write().await;
        profile.streams.push(new_stream.clone());
    }
    {
        let profile = state.active_profile.read().await;
        profile.save().map_err(|e| e.to_string())?;
    }

    Ok(new_stream)
}

#[tauri::command]
pub async fn remove_stream(
    stream_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut profile = state.active_profile.write().await;
        profile.streams.retain(|s| s.id != stream_id);
    }
    {
        let profile = state.active_profile.read().await;
        profile.save().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn update_stream(
    stream_id: String,
    name: String,
    state: tauri::State<'_, AppState>,
) -> Result<StreamInfo, String> {
    let updated = {
        let mut profile = state.active_profile.write().await;
        let stream = profile
            .streams
            .iter_mut()
            .find(|s| s.id == stream_id)
            .ok_or_else(|| format!("Stream {} not found", stream_id))?;
        stream.name = name;
        stream.clone()
    };
    {
        let profile = state.active_profile.read().await;
        profile.save().map_err(|e| e.to_string())?;
    }
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
