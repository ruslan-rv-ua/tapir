# Stream Import/Export (M3U8/PLS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add import (M3U8/PLS → validate + pick → add) and export (active profile streams → M3U8/PLS) to the Streams screen.

**Architecture:** Pure parsing/serialization in `stream::playlist`; a thin network `stream::probe` that reuses `connection::connect` for liveness + ICY metadata; IPC in a new `commands::stream_io_commands` that drives the Rust file dialogs (mirroring `profile_commands`), runs probes concurrently and streams results via a `stream-import-progress` event; React dialogs (`ImportStreamsDialog`, `ExportFormatDialog`) wired into `StreamsPanel` and `CommandPalette`.

**Tech Stack:** Rust (Tauri v2, reqwest, icy-metadata, futures), React 19 + react-aria-components, nanostores, Paraglide i18n, vitest.

**Design spec:** [docs/superpowers/specs/2026-06-10-stream-import-export-design.md](../specs/2026-06-10-stream-import-export-design.md)

**Conventions for every task:**
- Run a single Rust test: `cargo test --manifest-path src-tauri/Cargo.toml <name_substring>`
- Run all Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Run a single frontend test file: `pnpm test <Filename_substring>`
- Frontend build gate: `pnpm vite:build`
- Backend metadata decision: imported streams store **only `name`**; `icyName/bitrate/format/genre` stay `null` and are filled on first record (consistent with `add_stream`). Probe metadata is **display-only**. (Genre is not surfaced anywhere, so probe omits it — YAGNI.)

---

## Task 1: Parse all entries from PLS/M3U

**Files:**
- Modify: `src-tauri/src/stream/playlist.rs`

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `#[cfg(test)] mod tests { ... }` block in `src-tauri/src/stream/playlist.rs` (after the existing tests, before the closing `}`):

```rust
    #[test]
    fn parse_pls_all_returns_all_entries_with_titles() {
        let content = "[playlist]\nFile1=https://a.example/1\nTitle1=Alpha\nFile2=https://b.example/2\nTitle2=Beta\nNumberOfEntries=2\n";
        let got = parse_pls_all(content);
        assert_eq!(got, vec![
            ParsedEntry { url: "https://a.example/1".into(), title: Some("Alpha".into()) },
            ParsedEntry { url: "https://b.example/2".into(), title: Some("Beta".into()) },
        ]);
    }

    #[test]
    fn parse_pls_all_skips_non_http_and_dedups() {
        let content = "[playlist]\nFile1=https://a.example/1\nFile2=file:///etc/passwd\nFile3=https://a.example/1\n";
        let got = parse_pls_all(content);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].url, "https://a.example/1");
    }

    #[test]
    fn parse_m3u_all_pairs_extinf_titles() {
        let content = "#EXTM3U\n#EXTINF:-1,Alpha\nhttps://a.example/1\n#EXTINF:-1,Beta\nhttps://b.example/2\n";
        let got = parse_m3u_all(content);
        assert_eq!(got, vec![
            ParsedEntry { url: "https://a.example/1".into(), title: Some("Alpha".into()) },
            ParsedEntry { url: "https://b.example/2".into(), title: Some("Beta".into()) },
        ]);
    }

    #[test]
    fn parse_m3u_all_url_without_extinf_has_no_title() {
        let content = "https://a.example/1\n";
        let got = parse_m3u_all(content);
        assert_eq!(got, vec![ParsedEntry { url: "https://a.example/1".into(), title: None }]);
    }

    #[test]
    fn parse_m3u_all_hls_segment_playlist_is_empty() {
        let content = "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:9.0,\nsegment0.ts\nsegment1.ts\n";
        assert!(parse_m3u_all(content).is_empty());
    }

    #[test]
    fn parse_playlist_all_detects_pls_by_content() {
        let content = "[PLAYLIST]\nFile1=https://a.example/1\n";
        let got = parse_playlist_all(content);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].url, "https://a.example/1");
    }

    #[test]
    fn parse_playlist_all_defaults_to_m3u() {
        let content = "#EXTM3U\nhttps://a.example/1\n";
        let got = parse_playlist_all(content);
        assert_eq!(got.len(), 1);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml parse_pls_all`
Expected: FAIL — `cannot find function parse_pls_all` / `cannot find type ParsedEntry`.

- [ ] **Step 3: Add `ParsedEntry`, the parse-all functions, and refactor the single-URL parsers**

At the top of `src-tauri/src/stream/playlist.rs`, after `use crate::errors::RadioError;`, add:

```rust
use std::collections::{BTreeMap, HashSet};

/// One entry parsed from a playlist: a stream URL and its optional display title.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedEntry {
    pub url: String,
    pub title: Option<String>,
}

/// Split a string like `1=value` into (1, "value"). Returns None if there is no
/// `=` or the index part is not a number.
fn split_indexed(s: &str) -> Option<(u32, &str)> {
    let eq = s.find('=')?;
    let num: u32 = s[..eq].trim().parse().ok()?;
    Some((num, &s[eq + 1..]))
}

/// Parse every `FileN=`/`TitleN=` pair from a PLS playlist. Non-HTTP(S) URLs are
/// dropped; duplicate URLs are removed (first wins). Titles are matched by index.
pub fn parse_pls_all(content: &str) -> Vec<ParsedEntry> {
    let mut files: BTreeMap<u32, String> = BTreeMap::new();
    let mut titles: BTreeMap<u32, String> = BTreeMap::new();
    for line in content.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("File") {
            if let Some((n, v)) = split_indexed(rest) {
                files.insert(n, v.trim().to_string());
            }
        } else if let Some(rest) = line.strip_prefix("Title") {
            if let Some((n, v)) = split_indexed(rest) {
                titles.insert(n, v.trim().to_string());
            }
        }
    }
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (n, url) in files {
        if validate_stream_url(&url).is_err() || !seen.insert(url.clone()) {
            continue;
        }
        let title = titles.get(&n).filter(|t| !t.is_empty()).cloned();
        out.push(ParsedEntry { url, title });
    }
    out
}

/// Parse every entry from an M3U/M3U8 playlist. `#EXTINF:-1,Title` is paired with
/// the next URL line. Non-HTTP(S) URLs are dropped; duplicate URLs are removed.
/// An HLS *media* playlist (contains `#EXT-X-` tags) is a list of segments, not
/// stations, so it parses to an empty list.
pub fn parse_m3u_all(content: &str) -> Vec<ParsedEntry> {
    if content.lines().any(|l| l.trim_start().starts_with("#EXT-X-")) {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut pending_title: Option<String> = None;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            pending_title = rest
                .splitn(2, ',')
                .nth(1)
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty());
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        let url = line.to_string();
        if validate_stream_url(&url).is_err() || !seen.insert(url.clone()) {
            pending_title = None;
            continue;
        }
        out.push(ParsedEntry { url, title: pending_title.take() });
    }
    out
}

