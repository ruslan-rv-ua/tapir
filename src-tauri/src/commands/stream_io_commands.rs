use futures::StreamExt;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use crate::app_state::AppState;
use crate::profile::{AudioFormat, StreamInfo};
use crate::profile_store::Commit;
use crate::stream::{playlist, probe};

/// How many streams to probe at once during import validation and the browser's
/// background post-add check.
pub(crate) const PROBE_CONCURRENCY: usize = 5;

/// Overall budget for a single interactive probe (`probe_stream`). `probe`
/// itself has only a 10s *connect* timeout and no total limit, so without this
/// outer bound the Add-stream dialog could sit spinning for 10s+.
const SINGLE_PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

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

/// Verdict of a single interactive probe (`probe_stream`). Everything but `ok`
/// is fed back into `add_stream`: `icy_name` becomes the stream's name when the
/// user typed none, and `bitrate`/`format` let a colliding name be suffixed
/// informatively (`Radio X (AAC 64k)`) instead of getting a bare ordinal.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeVerdict {
    pub ok: bool,
    pub error: Option<String>,
    pub icy_name: Option<String>,
    pub bitrate: Option<u32>,
    pub format: Option<AudioFormat>,
}

/// One user-selected stream to add on commit. `bitrate`/`format` come from the
/// import dialog's batch probe — they are persisted AND drive the name suffix
/// when the playlist lists several mountpoints of one station.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedStream {
    pub url: String,
    pub name: String,
    #[serde(default)]
    pub bitrate: Option<u32>,
    #[serde(default)]
    pub format: Option<AudioFormat>,
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

/// Decode playlist bytes: UTF-8 when valid (BOM stripped), otherwise fall back
/// to Windows-1251 — legacy Winamp/SHOUTcast playlists with Cyrillic titles are
/// almost always cp1251.
fn decode_playlist_bytes(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(s) => crate::settings::strip_bom(s).to_string(),
        Err(_) => encoding_rs::WINDOWS_1251.decode(bytes).0.into_owned(),
    }
}

/// Open a file picker, parse the chosen playlist, and return candidates.
/// `None` means the user cancelled the picker; an empty Vec means the chosen
/// file held no importable streams — the frontend reports those differently.
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
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let content = decode_playlist_bytes(&bytes);
    let entries = playlist::parse_playlist_all(&content);
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

/// Reachability check for one URL, bounded by `SINGLE_PROBE_TIMEOUT`. Returns
/// just the verdict — no ICY details, no events. Shared by the `probe_stream`
/// command (Add-stream dialog) and the browser's background post-add check, so
/// both get the same timeout semantics.
pub(crate) async fn probe_once(url: &str) -> ProbeVerdict {
    match tokio::time::timeout(SINGLE_PROBE_TIMEOUT, probe::probe(url)).await {
        Ok(r) => ProbeVerdict {
            ok: r.ok,
            error: r.error,
            icy_name: r.icy_name,
            bitrate: r.bitrate,
            format: r.format,
        },
        Err(_) => ProbeVerdict {
            ok: false,
            error: Some(format!("Timed out after {}s", SINGLE_PROBE_TIMEOUT.as_secs())),
            icy_name: None,
            bitrate: None,
            format: None,
        },
    }
}

/// Reachability check for a single URL, for interactive add flows (Add-stream
/// dialog). Never `Err`: a failed probe is a warning for the user, not a
/// command error.
#[tauri::command]
pub async fn probe_stream(url: String) -> Result<ProbeVerdict, String> {
    Ok(probe_once(&url).await)
}

