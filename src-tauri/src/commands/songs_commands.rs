//! IPC commands for the Saved Songs Manager.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};

use crate::app_state::AppState;
use crate::portable;
use crate::profile::AudioFormat;
use crate::songs::{self, Song, scanner};

/// Resolve `recording.output_dir` (which may be relative) to an absolute path.
fn resolve_output_dir(rel: &str) -> PathBuf {
    let p = PathBuf::from(rel);
    if p.is_absolute() {
        p
    } else {
        portable::data_dir().join(p)
    }
}

fn format_from_path(path: &Path) -> Option<AudioFormat> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    scanner::format_from_extension(&ext)
}

#[tauri::command]
pub async fn list_saved_songs(state: State<'_, AppState>) -> Result<Vec<Song>, String> {
    let output_dir = {
        let profile = state.active_profile.read().await;
        resolve_output_dir(&profile.recording.output_dir)
    };
    tokio::task::spawn_blocking(move || scanner::scan(&output_dir))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn play_saved_song(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.play_file(path, &app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_song_in_explorer(path: String) -> Result<(), String> {
    // explorer.exe parses /select, with its own non-CRT scheme. If Rust quotes
    // the whole arg (because the path has spaces), Explorer mis-parses and just
    // opens its default folder. Bypass Rust's auto-quoting with raw_arg and
    // put the inner double quotes ourselves around the path.
    use std::os::windows::process::CommandExt;
    std::process::Command::new("explorer.exe")
        .raw_arg(format!("/select,\"{path}\""))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_song(
    old_path: String,
    new_basename: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Song, String> {
    let output_dir = {
        let profile = state.active_profile.read().await;
        resolve_output_dir(&profile.recording.output_dir)
    };
    let old_path_clone = old_path.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<Song, String> {
        let new_path = songs::ops::rename_file(Path::new(&old_path_clone), &new_basename)
            .map_err(|e| e.to_string())?;
        let format = format_from_path(&new_path)
            .ok_or_else(|| "Unsupported audio format".to_string())?;
        let song = scanner::read_song(&new_path, &output_dir, format)
            .map_err(|e| e.to_string())?;
        Ok(song)
    })
    .await
    .map_err(|e| e.to_string())??;

    #[derive(serde::Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct RenamedPayload<'a> {
        old_path: &'a str,
        new_song: &'a Song,
    }
    let _ = app.emit(
        "song-renamed",
        RenamedPayload { old_path: old_path.as_str(), new_song: &result },
    );
    Ok(result)
}

#[tauri::command]
pub async fn update_song_tags(
    path: String,
    artist: String,
    title: String,
    album: String,
    genre: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Song, String> {
    let output_dir = {
        let profile = state.active_profile.read().await;
        resolve_output_dir(&profile.recording.output_dir)
    };
    let path_clone = path.clone();
    let song = tokio::task::spawn_blocking(move || -> Result<Song, String> {
        let p = Path::new(&path_clone);
        let format = format_from_path(p)
            .ok_or_else(|| "Unsupported audio format".to_string())?;
        songs::tags::write_song_tags(p, format.clone(), &artist, &title, &album, &genre)
            .map_err(|e| e.to_string())?;
        scanner::read_song(p, &output_dir, format).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = app.emit("song-tags-updated", &song);
    Ok(song)
}

#[tauri::command]
pub async fn delete_song(path: String, app: AppHandle) -> Result<(), String> {
    let path_clone = path.clone();
    tokio::task::spawn_blocking(move || songs::ops::delete_to_recycle_bin(Path::new(&path_clone)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    #[derive(serde::Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct DeletedPayload<'a> {
        path: &'a str,
    }
    let _ = app.emit("song-deleted", DeletedPayload { path: &path });
    Ok(())
}