/// Parse a playlist whose format is detected by content (a `[playlist]` line
/// means PLS; otherwise M3U) rather than by file extension.
pub fn parse_playlist_all(content: &str) -> Vec<ParsedEntry> {
    let is_pls = content.lines().any(|l| l.trim().eq_ignore_ascii_case("[playlist]"));
    if is_pls { parse_pls_all(content) } else { parse_m3u_all(content) }
}
```

Then replace the bodies of the existing `parse_pls` and `parse_m3u` so they delegate (keeps the single-URL contract used by `resolve_playlist_url` DRY):

```rust
/// Parse PLS playlist, return first stream URL.
pub fn parse_pls(content: &str) -> Result<String, RadioError> {
    parse_pls_all(content)
        .into_iter()
        .next()
        .map(|e| e.url)
        .ok_or_else(|| RadioError::Format("No File1= entry found in PLS".to_string()))
}

/// Parse M3U/M3U8 playlist, return first stream URL.
pub fn parse_m3u(content: &str) -> Result<String, RadioError> {
    parse_m3u_all(content)
        .into_iter()
        .next()
        .map(|e| e.url)
        .ok_or_else(|| RadioError::Format("No stream URL found in M3U".to_string()))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml playlist`
Expected: PASS — new `parse_*_all` tests plus the pre-existing `test_parse_pls_*` / `test_parse_m3u_*` / `test_resolve_*` tests all green.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/stream/playlist.rs
git commit -m "$(cat <<'EOF'
feat(playlist): parse all entries from PLS/M3U with titles

parse_pls_all/parse_m3u_all/parse_playlist_all return every stream with
its title, drop non-HTTP and duplicate URLs, and treat HLS media
playlists as empty. parse_pls/parse_m3u now delegate to the _all variants.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Serialize streams to M3U8/PLS

**Files:**
- Modify: `src-tauri/src/stream/playlist.rs`

- [ ] **Step 1: Write the failing tests**

Add inside `#[cfg(test)] mod tests`:

```rust
    fn sample_streams() -> Vec<crate::profile::StreamInfo> {
        let mk = |url: &str, name: &str| crate::profile::StreamInfo {
            id: "x".into(), url: url.into(), name: name.into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        };
        vec![mk("https://a.example/1", "Alpha"), mk("https://b.example/2", "Beta")]
    }

    #[test]
    fn to_m3u8_writes_extinf_and_url() {
        let out = to_m3u8(&sample_streams());
        assert_eq!(
            out,
            "#EXTM3U\n#EXTINF:-1,Alpha\nhttps://a.example/1\n#EXTINF:-1,Beta\nhttps://b.example/2\n"
        );
    }

    #[test]
    fn to_pls_writes_indexed_entries_with_count() {
        let out = to_pls(&sample_streams());
        assert!(out.starts_with("[playlist]\n"));
        assert!(out.contains("File1=https://a.example/1\n"));
        assert!(out.contains("Title1=Alpha\n"));
        assert!(out.contains("Length1=-1\n"));
        assert!(out.contains("File2=https://b.example/2\n"));
        assert!(out.contains("NumberOfEntries=2\n"));
        assert!(out.contains("Version=2\n"));
    }

    #[test]
    fn to_m3u8_strips_newlines_from_names() {
        let mut s = sample_streams();
        s[0].name = "Bad\nName".into();
        let out = to_m3u8(&s);
        assert!(out.contains("#EXTINF:-1,Bad Name\n"));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml to_m3u8`
Expected: FAIL — `cannot find function to_m3u8`.

- [ ] **Step 3: Add the serializers**

Add to `src-tauri/src/stream/playlist.rs` (after `parse_playlist_all`). Note the `use crate::profile::StreamInfo;` import at the top of the function-free area — add `use crate::profile::StreamInfo;` near the existing `use` lines:

```rust
/// Replace CR/LF in a name so it cannot break the line-oriented playlist format.
fn sanitize_name(name: &str) -> String {
    name.replace(['\r', '\n'], " ")
}

/// Serialize streams to an extended M3U8 playlist (UTF-8).
pub fn to_m3u8(streams: &[StreamInfo]) -> String {
    let mut out = String::from("#EXTM3U\n");
    for s in streams {
        out.push_str(&format!("#EXTINF:-1,{}\n{}\n", sanitize_name(&s.name), s.url));
    }
    out
}

/// Serialize streams to a PLS playlist.
pub fn to_pls(streams: &[StreamInfo]) -> String {
    let mut out = String::from("[playlist]\n");
    for (i, s) in streams.iter().enumerate() {
        let n = i + 1;
        out.push_str(&format!("File{n}={}\n", s.url));
        out.push_str(&format!("Title{n}={}\n", sanitize_name(&s.name)));
        out.push_str(&format!("Length{n}=-1\n"));
    }
    out.push_str(&format!("NumberOfEntries={}\n", streams.len()));
    out.push_str("Version=2\n");
    out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml playlist`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/stream/playlist.rs
git commit -m "$(cat <<'EOF'
feat(playlist): serialize streams to M3U8/PLS

to_m3u8/to_pls render the active profile's streams; names are sanitized
of CR/LF so they cannot break the line-oriented format.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Stream probe (liveness + metadata)

**Files:**
- Create: `src-tauri/src/stream/probe.rs`
- Modify: `src-tauri/src/stream/mod.rs`

- [ ] **Step 1: Create the module with a failing test**

Create `src-tauri/src/stream/probe.rs`:

```rust
use crate::profile::AudioFormat;
use crate::stream::{connection, format, playlist};

/// Result of probing a single stream URL. `format`/`bitrate`/`icy_name` are for
/// display only — they are NOT persisted into the imported stream.
#[derive(Debug, Clone)]
pub struct ProbeResult {
    pub url: String,
    pub ok: bool,
    pub icy_name: Option<String>,
    pub bitrate: Option<u32>,
    pub format: Option<AudioFormat>,
    pub error: Option<String>,
}

fn failed(url: &str, error: String) -> ProbeResult {
    ProbeResult { url: url.to_string(), ok: false, icy_name: None, bitrate: None, format: None, error: Some(error) }
}

/// Check whether a stream is reachable and read its ICY metadata. Resolves a
/// nested playlist URL first, connects (10s connect timeout via
/// `connection::connect`), reads headers, then drops the body. The returned
/// `url` is always the original input so the caller can match it.
pub async fn probe(url: &str) -> ProbeResult {
    let resolved = match playlist::resolve_playlist_url(url).await {
        Ok(u) => u,
        Err(e) => return failed(url, e.to_string()),
    };
    match connection::connect(&resolved).await {
        Ok(conn) => {
            let icy_name = conn.headers.name().map(str::to_string);
            let bitrate = conn.headers.bitrate().map(|b| b as u32);
            let format = format::detect_from_content_type(conn.content_type.as_deref().unwrap_or(""));
            drop(conn); // we only needed the headers; discard the response body
            ProbeResult { url: url.to_string(), ok: true, icy_name, bitrate, format, error: None }
        }
        Err(e) => failed(url, e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn probe_unreachable_host_is_not_ok() {
        let r = probe("https://invalid.example.invalid/stream").await;
        assert!(!r.ok);
        assert!(r.error.is_some());
        assert_eq!(r.url, "https://invalid.example.invalid/stream");
    }
}
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/stream/mod.rs`, add the line in alphabetical position (after `pub mod playlist;`):

```rust
pub mod probe;
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml probe_unreachable_host`
Expected: PASS — DNS resolution of `invalid.example.invalid` fails, yielding `ok == false`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/stream/probe.rs src-tauri/src/stream/mod.rs
git commit -m "$(cat <<'EOF'
feat(stream): add probe for liveness + ICY metadata

Reuses connection::connect; resolves nested playlists, reads ICY headers,
drops the body. Metadata is display-only.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: IPC commands for import/export

**Files:**
- Create: `src-tauri/src/commands/stream_io_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create the module with the pure helper + a failing test**

Create `src-tauri/src/commands/stream_io_commands.rs`:

```rust
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
/// a user-picked file. `format` is "m3u8" (default) or "pls".
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
    let (ext, content) = match format.as_str() {
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
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/commands/mod.rs`, add:

```rust
pub mod stream_io_commands;
```

- [ ] **Step 3: Register the commands in the invoke handler**

In `src-tauri/src/lib.rs`, inside `tauri::generate_handler![ ... ]`, add after the `commands::stream_commands::get_all_statuses,` line:

```rust
            commands::stream_io_commands::begin_stream_import,
            commands::stream_io_commands::validate_import_candidates,
            commands::stream_io_commands::commit_stream_import,
            commands::stream_io_commands::export_streams,
```

- [ ] **Step 4: Run the test + full build to verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml build_candidates_marks_existing_urls`
Expected: PASS.

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds without errors (confirms the four commands type-check against the invoke handler).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/stream_io_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
feat(commands): add stream import/export IPC

begin_stream_import (pick + parse + mark duplicates),
validate_import_candidates (concurrent probes via stream-import-progress
events), commit_stream_import (URL-dedup add + single save), export_streams.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: TypeScript IPC wrappers + types

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add types + wrappers**

In `src/lib/tauri.ts`, at the end of the file, add:

```typescript
// ── Stream import/export (Phase 3J) ───────────────────────────────────────

export interface ImportCandidate {
  url: string;
  name: string;
  alreadyInProfile: boolean;
}

export interface ImportProgressPayload {
  url: string;
  status: "checking" | "ok" | "error";
  icyName: string | null;
  bitrate: number | null;
  format: "mp3" | "aac" | null;
  error: string | null;
}

export interface StreamImportResult {
  added: number;
  skipped: number;
}

export async function beginStreamImport(): Promise<ImportCandidate[] | null> {
  return invoke("begin_stream_import");
}
export async function validateImportCandidates(urls: string[]): Promise<void> {
  return invoke("validate_import_candidates", { urls });
}
export async function commitStreamImport(
  selected: { url: string; name: string }[],
): Promise<StreamImportResult> {
  return invoke("commit_stream_import", { selected });
}
export async function exportStreams(format: "m3u8" | "pls"): Promise<void> {
  return invoke("export_streams", { format });
}
```

- [ ] **Step 2: Verify it type-checks via the bundler**

Run: `pnpm vite:build`
Expected: build succeeds (no new TS errors from `tauri.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "$(cat <<'EOF'
feat(ipc): typed wrappers for stream import/export

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Streams store flags

**Files:**
- Modify: `src/stores/streams.ts`

- [ ] **Step 1: Add the stores**

In `src/stores/streams.ts`, after the `import` line add the `ImportCandidate` type to the existing import, then add two stores. Change the top import to:

```typescript
import type { StreamInfo, StreamStatus, ImportCandidate } from "../lib/tauri";
```

And after `export const $editStream = atom<StreamInfo | null>(null);` add:

```typescript
// Import flow: non-null = the ImportStreamsDialog is open with these candidates.
export const $importCandidates = atom<ImportCandidate[] | null>(null);
// Export flow: true = the ExportFormatDialog is open.
export const $showExportStreamsDialog = atom<boolean>(false);
```

- [ ] **Step 2: Verify**

Run: `pnpm vite:build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/stores/streams.ts
git commit -m "$(cat <<'EOF'
feat(stores): add import/export dialog stores for streams

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: i18n messages (uk + en)

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 1: Add Ukrainian keys**

In `src/i18n/messages/uk.json`, add these keys (before the closing `}`; ensure the preceding line ends with a comma):

```json
  "streams_import_action": "Імпортувати потоки…",
  "streams_export_action": "Експортувати потоки…",
  "streams_import_button": "Імпорт…",
  "streams_export_button": "Експорт…",
  "streams_import_title": "Імпорт потоків",
  "streams_export_title": "Експорт потоків",
  "streams_import_none": "Не знайдено потоків у файлі",
  "streams_import_select_all": "Вибрати все",
  "streams_import_deselect_all": "Зняти все",
  "streams_import_select_row": "Вибрати потік: {name}",
  "streams_import_status_checking": "перевіряється…",
  "streams_import_status_ok": "✓ {details}",
  "streams_import_status_error": "✗ {error}",
  "streams_import_status_duplicate": "вже в профілі",
  "streams_import_confirm": "Імпортувати вибрані ({count})",
  "streams_import_progress": "Перевірено {done} з {total}",
  "streams_import_summary": "{ok} працюють, {errors} з помилкою, {duplicates} вже в профілі",
  "streams_import_done": "Імпортовано: {added}, пропущено: {skipped}",
  "streams_export_format_label": "Формат експорту",
  "streams_export_confirm": "Експортувати",
  "streams_export_done": "Список потоків експортовано"
```

- [ ] **Step 2: Add English keys**

In `src/i18n/messages/en.json`, add the matching keys:

```json
  "streams_import_action": "Import streams…",
  "streams_export_action": "Export streams…",
  "streams_import_button": "Import…",
  "streams_export_button": "Export…",
  "streams_import_title": "Import streams",
  "streams_export_title": "Export streams",
  "streams_import_none": "No streams found in the file",
  "streams_import_select_all": "Select all",
  "streams_import_deselect_all": "Deselect all",
  "streams_import_select_row": "Select stream: {name}",
  "streams_import_status_checking": "checking…",
  "streams_import_status_ok": "✓ {details}",
  "streams_import_status_error": "✗ {error}",
  "streams_import_status_duplicate": "already in profile",
  "streams_import_confirm": "Import selected ({count})",
  "streams_import_progress": "Checked {done} of {total}",
  "streams_import_summary": "{ok} working, {errors} failed, {duplicates} already in profile",
  "streams_import_done": "Imported: {added}, skipped: {skipped}",
  "streams_export_format_label": "Export format",
  "streams_export_confirm": "Export",
  "streams_export_done": "Stream list exported"
```

- [ ] **Step 3: Verify the compiled messages build**

Run: `pnpm vite:build`
Expected: build succeeds — the Paraglide vite plugin compiles the new keys into `src/i18n/paraglide/messages` so `m.streams_import_title()` etc. resolve.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json
git commit -m "$(cat <<'EOF'
i18n: add stream import/export strings (uk, en)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: ImportStreamsDialog component

**Files:**
- Create: `src/components/streams/ImportStreamsDialog.tsx`
- Test: `src/components/streams/ImportStreamsDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/streams/ImportStreamsDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportStreamsDialog } from "./ImportStreamsDialog";
import { $importCandidates, $streams } from "../../stores/streams";
import type { ImportCandidate, ImportProgressPayload } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";

let progressHandler: ((p: ImportProgressPayload) => void) | undefined;
vi.mock("../../hooks/useTauriEvent", () => ({
  useTauriEvent: (_event: string, handler: (p: ImportProgressPayload) => void) => {
    progressHandler = handler;
  },
}));

vi.mock("../../lib/tauri", () => ({
  validateImportCandidates: vi.fn(async () => {}),
  commitStreamImport: vi.fn(async () => ({ added: 1, skipped: 0 })),
  getStreams: vi.fn(async () => []),
}));

vi.mock("../../i18n/paraglide/messages", () => ({
  streams_import_title: () => "Import streams",
  streams_import_select_all: () => "Select all",
  streams_import_deselect_all: () => "Deselect all",
  streams_import_select_row: ({ name }: { name: string }) => `Select stream: ${name}`,
  streams_import_status_checking: () => "checking…",
  streams_import_status_ok: ({ details }: { details: string }) => `✓ ${details}`,
  streams_import_status_error: ({ error }: { error: string }) => `✗ ${error}`,
  streams_import_status_duplicate: () => "already in profile",
  streams_import_confirm: ({ count }: { count: number }) => `Import selected (${count})`,
  streams_import_progress: ({ done, total }: { done: number; total: number }) => `Checked ${done} of ${total}`,
  streams_import_summary: ({ ok, errors, duplicates }: { ok: number; errors: number; duplicates: number }) =>
    `${ok} working, ${errors} failed, ${duplicates} already in profile`,
  streams_import_done: ({ added, skipped }: { added: number; skipped: number }) =>
    `Imported: ${added}, skipped: ${skipped}`,
  cancel: () => "Cancel",
}));

const CANDIDATES: ImportCandidate[] = [
  { url: "https://a/1", name: "Alpha", alreadyInProfile: false },
  { url: "https://b/2", name: "Beta", alreadyInProfile: false },
  { url: "https://c/3", name: "Gamma", alreadyInProfile: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  progressHandler = undefined;
  $streams.set([]);
  $importCandidates.set(null);
});

describe("ImportStreamsDialog", () => {
  it("seeds rows, disables duplicates, and auto-starts validation for non-duplicates", async () => {
    $importCandidates.set(CANDIDATES);
    render(<ImportStreamsDialog />);
    await screen.findByText("Alpha");
    // duplicate checkbox disabled, non-duplicates checked
    expect(screen.getByLabelText("Select stream: Gamma")).toBeDisabled();
    expect(screen.getByLabelText("Select stream: Alpha")).toBeChecked();
    await waitFor(() =>
      expect(tauri.validateImportCandidates).toHaveBeenCalledWith(["https://a/1", "https://b/2"]),
    );
  });

  it("updates a row when a probe progress event arrives", async () => {
    $importCandidates.set(CANDIDATES);
    render(<ImportStreamsDialog />);
    await screen.findByText("Alpha");
    act(() => {
      progressHandler?.({ url: "https://a/1", status: "ok", icyName: "Real Name", bitrate: 128, format: "mp3", error: null });
    });
    await screen.findByText("Real Name");
    expect(screen.getByText("✓ 128 kbps · MP3")).toBeInTheDocument();
  });

  it("commits selected streams and refreshes $streams", async () => {
    const user = userEvent.setup();
    $importCandidates.set(CANDIDATES);
    render(<ImportStreamsDialog />);
    await screen.findByText("Alpha");
    await user.click(screen.getByRole("button", { name: "Import selected (2)" }));
    await waitFor(() =>
      expect(tauri.commitStreamImport).toHaveBeenCalledWith([
        { url: "https://a/1", name: "Alpha" },
        { url: "https://b/2", name: "Beta" },
      ]),
    );
    expect(tauri.getStreams).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test ImportStreamsDialog`
Expected: FAIL — `Failed to resolve import "./ImportStreamsDialog"`.

- [ ] **Step 3: Create the component**

Create `src/components/streams/ImportStreamsDialog.tsx`:

```tsx
import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import * as tauri from "../../lib/tauri";
import type { ImportCandidate, ImportProgressPayload } from "../../lib/tauri";
import { $streams, $importCandidates } from "../../stores/streams";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

type RowStatus = "checking" | "ok" | "error" | "duplicate";

interface Row {
  url: string;
  name: string;
  status: RowStatus;
  checked: boolean;
  bitrate: number | null;
  format: string | null;
  error: string | null;
}

function seedRows(candidates: ImportCandidate[]): Row[] {
  return candidates.map((c) => ({
    url: c.url,
    name: c.name,
    status: c.alreadyInProfile ? "duplicate" : "checking",
    checked: !c.alreadyInProfile,
    bitrate: null,
    format: null,
    error: null,
  }));
}

function statusText(r: Row): string {
  if (r.status === "duplicate") return m.streams_import_status_duplicate();
  if (r.status === "checking") return m.streams_import_status_checking();
  if (r.status === "error") return m.streams_import_status_error({ error: r.error ?? "" });
  const details = [r.bitrate ? `${r.bitrate} kbps` : null, r.format ? r.format.toUpperCase() : null]
    .filter(Boolean)
    .join(" · ");
  return m.streams_import_status_ok({ details });
}

export function ImportStreamsDialog() {
  const candidates = useStore($importCandidates);
  const announce = useAnnounce();
  const [rows, setRows] = useState<Row[]>([]);
  const [committing, setCommitting] = useState(false);
  const isOpen = candidates !== null;

  // Seed rows and auto-start validation for non-duplicates when the dialog opens.
  useEffect(() => {
    if (!candidates) {
      setRows([]);
      return;
    }
    setRows(seedRows(candidates));
    const toCheck = candidates.filter((c) => !c.alreadyInProfile).map((c) => c.url);
    if (toCheck.length > 0) {
      tauri.validateImportCandidates(toCheck).catch((e) => addToast(String(e), "error"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  // Live updates from probe progress events.
  const onProgress = useCallback((p: ImportProgressPayload) => {
    setRows((prev) =>
      prev.map((r) =>
        r.url === p.url
          ? {
              ...r,
              status: p.status,
              // A stream that failed its probe defaults to unchecked (but stays
              // enabled — the user may still import an offline station).
              checked: p.status === "error" ? false : r.checked,
              name: p.status === "ok" && p.icyName ? p.icyName : r.name,
              bitrate: p.bitrate ?? r.bitrate,
              format: p.format ?? r.format,
              error: p.error ?? null,
            }
          : r,
      ),
    );
  }, []);
  useTauriEvent<ImportProgressPayload>("stream-import-progress", onProgress);

  const close = () => $importCandidates.set(null);

  const selectable = rows.filter((r) => r.status !== "duplicate");
  const allSelected = selectable.length > 0 && selectable.every((r) => r.checked);
  const selectedCount = selectable.filter((r) => r.checked).length;

  const toggle = (url: string) =>
    setRows((prev) => prev.map((r) => (r.url === url ? { ...r, checked: !r.checked } : r)));
  const toggleAll = () => {
    const next = !allSelected;
    setRows((prev) => prev.map((r) => (r.status === "duplicate" ? r : { ...r, checked: next })));
  };

  // aria-live progress / summary.
  const stillChecking = rows.filter((r) => r.status === "checking").length;
  const totalToCheck = selectable.length;
  const liveMessage =
    stillChecking > 0
      ? m.streams_import_progress({ done: totalToCheck - stillChecking, total: totalToCheck })
      : m.streams_import_summary({
          ok: rows.filter((r) => r.status === "ok").length,
          errors: rows.filter((r) => r.status === "error").length,
          duplicates: rows.filter((r) => r.status === "duplicate").length,
        });

  const handleImport = async () => {
    const selected = selectable.filter((r) => r.checked).map((r) => ({ url: r.url, name: r.name }));
    if (selected.length === 0) return;
    setCommitting(true);
    try {
      const result = await tauri.commitStreamImport(selected);
      $streams.set(await tauri.getStreams());
      const done = m.streams_import_done({ added: result.added, skipped: result.skipped });
      addToast(done, "success");
      announce(done);
      close();
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) close(); }}
    >
      <Modal className="flex max-h-[80vh] w-[32rem] flex-col rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="flex min-h-0 flex-col outline-none" aria-label={m.streams_import_title()}>
          <Heading slot="title" className="mb-3 text-lg font-semibold text-slate-100">
            {m.streams_import_title()}
          </Heading>

          <div aria-live="polite" className="sr-only">{liveMessage}</div>

          <button
            type="button"
            onClick={toggleAll}
            className="mb-2 self-start rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            {allSelected ? m.streams_import_deselect_all() : m.streams_import_select_all()}
          </button>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.url} className="flex items-center gap-2 border-b border-slate-700/50 py-1.5 forced-colors:border-[ButtonText]">
                <input
                  type="checkbox"
                  checked={r.checked}
                  disabled={r.status === "duplicate"}
                  onChange={() => toggle(r.url)}
                  aria-label={m.streams_import_select_row({ name: r.name })}
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">{r.name}</span>
                  <span className="block truncate text-xs text-slate-500">{r.url}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{statusText(r)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.cancel()}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedCount === 0 || committing}
              aria-busy={committing || undefined}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.streams_import_confirm({ count: selectedCount })}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test ImportStreamsDialog`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/ImportStreamsDialog.tsx src/components/streams/ImportStreamsDialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(streams): ImportStreamsDialog with live probe statuses

Selection list with per-row liveness/metadata from stream-import-progress,
select-all, duplicate rows disabled, aria-live progress + summary.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: ExportFormatDialog component

**Files:**
- Create: `src/components/streams/ExportFormatDialog.tsx`
- Test: `src/components/streams/ExportFormatDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/streams/ExportFormatDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportFormatDialog } from "./ExportFormatDialog";
import { $showExportStreamsDialog } from "../../stores/streams";
import * as tauri from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  exportStreams: vi.fn(async () => {}),
}));

vi.mock("../../i18n/paraglide/messages", () => ({
  streams_export_title: () => "Export streams",
  streams_export_format_label: () => "Export format",
  streams_export_confirm: () => "Export",
  streams_export_done: () => "Stream list exported",
  cancel: () => "Cancel",
}));

beforeEach(() => {
  vi.clearAllMocks();
  $showExportStreamsDialog.set(false);
});

describe("ExportFormatDialog", () => {
  it("defaults to M3U8 and exports it", async () => {
    const user = userEvent.setup();
    $showExportStreamsDialog.set(true);
    render(<ExportFormatDialog />);
    await screen.findByRole("radiogroup", { name: "Export format" });
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalledWith("m3u8"));
  });

  it("exports PLS when selected", async () => {
    const user = userEvent.setup();
    $showExportStreamsDialog.set(true);
    render(<ExportFormatDialog />);
    await user.click(screen.getByRole("radio", { name: "PLS" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalledWith("pls"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test ExportFormatDialog`
Expected: FAIL — `Failed to resolve import "./ExportFormatDialog"`.

- [ ] **Step 3: Create the component**

Create `src/components/streams/ExportFormatDialog.tsx`:

```tsx
import { Dialog, Modal, ModalOverlay, Heading, RadioGroup, Radio } from "react-aria-components";
import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import * as tauri from "../../lib/tauri";
import { $showExportStreamsDialog } from "../../stores/streams";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

export function ExportFormatDialog() {
  const isOpen = useStore($showExportStreamsDialog);
  const announce = useAnnounce();
  const [format, setFormat] = useState<"m3u8" | "pls">("m3u8");
  const [busy, setBusy] = useState(false);

  // Reset to default each time the dialog opens.
  useEffect(() => {
    if (isOpen) setFormat("m3u8");
  }, [isOpen]);

  const close = () => $showExportStreamsDialog.set(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      await tauri.exportStreams(format);
      announce(m.streams_export_done());
      close();
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) close(); }}
    >
      <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none" aria-label={m.streams_export_title()}>
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {m.streams_export_title()}
          </Heading>
          <RadioGroup
            aria-label={m.streams_export_format_label()}
            value={format}
            onChange={(v) => setFormat(v as "m3u8" | "pls")}
            className="flex flex-col gap-2 text-sm text-slate-200"
          >
            <Radio value="m3u8" className="flex items-center gap-2 cursor-pointer">M3U8</Radio>
            <Radio value="pls" className="flex items-center gap-2 cursor-pointer">PLS</Radio>
          </RadioGroup>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.cancel()}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy}
              aria-busy={busy || undefined}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.streams_export_confirm()}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test ExportFormatDialog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/ExportFormatDialog.tsx src/components/streams/ExportFormatDialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(streams): ExportFormatDialog (M3U8/PLS radio choice)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire dialogs + buttons into StreamsPanel

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`

This adds Import/Export to the non-empty toolbar (next to "Додати потік"), an Import button to the empty state, and renders both dialogs. The toolbar roving-focus list grows from 6 to 8 items.

- [ ] **Step 1: Update imports**

In `src/components/streams/StreamsPanel.tsx`, change the streams-store import (line 4) and add the dialog imports. Replace:

```typescript
import { $streams, $statuses, $showAddStreamDialog, $streamFilter, type StreamFilter } from "../../stores/streams";
```

with:

```typescript
import { $streams, $statuses, $showAddStreamDialog, $streamFilter, $importCandidates, $showExportStreamsDialog, type StreamFilter } from "../../stores/streams";
```

And after the `import { AddStreamDialog } from "./AddStreamDialog";` line add:

```typescript
import { ImportStreamsDialog } from "./ImportStreamsDialog";
import { ExportFormatDialog } from "./ExportFormatDialog";
```

- [ ] **Step 2: Add the import/export handlers**

In `StreamsPanel`, just before `const emptyDescId = "streams-empty-desc";`, add:

```typescript
  const handleImport = async () => {
    try {
      const candidates = await tauri.beginStreamImport();
      if (!candidates) { addToast(m.streams_import_none(), "info"); return; }
      $importCandidates.set(candidates);
    } catch (e) {
      addToast(String(e), "error");
    }
  };
```

- [ ] **Step 3: Add the empty-state Import button + roving ref**

Replace the empty-state refs block:

```typescript
  const emptyZoneRef      = useRef<HTMLDivElement | null>(null);
  const emptyCtaRef       = useRef<HTMLButtonElement | null>(null);
  const emptyBtns = useMemo(() => [emptyCtaRef], []);
```

with:

```typescript
  const emptyZoneRef      = useRef<HTMLDivElement | null>(null);
  const emptyCtaRef       = useRef<HTMLButtonElement | null>(null);
  const emptyImportRef    = useRef<HTMLButtonElement | null>(null);
  const emptyBtns = useMemo(() => [emptyCtaRef, emptyImportRef], []);
```

Then in the empty-state JSX, replace the single CTA button block:

```tsx
          <button
            ref={emptyCtaRef}
            tabIndex={emptyTabIndex(0)}
            aria-describedby={emptyDescId}
            onClick={() => $showAddStreamDialog.set(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
          >
            {m.add_stream()}
          </button>
```

with:

```tsx
          <div className="flex items-center gap-3">
            <button
              ref={emptyCtaRef}
              tabIndex={emptyTabIndex(0)}
              aria-describedby={emptyDescId}
              onClick={() => $showAddStreamDialog.set(true)}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            >
              {m.add_stream()}
            </button>
            <button
              ref={emptyImportRef}
              tabIndex={emptyTabIndex(1)}
              onClick={handleImport}
              className="rounded px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.streams_import_button()}
            </button>
          </div>
```

- [ ] **Step 4: Grow the toolbar refs from 6 to 8 items**

Replace the toolbar refs block:

```typescript
  // ── Toolbar zone refs (6 items) ──────────────────────────
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const addBtn       = useRef<HTMLButtonElement | null>(null);
  const recordAllBtn = useRef<HTMLButtonElement | null>(null);
  const stopAllBtn   = useRef<HTMLButtonElement | null>(null);
  const chip0Ref   = useRef<HTMLButtonElement | null>(null);
  const chip1Ref   = useRef<HTMLButtonElement | null>(null);
  const chip2Ref   = useRef<HTMLButtonElement | null>(null);
  const chipRefs = useMemo(() => [chip0Ref, chip1Ref, chip2Ref], []);
  const toolbarRefs = useMemo(
    () => [addBtn, recordAllBtn, stopAllBtn, chip0Ref, chip1Ref, chip2Ref],
    [],
  );
```

with:

```typescript
  // ── Toolbar zone refs (8 items) ──────────────────────────
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const addBtn       = useRef<HTMLButtonElement | null>(null);
  const importBtn    = useRef<HTMLButtonElement | null>(null);
  const exportBtn    = useRef<HTMLButtonElement | null>(null);
  const recordAllBtn = useRef<HTMLButtonElement | null>(null);
  const stopAllBtn   = useRef<HTMLButtonElement | null>(null);
  const chip0Ref   = useRef<HTMLButtonElement | null>(null);
  const chip1Ref   = useRef<HTMLButtonElement | null>(null);
  const chip2Ref   = useRef<HTMLButtonElement | null>(null);
  const chipRefs = useMemo(() => [chip0Ref, chip1Ref, chip2Ref], []);
  const toolbarRefs = useMemo(
    () => [addBtn, importBtn, exportBtn, recordAllBtn, stopAllBtn, chip0Ref, chip1Ref, chip2Ref],
    [],
  );
```

- [ ] **Step 5: Add Import/Export buttons to the header and re-index the toolbar**

Replace the `ScreenHeader` block (Row 1):

```tsx
            {/* Row 1: Title + Додати (Index 0) */}
            <ScreenHeader title={m.streams_section()}>
              <button
                ref={addBtn}
                tabIndex={toolbarTabIndex(0)}
                onClick={() => $showAddStreamDialog.set(true)}
                className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
              >
                {m.add_stream()}
              </button>
            </ScreenHeader>
```

with:

```tsx
            {/* Row 1: Title + Додати (0) + Імпорт (1) + Експорт (2) */}
            <ScreenHeader title={m.streams_section()}>
              <button
                ref={addBtn}
                tabIndex={toolbarTabIndex(0)}
                onClick={() => $showAddStreamDialog.set(true)}
                className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
              >
                {m.add_stream()}
              </button>
              <button
                ref={importBtn}
                tabIndex={toolbarTabIndex(1)}
                onClick={handleImport}
                className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {m.streams_import_button()}
              </button>
              <button
                ref={exportBtn}
                tabIndex={toolbarTabIndex(2)}
                onClick={() => $showExportStreamsDialog.set(true)}
                className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {m.streams_export_button()}
              </button>
            </ScreenHeader>
```

Then re-index Row 2. Change the "Записати все" button from `toolbarTabIndex(1)` to `toolbarTabIndex(3)`, "Зупинити запис" from `toolbarTabIndex(2)` to `toolbarTabIndex(4)`, and the chips from `toolbarTabIndex(3 + i)` to `toolbarTabIndex(5 + i)`. Concretely:

- `recordAllBtn` button: `tabIndex={toolbarTabIndex(1)}` → `tabIndex={toolbarTabIndex(3)}`
- `stopAllBtn` button: `tabIndex={toolbarTabIndex(2)}` → `tabIndex={toolbarTabIndex(4)}`
- chip button: `tabIndex={toolbarTabIndex(3 + i)}` → `tabIndex={toolbarTabIndex(5 + i)}`

- [ ] **Step 6: Render the dialogs**

Replace `<AddStreamDialog />` with:

```tsx
      <AddStreamDialog />
      <ImportStreamsDialog />
      <ExportFormatDialog />
```

- [ ] **Step 7: Verify build + existing tests**

Run: `pnpm vite:build`
Expected: build succeeds.

Run: `pnpm test`
Expected: all tests pass (no StreamsPanel test regressions).

- [ ] **Step 8: Manual NVDA smoke check**

Run `pnpm dev`. With NVDA on: Tab into the Streams toolbar — confirm Додати / Імпорт… / Експорт… are reachable with Left/Right arrows and announced. Open Імпорт…, pick a `.m3u`/`.pls` file, confirm rows announce status updates and "Перевірено X з N", import selected, confirm streams appear. Then Експорт…, choose a format, confirm a file is written. (No automated test covers the panel wiring.)

- [ ] **Step 9: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx
git commit -m "$(cat <<'EOF'
feat(streams): wire import/export into StreamsPanel

Import/Export buttons in the toolbar (roving 0–7) and an Import button in
the empty state; render ImportStreamsDialog + ExportFormatDialog.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: CommandPalette entries

**Files:**
- Modify: `src/components/common/CommandPalette.tsx`

- [ ] **Step 1: Update imports**

In `src/components/common/CommandPalette.tsx`, replace the streams-store import (line 3):

```typescript
import { $streams, $statuses, $showAddStreamDialog } from "../../stores/streams";
```

with:

```typescript
import { $streams, $statuses, $showAddStreamDialog, $importCandidates, $showExportStreamsDialog } from "../../stores/streams";
```

- [ ] **Step 2: Add the two palette items**

In the `allItems` array, after the `add-stream` item object (before `record-all`), add:

```typescript
    {
      id: "import-streams",
      label: m.streams_import_action(),
      action: async () => {
        close();
        try {
          const candidates = await tauri.beginStreamImport();
          if (!candidates) { addToast(m.streams_import_none(), "info"); return; }
          $importCandidates.set(candidates);
        } catch (e) {
          addToast(String(e), "error");
        }
      },
    },
    {
      id: "export-streams",
      label: m.streams_export_action(),
      action: () => {
        close();
        $showExportStreamsDialog.set(true);
      },
    },
```

- [ ] **Step 3: Verify build**

Run: `pnpm vite:build`
Expected: build succeeds.

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/CommandPalette.tsx
git commit -m "$(cat <<'EOF'
feat(palette): add import/export streams commands

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Roadmap — Phase 3J

**Files:**
- Modify: `docs/implementation-phases.md`

- [ ] **Step 1: Add the 3J summary row**

In `docs/implementation-phases.md`, in the "Зведена таблиця" table, after the `3I` row add:

```markdown
| 3J | Stream Import/Export | Імпорт/експорт потоків профілю (M3U8/PLS) з перевіркою | ✅ Complete |
```

And in the "Зведена таблиця підфаз" table, after the `3I` row add:

```markdown
| 3J | Stream Import/Export (M3U8/PLS) | Phase 1 (stream::playlist) | 🟡 Середня |
```

- [ ] **Step 2: Add the 3J section**

After the "Фаза 3I — Polish Bundle" section (after its `#### 3I-4` block and before "## Залежності між фазами"), add:

```markdown
---

### Фаза 3J — Stream Import/Export (M3U8/PLS)

**Ціль:** імпорт і експорт списку потоків активного профілю у форматах M3U8/PLS,
з перевіркою працездатності та діалогом вибору при імпорті.

**Залежності:** Phase 1 (`stream::playlist`, `stream::connection`)

**Backend:**

| Модуль | Опис |
|--------|------|
| `stream::playlist` (розшир.) | `parse_pls_all`/`parse_m3u_all`/`parse_playlist_all`, `to_m3u8`/`to_pls` |
| `stream::probe` | Перевірка працездатності + ICY-метадані (поверх `connection::connect`) |
| `commands::stream_io_commands` | IPC: `begin_stream_import`, `validate_import_candidates`, `commit_stream_import`, `export_streams` |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `ImportStreamsDialog.tsx` | Список кандидатів, живі статуси перевірки, вибір, коміт |
| `ExportFormatDialog.tsx` | Вибір формату M3U8/PLS |
| `StreamsPanel.tsx` (розшир.) | Кнопки «Імпорт…»/«Експорт…» у тулбарі + «Імпорт…» в empty-state |

**Критерії "Done":**
- [x] Імпорт `.m3u/.m3u8/.pls` (формат за вмістом, не лише за розширенням)
- [x] Перевірка кожного потоку на працездатність (concurrency), живі статуси через `stream-import-progress`
- [x] Діалог вибору потоків; дублікати позначені й вимкнені; помилкові — доступні
- [x] Імпорт зберігає лише назву (ICY→Title→URL); інші метадані заповнюються при першому записі
- [x] Експорт усіх потоків профілю у M3U8/PLS (без credentials)
- [x] NVDA: aria-live прогрес/підсумок, доступні чекбокси й radio-group

**Відкладено (майбутнє в межах 3J):**
- [ ] Оновлення назви/метаданих існуючого потоку з результату перевірки при імпорті дубліката (поки що дублікати просто пропускаються)
```

- [ ] **Step 3: Verify the doc renders**

Read the changed sections back and confirm the tables are well-formed (no broken pipes) and the deferred item is present.

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-phases.md
git commit -m "$(cat <<'EOF'
docs: add Phase 3J (Stream Import/Export) to roadmap

Includes the deferred 'update duplicate name/metadata from probe' item.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] Run all Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml` → all pass.
- [ ] Run all frontend tests: `pnpm test` → all pass.
- [ ] Build the frontend: `pnpm vite:build` → succeeds.
- [ ] Manual NVDA pass of import (with a real `.m3u`/`.pls`) and export, per Task 10 Step 8.