/// Turn the user's selection into the streams to insert: drop URLs the profile
/// already holds (and duplicates inside the selection), then name the survivors
/// apart from the profile and from each other. A dropped URL must not burn a
/// name, so the taken-set only grows for entries that survive. Pure over the
/// profile — unit-testable without Tauri state.
pub fn plan_import(streams: &[StreamInfo], selected: Vec<SelectedStream>, now: &str) -> Vec<StreamInfo> {
    let mut urls: std::collections::HashSet<String> =
        streams.iter().map(|s| s.url.clone()).collect();
    let mut taken = crate::naming::taken_keys(streams.iter(), None);
    let mut planned = Vec::new();

    for sel in selected {
        if !urls.insert(sel.url.clone()) {
            continue; // already in the profile, or repeated in this selection
        }
        let meta = crate::naming::NameMeta { format: sel.format.clone(), bitrate: sel.bitrate };
        let name = crate::naming::disambiguate(&sel.name, &meta, &taken);
        taken.insert(crate::naming::collision_key(&name));
        planned.push(StreamInfo {
            id: nanoid::nanoid!(),
            url: sel.url,
            name,
            format: sel.format,
            bitrate: sel.bitrate,
            icy_name: None,
            icy_genre: None,
            icy_url: None,
            ignorelist: Vec::new(),
            username: None,
            password: None,
            added_at: now.to_string(),
        });
    }
    planned
}

/// Add the selected streams to the active profile (URL-dedup via
/// `add_stream_checked`), saving once. Returns how many were added vs skipped.
/// Names are disambiguated in `plan_import` before insertion.
#[tauri::command]
pub async fn commit_stream_import(
    selected: Vec<SelectedStream>,
    state: State<'_, AppState>,
) -> Result<ImportResult, String> {
    let requested = selected.len();
    let added = state
        .commit_profile(|profile| {
            let planned =
                plan_import(&profile.streams, selected, &chrono::Local::now().to_rfc3339());
            let mut added = 0usize;
            for stream in planned {
                if profile.add_stream_checked(stream).is_ok() {
                    added += 1;
                }
            }
            // Усі кандидати виявилися дублікатами — профіль не змінився.
            if added == 0 {
                return Commit::Skip(0);
            }
            Commit::Save(added)
        })
        .await
        .map_err(|e| e.to_string())?;
    Ok(ImportResult { added, skipped: requested - added })
}

/// Default file name proposed in the Save dialog. Selected exports carry the
/// scope in the name (`-selected-{count}`) so the native Save dialog — the final
/// confirmation surface NVDA reads — doesn't propose an identical name for a
/// subset vs the whole profile (finding 4). `count` is the POST-filter count.
fn export_file_name(profile_name: &str, ext: &str, count: Option<usize>) -> String {
    match count {
        Some(n) => format!("{profile_name}-selected-{n}.{ext}"),
        None => format!("{profile_name}.{ext}"),
    }
}

