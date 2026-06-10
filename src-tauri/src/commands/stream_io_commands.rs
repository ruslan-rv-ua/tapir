use futures::StreamExt;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use crate::app_state::AppState;
use crate::profile::{AudioFormat, StreamInfo};
use crate::stream::{playlist, probe};

/// How many streams to probe at once during import validation.
const PROBE_CONCURRENCY: usize = 5;

/// A stream found in an imported playlist, ready to show in the picker.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCandidate {
    pub url: String,
    pub name: String,
    pub already_in_profile: bool,
}

/// Payload for the `stream-import-progress` event, emitted per URL as probes run.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub url: String,
    pub status: String, // "checking" | "ok" | "error"
    pub icy_name: Option<String>,
    pub bitrate: Option<u32>,
    pub format: Option<AudioFormat>,
    pub error: Option<String>,
}

/// One user-selected stream to add on commit.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedStream {
    pub url: String,
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub added: usize,
    pub skipped: usize,
}

/// Map parsed playlist entries to candidates, marking which URLs already exist in
/// the active profile. Name falls back to the URL when the playlist has no title.
pub fn build_candidates(entries: Vec<playlist::ParsedEntry>, existing_urls: &[String]) -> Vec<ImportCandidate> {
    entries
        .into_iter()
        .map(|e| {
            let already_in_profile = existing_urls.iter().any(|u| u == &e.url);
            let name = e.title.unwrap_or_else(|| e.url.clone());
            ImportCandidate { url: e.url, name, already_in_profile }
        })
        .collect()
}

/// Open a file picker, parse the chosen playlist, and return candidates. Returns
/// `None` when the user cancels or the file holds no importable streams.
#[tauri::command]
pub async fn begin_stream_import(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<Vec<ImportCandidate>>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("Playlists", &["m3u", "m3u8", "pls"])
        .blocking_pick_file();
    let path = match path {
        Some(FilePath::Path(p)) => p,
        _ => return Ok(None),
    };
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let content = crate::settings::strip_bom(&content);
    let entries = playlist::parse_playlist_all(content);
    if entries.is_empty() {
        return Ok(None);
    }
    let existing: Vec<String> = {
        let profile = state.active_profile.read().await;
        profile.streams.iter().map(|s| s.url.clone()).collect()
    };
    Ok(Some(build_candidates(entries, &existing)))
}

/// Probe the given URLs concurrently, emitting `stream-import-progress` per URL
/// (first `checking`, then `ok`/`error`). Resolves when every probe is done.
#[tauri::command]
pub async fn validate_import_candidates(urls: Vec<String>, app: AppHandle) -> Result<(), String> {
    futures::stream::iter(urls.into_iter().map(|url| {
        let app = app.clone();
        async move {
            let _ = app.emit(
                "stream-import-progress",
                ImportProgress { url: url.clone(), status: "checking".into(), icy_name: None, bitrate: None, format: None, error: None },
            );
            let r = probe::probe(&url).await;
            let _ = app.emit(
                "stream-import-progress",
                ImportProgress {
                    url: r.url,
                    status: if r.ok { "ok".into() } else { "error".into() },
                    icy_name: r.icy_name,
                    bitrate: r.bitrate,
                    format: r.format,
                    error: r.error,
                },
            );
        }
    }))
    .buffer_unordered(PROBE_CONCURRENCY)
    .collect::<Vec<()>>()
    .await;
    Ok(())
}

/// Add the selected streams to the active profile (URL-dedup via
/// `add_stream_checked`), saving once. Returns how many were added vs skipped.
#[tauri::command]
pub async fn commit_stream_import(
    selected: Vec<SelectedStream>,
    state: State<'_, AppState>,
) -> Result<ImportResult, String> {
    let (added, skipped, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let mut added = 0usize;
        let mut skipped = 0usize;
        for sel in selected {
            let stream = StreamInfo {
                id: nanoid::nanoid!(),
                url: sel.url,
                name: sel.name,
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
            match profile.add_stream_checked(stream) {
                Ok(()) => added += 1,
                Err(_) => skipped += 1,
            }
        }
        (added, skipped, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(ImportResult { added, skipped })
}

/// Serialize the active profile's streams to the chosen format and write them to
/// a user-picked file. `fmt` is "m3u8" (default) or "pls".
#[tauri::command]
pub async fn export_streams(
    app: AppHandle,
    format: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (streams, profile_name) = {
        let profile = state.active_profile.read().await;
        (profile.streams.clone(), profile.name.clone())
    };
    let fmt = format.as_str();
    let (ext, content) = match fmt {
        "pls" => ("pls", playlist::to_pls(&streams)),
        _ => ("m3u8", playlist::to_m3u8(&streams)),
    };
    let path = app
        .dialog()
        .file()
        .set_file_name(&format!("{profile_name}.{ext}"))
        .add_filter("Playlist", &[ext])
        .blocking_save_file();
    match path {
        Some(FilePath::Path(p)) => std::fs::write(&p, content).map_err(|e| e.to_string()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(url: &str, title: Option<&str>) -> playlist::ParsedEntry {
        playlist::ParsedEntry { url: url.into(), title: title.map(|t| t.to_string()) }
    }

    #[test]
    fn build_candidates_marks_existing_urls() {
        let entries = vec![entry("https://a/1", Some("Alpha")), entry("https://b/2", None)];
        let existing = vec!["https://a/1".to_string()];
        let got = build_candidates(entries, &existing);
        assert_eq!(got[0].already_in_profile, true);
        assert_eq!(got[0].name, "Alpha");
        assert_eq!(got[1].already_in_profile, false);
        assert_eq!(got[1].name, "https://b/2", "name falls back to URL when no title");
    }
}
