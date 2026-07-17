//! IPC commands for the Saved Songs Manager.

use std::path::Path;
use tauri::{AppHandle, Emitter, State};

use crate::app_state::AppState;
use crate::portable;
use crate::profile::AudioFormat;
use crate::songs::{self, Song, scanner};

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
        portable::resolve_output_dir(&profile.recording.output_dir)
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
    state.player.play_file(path, &app).await.map_err(|e| e.to_string())?;
    crate::playback_control::persist_session_snapshot(&app).await;
    Ok(())
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
    {
        use crate::player::engine::PlaybackSource;
        let status = state.player.get_status().await;
        if let Some(PlaybackSource::File { path: playing }) = status.source.as_ref() {
            if playing == &old_path {
                return Err("Stop playback first: this file is currently playing".to_string());
            }
        }
    }
    let output_dir = {
        let profile = state.active_profile.read().await;
        portable::resolve_output_dir(&profile.recording.output_dir)
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
        portable::resolve_output_dir(&profile.recording.output_dir)
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
pub async fn delete_song(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    {
        use crate::player::engine::PlaybackSource;
        let status = state.player.get_status().await;
        if let Some(PlaybackSource::File { path: playing }) = status.source.as_ref() {
            if playing == &path {
                return Err("Stop playback first: this file is currently playing".to_string());
            }
        }
    }
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

/// Result of a bulk delete: which paths were recycle-binned, which were skipped
/// (currently playing). Mirrors the streams "honest count" pattern but returns
/// the path lists so the frontend can compute focus over visible row order.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkDeleteSongs {
    pub deleted: Vec<String>,
    pub skipped: Vec<String>,
}

/// Split `paths` into (deletable, skipped) — the currently-playing path is
/// skipped. Pure; unit-testable without Tauri state.
fn partition_deletable(paths: &[String], playing: Option<&str>) -> (Vec<String>, Vec<String>) {
    let mut to_delete = Vec::new();
    let mut skipped = Vec::new();
    for p in paths {
        if Some(p.as_str()) == playing {
            skipped.push(p.clone());
        } else {
            to_delete.push(p.clone());
        }
    }
    (to_delete, skipped)
}

/// Bulk variant of `delete_song`: recycle-bin each path in one pass, skipping the
/// currently-playing file (partial success, not an error). Does NOT emit per-file
/// `song-deleted` (the frontend updates $songs once and gives one summary).
#[tauri::command]
pub async fn delete_songs(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<BulkDeleteSongs, String> {
    let playing = {
        use crate::player::engine::PlaybackSource;
        let status = state.player.get_status().await;
        match status.source.as_ref() {
            Some(PlaybackSource::File { path }) => Some(path.clone()),
            _ => None,
        }
    };
    let (to_delete, skipped) = partition_deletable(&paths, playing.as_deref());

    let recycled = tokio::task::spawn_blocking(move || {
        let mut ok = Vec::new();
        for p in to_delete {
            if songs::ops::delete_to_recycle_bin(Path::new(&p)).is_ok() {
                ok.push(p);
            }
        }
        ok
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(BulkDeleteSongs { deleted: recycled, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partition_skips_the_playing_path() {
        let paths = vec!["a.mp3".to_string(), "b.mp3".to_string(), "c.mp3".to_string()];
        let (to_delete, skipped) = partition_deletable(&paths, Some("b.mp3"));
        assert_eq!(to_delete, vec!["a.mp3".to_string(), "c.mp3".to_string()]);
        assert_eq!(skipped, vec!["b.mp3".to_string()]);
    }

    #[test]
    fn partition_keeps_all_when_nothing_is_playing() {
        let paths = vec!["a.mp3".to_string()];
        let (to_delete, skipped) = partition_deletable(&paths, None);
        assert_eq!(to_delete, vec!["a.mp3".to_string()]);
        assert!(skipped.is_empty());
    }
}