/// Serialize the active profile's streams (or only `stream_ids`, when given) to
/// the chosen format and write them to a user-picked file. `format` is "m3u8"
/// (default) or "pls". Returns `true` when a file was written, `false` when the
/// user cancelled the save dialog. The proposed file name encodes the scope
/// (finding 4): selected → `{name}-selected-{count}.{ext}`, where `count` is the
/// post-filter count (unknown ids are dropped by `select_by_ids`).
#[tauri::command]
pub async fn export_streams(
    app: AppHandle,
    format: String,
    stream_ids: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let (all, profile_name) = {
        let profile = state.active_profile.read().await;
        (profile.streams.clone(), profile.name.clone())
    };
    let (streams, scope_count) = match &stream_ids {
        Some(ids) => {
            let sel = crate::commands::stream_commands::select_by_ids(&all, ids);
            let n = sel.len();
            (sel, Some(n))
        }
        None => (all, None),
    };
    let fmt = format.as_str();
    let (ext, content) = match fmt {
        "pls" => ("pls", playlist::to_pls(&streams)),
        _ => ("m3u8", playlist::to_m3u8(&streams)),
    };
    let path = app
        .dialog()
        .file()
        .set_file_name(&export_file_name(&profile_name, ext, scope_count))
        .add_filter("Playlist", &[ext])
        .blocking_save_file();
    match path {
        Some(FilePath::Path(p)) => {
            std::fs::write(&p, content).map_err(|e| e.to_string())?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An unreachable host must come back as a verdict, not a command error —
    /// the dialog shows it as a warning and still lets the user save.
    #[tokio::test]
    async fn probe_stream_reports_unreachable_as_not_ok() {
        let v = probe_stream("https://invalid.example.invalid/stream".into()).await.unwrap();
        assert!(!v.ok);
        assert!(v.error.is_some());
    }

    fn entry(url: &str, title: Option<&str>) -> playlist::ParsedEntry {
        playlist::ParsedEntry { url: url.into(), title: title.map(|t| t.to_string()) }
    }

    #[test]
    fn decode_playlist_bytes_strips_utf8_bom() {
        let bytes = b"\xEF\xBB\xBF[playlist]\nFile1=https://a/1\n";
        assert_eq!(decode_playlist_bytes(bytes), "[playlist]\nFile1=https://a/1\n");
    }

    #[test]
    fn decode_playlist_bytes_falls_back_to_cp1251() {
        // "Радіо" in Windows-1251 (invalid as UTF-8)
        let mut bytes = b"#EXTM3U\n#EXTINF:-1,".to_vec();
        bytes.extend_from_slice(&[0xD0, 0xE0, 0xE4, 0xB3, 0xEE]);
        bytes.extend_from_slice(b"\nhttps://a/1\n");
        let decoded = decode_playlist_bytes(&bytes);
        assert!(decoded.contains("Радіо"), "got: {decoded}");
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

    fn sel(url: &str, name: &str, bitrate: Option<u32>, format: Option<AudioFormat>) -> SelectedStream {
        SelectedStream { url: url.into(), name: name.into(), bitrate, format }
    }

    fn existing(id: &str, url: &str, name: &str) -> StreamInfo {
        StreamInfo {
            id: id.into(), url: url.into(), name: name.into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        }
    }

    #[test]
    fn import_suffixes_against_the_profile() {
        let profile = vec![existing("a", "https://old", "Radio X")];
        let planned = plan_import(
            &profile,
            vec![sel("https://new", "Radio X", Some(64), Some(AudioFormat::Aac))],
            "NOW",
        );
        assert_eq!(planned[0].name, "Radio X (AAC 64k)");
        assert_eq!(planned[0].bitrate, Some(64), "probe metadata is persisted, not just used for the suffix");
        assert_eq!(planned[0].added_at, "NOW");
    }

    #[test]
    fn import_suffixes_within_the_batch() {
        let planned = plan_import(
            &[],
            vec![
                sel("https://a", "Radio X", Some(128), Some(AudioFormat::Mp3)),
                sel("https://b", "Radio X", Some(64), Some(AudioFormat::Aac)),
                sel("https://c", "Radio X", None, None),
            ],
            "NOW",
        );
        assert_eq!(planned[0].name, "Radio X");
        assert_eq!(planned[1].name, "Radio X (AAC 64k)");
        assert_eq!(planned[2].name, "Radio X (2)");
    }

    #[test]
    fn import_does_not_burn_a_name_on_a_url_that_will_be_skipped() {
        // https://dup is already in the profile, so it is dropped before naming
        // and must not push the fresh entry to "Radio X (2)".
        let profile = vec![existing("a", "https://dup", "Whatever")];
        let planned = plan_import(
            &profile,
            vec![sel("https://dup", "Radio X", None, None), sel("https://new", "Radio X", None, None)],
            "NOW",
        );
        assert_eq!(planned.len(), 1);
        assert_eq!(planned[0].url, "https://new");
        assert_eq!(planned[0].name, "Radio X");
    }

    #[test]
    fn export_file_name_whole_profile_uses_plain_name() {
        assert_eq!(export_file_name("My Radio", "m3u8", None), "My Radio.m3u8");
    }

    #[test]
    fn export_file_name_selected_encodes_post_filter_count() {
        assert_eq!(export_file_name("My Radio", "pls", Some(3)), "My Radio-selected-3.pls");
    }
}
