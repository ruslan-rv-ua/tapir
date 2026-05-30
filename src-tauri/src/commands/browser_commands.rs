use tauri::Emitter;
use log::warn;

use crate::app_state::AppState;
use crate::browser::api::RadioBrowserClient;
use crate::browser::types::*;
use crate::errors::RadioError;
use crate::profile::{AudioFormat, StreamInfo};

/// Helper: get or init the RadioBrowserClient from OnceCell.
async fn get_client(state: &AppState) -> &RadioBrowserClient {
    state.browser_client
        .get_or_init(|| async {
            RadioBrowserClient::new().await.unwrap_or_else(|e| {
                warn!("Failed to init Radio Browser client: {e}");
                RadioBrowserClient::with_default_servers()
            })
        })
        .await
}

#[tauri::command]
pub async fn search_stations(
    params: SearchParams,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<StationResult>, String> {
    let client = get_client(&state).await;
    client.search_stations(&params).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_browser_filters(
    state: tauri::State<'_, AppState>,
) -> Result<BrowserFilters, String> {
    let client = get_client(&state).await;
    client.get_filters().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_station_from_browser(
    station: StationResult,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<StreamInfo, String> {
    let url = if station.url_resolved.is_empty() {
        station.url.clone()
    } else {
        station.url_resolved.clone()
    };

    let mut profile = state.active_profile.write().await;

    // Duplicate check by URL
    if profile.streams.iter().any(|s| s.url == url) {
        return Err(RadioError::DuplicateStream.to_string());
    }

    let format = match station.codec.to_uppercase().as_str() {
        "MP3" => Some(AudioFormat::Mp3),
        "AAC" | "AAC+" => Some(AudioFormat::Aac),
        _ => None,
    };

    let stream_info = StreamInfo {
        id: nanoid::nanoid!(),
        url,
        name: station.name.trim().to_string(),
        format,
        bitrate: if station.bitrate > 0 { Some(station.bitrate) } else { None },
        icy_name: None,
        icy_genre: if station.tags.is_empty() { None } else { Some(station.tags.clone()) },
        icy_url: if station.homepage.is_empty() { None } else { Some(station.homepage.clone()) },
        ignorelist: vec![],
        username: None,
        password: None,
        added_at: chrono::Local::now().to_rfc3339(),
    };

    profile.streams.push(stream_info.clone());

    let profile_clone = profile.clone();
    drop(profile);

    tokio::task::spawn_blocking(move || profile_clone.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    app.emit("streams-changed", ()).ok();

    Ok(stream_info)
}
