use tauri::{AppHandle, State};
use crate::app_state::AppState;
use crate::player::engine::AudioDevice;

/// Stable error code returned by `play_stream` when the stream's air is not
/// something Tapir can even name. Part of the IPC contract: the frontend maps it
/// to its own localized toast (`playRefusal.ts`), so do not reword it. Mirrors
/// the `SHELL_ERR_*` codes in [`crate::commands::shell_open`].
pub(crate) const PLAY_ERR_UNSUPPORTED_CODEC: &str = "unsupported_codec";

#[tauri::command]
pub async fn play_stream(
    stream_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let stream = {
        let profile = state.active_profile.read().await;
        profile.streams.iter()
            .find(|s| s.id == stream_id)
            .cloned()
            .ok_or_else(|| format!("stream not found: {stream_id}"))?
    };
    // Імплікація однобічна (ADR 2026-08-31 §7): symphonia декодує вужчий набір,
    // ніж Tapir уміє назвати, тож «не формат» гарантує «не заграє» — хибної
    // відмови тут бути не може. Відмовляємо одразу, замість п'ятнадцяти секунд
    // проби, яка все одно скінчиться мовчанням.
    //
    // Стабільний код, а не готовий рядок: текст складе Paraglide.
    if stream.unsupported_codec.is_some() {
        return Err(PLAY_ERR_UNSUPPORTED_CODEC.to_string());
    }
    state.player.play_stream(stream_id, stream.url, &app).await.map_err(|e| e.to_string())?;
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
    state
        .commit_settings(|settings| {
            settings.output_device = name;
            crate::store::Commit::Save(())
        })
        .await
        .map_err(|e| e.to_string())
}
