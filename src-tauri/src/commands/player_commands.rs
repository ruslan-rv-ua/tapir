use tauri::{AppHandle, State};
use crate::app_state::AppState;
use crate::player::engine::AudioDevice;

#[tauri::command]
pub async fn play_stream(
    stream_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let url = {
        let profile = state.active_profile.read().await;
        profile.streams.iter()
            .find(|s| s.id == stream_id)
            .map(|s| s.url.clone())
            .ok_or_else(|| format!("stream not found: {stream_id}"))?
    };
    state.player.play_stream(stream_id, url, &app).await.map_err(|e| e.to_string())?;
    crate::playback_control::persist_session_snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn preview_station(
    url: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.preview(url, name, &app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn play_file(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.play_file(path, &app).await.map_err(|e| e.to_string())?;
    crate::playback_control::persist_session_snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn pause_playback(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.pause_playback(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_playback(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.resume_playback(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_playback(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Capture the file position before teardown so a later Ctrl+Shift+K resumes
    // where it left off (no-op for streams/preview).
    crate::playback_control::persist_session_snapshot(&app).await;
    state.player.stop_playback(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn seek_playback(
    position_ms: u64,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.seek_playback(position_ms, &app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_volume(
    volume: f32,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Гучність — сесійне поле: у пам'яті вона живе в PlayerEngine, а на диск
    // потрапляє на переходах (persist_session_snapshot, graceful_shutdown), не
    // на кожну зміну. Слайдер шле цю команду на кожну стрілку, тож запис профілю
    // тут був у гарячому шляху; глобальний хоткей (shortcuts.rs) не писав його
    // й до цього — тепер обидва шляхи поводяться однаково.
    state.player.set_volume(volume, &app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_player_status(
    state: State<'_, AppState>,
) -> Result<crate::player::engine::PlayerStatus, String> {
    Ok(state.player.get_status().await)
}

#[tauri::command]
pub async fn list_output_devices() -> Result<Vec<AudioDevice>, String> {
    crate::player::engine::PlayerEngine::list_output_devices()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_output_device(
    name: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.set_output_device(name.clone(), &app).await.map_err(|e| e.to_string())?;
    let snapshot = {
        let mut settings = state.settings.write().await;
        settings.output_device = name;
        settings.clone()
    }; // write lock released before blocking save
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
