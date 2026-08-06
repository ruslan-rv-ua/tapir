# Stream Name Disambiguation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make streams with identical station names distinguishable — a one-time ASCII suffix at add time (`Radio X (AAC 64k)`), a duplicate-URL warning, and `%s` always taken from the profile name so recording folders never merge.

**Architecture:** One pure Rust module `src-tauri/src/naming.rs` owns every naming decision (collision key, suffix format, ordinal fallback). Four call sites feed it: `add_stream`, the browser append helper, the import commit, and the ICY auto-rename in `stream/manager.rs`. The frontend gains a single pre-flight IPC (`check_stream_conflicts`) that surfaces duplicate-URL and name-collision warnings in the Add/Edit dialog without ever blocking the user.

**Tech Stack:** Rust (Tauri v2, tokio, serde), React 19 + react-aria-components, nanostores, Paraglide i18n, vitest + `cargo test`.

## Global Constraints

- Suffix format is **ASCII and never localized**: `(AAC 64k)`, `(AAC)`, `(2)`, `(AAC 64k) (2)`. The name becomes a directory on disk; it must not depend on UI language.
- A suffix is **assigned once, at add time, and never revised automatically**. No `(2)` → `(AAC 64k)` "upgrades" on later connections.
- Collision is decided on the **sanitized** name (`sanitize::sanitize_component`, i.e. what becomes the `%s` folder), compared **case-insensitively** (NTFS semantics).
- `%s` is **always** `StreamInfo.name`. Never the raw ICY name.
- Manual rename is **warned about, never blocked and never silently suffixed**.
- **Existing profiles are not touched** — the rule applies forward only (new adds, ICY updates). No migration on load.
- Stream identity is the **URL**. Two entries with the same URL stay a warning, not a ban, on manual add.
- Backend-first: naming logic lives in Rust; React only renders and warns.
- Gates: `pnpm test` and `pnpm vite:build` must pass. `cargo test` must pass for the Rust side. `tsc` is **not** a gate (~51 pre-existing paraglide errors).
- Respond in Ukrainian; user-facing strings go in both `src/i18n/messages/uk.json` and `en.json`.

## File Structure

| File | Responsibility |
|------|----------------|
| `src-tauri/src/naming.rs` | **New.** Pure naming logic: `collision_key`, `NameMeta`, `disambiguate`, `disambiguate_batch`, `taken_keys`, `icy_rename`. No Tauri, no I/O — fully unit-testable. |
| `src-tauri/src/lib.rs` | Register `mod naming;` and the new `check_stream_conflicts` command. |
| `src-tauri/src/commands/stream_commands.rs` | `add_stream` gains probe metadata + auto-suffix; new `find_conflicts` (pure) + `check_stream_conflicts` command. |
| `src-tauri/src/commands/stream_io_commands.rs` | `ProbeVerdict` carries `bitrate`/`format`; `SelectedStream` carries them too; `commit_stream_import` suffixes against profile **and** batch. |
| `src-tauri/src/commands/browser_commands.rs` | `append_streams_to_active_profile` suffixes the batch (covers single add, bulk add, examples). |
| `src-tauri/src/stream/manager.rs` | ICY auto-rename goes through `naming::icy_rename`; the recorder's `station_name` becomes the profile name. |
| `src/lib/tauri.ts` | Typed wrappers: `addStream` meta arg, `ProbeVerdict` fields, `checkStreamConflicts`, `commitStreamImport` meta. |
| `src/components/streams/AddStreamDialog.tsx` | Probe metadata pass-through, duplicate-URL warning, rename-collision warning, "use official name" button. |
| `src/components/streams/ImportStreamsDialog.tsx` | Send each row's probed bitrate/format on commit. |
| `src/components/browser/StationItem.tsx` | Row accessible name gains codec + bitrate. |
| `src/components/browser/StationList.tsx` | Announce instead of silently ignoring an add on an already-added station. |
| `src/i18n/messages/{uk,en}.json` | New warning/button strings. |
| `docs/data-models.md` | Document the naming rule under §3.1. |
| `docs/backlog/…` | Close the record: front-matter → done, `git mv` to `done/`, ROADMAP row moved. |

---

### Task 1: Pure naming module

**Files:**
- Create: `src-tauri/src/naming.rs`
- Modify: `src-tauri/src/lib.rs` (module list, after `mod errors;`)
- Test: inline `#[cfg(test)] mod tests` in `src-tauri/src/naming.rs`

**Interfaces:**
- Consumes: `crate::sanitize::sanitize_component`, `crate::profile::{AudioFormat, StreamInfo}`
- Produces:
  - `pub fn collision_key(name: &str) -> String`
  - `pub struct NameMeta { pub format: Option<AudioFormat>, pub bitrate: Option<u32> }` (derives `Debug, Clone, Default`)
  - `pub fn disambiguate(desired: &str, meta: &NameMeta, taken: &HashSet<String>) -> String`
  - `pub fn taken_keys<'a>(streams: impl IntoIterator<Item = &'a StreamInfo>, exclude_id: Option<&str>) -> HashSet<String>`
  - `pub fn disambiguate_batch(streams: &mut [StreamInfo], taken: &mut HashSet<String>)`
  - `pub fn icy_rename(current: &str, url: &str, icy_name: &str, meta: &NameMeta, taken: &HashSet<String>) -> Option<String>`

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/naming.rs` with only the test module plus `use` lines, so the file fails to compile against missing items:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn keys(names: &[&str]) -> HashSet<String> {
        names.iter().map(|n| collision_key(n)).collect()
    }

    fn meta(format: Option<AudioFormat>, bitrate: Option<u32>) -> NameMeta {
        NameMeta { format, bitrate }
    }

    #[test]
    fn collision_key_is_sanitized_and_case_insensitive() {
        // `%s` turns both into the same folder, and NTFS ignores case.
        assert_eq!(collision_key("Radio X"), collision_key("radio x"));
        assert_eq!(collision_key("Radio/X"), collision_key("Radio_X"));
        assert_eq!(collision_key("  Radio X  "), collision_key("Radio X"));
        assert_ne!(collision_key("Radio X"), collision_key("Radio Y"));
    }

    #[test]
    fn free_name_is_returned_untouched() {
        let taken = keys(&["Other"]);
        assert_eq!(disambiguate("Radio X", &meta(None, None), &taken), "Radio X");
    }

    #[test]
    fn collision_appends_codec_and_bitrate() {
        let taken = keys(&["Radio X"]);
        let got = disambiguate("Radio X", &meta(Some(AudioFormat::Aac), Some(64)), &taken);
        assert_eq!(got, "Radio X (AAC 64k)");
    }

    #[test]
    fn codec_only_when_bitrate_unknown() {
        let taken = keys(&["Radio X"]);
        assert_eq!(
            disambiguate("Radio X", &meta(Some(AudioFormat::Aac), None), &taken),
            "Radio X (AAC)"
        );
    }

    #[test]
    fn bitrate_only_when_codec_unknown() {
        let taken = keys(&["Radio X"]);
        assert_eq!(disambiguate("Radio X", &meta(None, Some(128)), &taken), "Radio X (128k)");
    }

    #[test]
    fn zero_bitrate_counts_as_unknown() {
        let taken = keys(&["Radio X"]);
        assert_eq!(
            disambiguate("Radio X", &meta(Some(AudioFormat::Mp3), Some(0)), &taken),
            "Radio X (MP3)"
        );
    }

    #[test]
    fn ordinal_when_no_metadata_at_all() {
        let taken = keys(&["Radio X"]);
        assert_eq!(disambiguate("Radio X", &meta(None, None), &taken), "Radio X (2)");
    }

    #[test]
    fn ordinal_stacks_on_a_colliding_informative_suffix() {
        let taken = keys(&["Radio X", "Radio X (AAC 64k)"]);
        let got = disambiguate("Radio X", &meta(Some(AudioFormat::Aac), Some(64)), &taken);
        assert_eq!(got, "Radio X (AAC 64k) (2)");
    }

    #[test]
    fn ordinal_keeps_counting_past_two() {
        let taken = keys(&["Radio X", "Radio X (2)", "Radio X (3)"]);
        assert_eq!(disambiguate("Radio X", &meta(None, None), &taken), "Radio X (4)");
    }

    #[test]
    fn collision_ignores_case_of_the_existing_name() {
        let taken = keys(&["RADIO X"]);
        assert_eq!(disambiguate("Radio X", &meta(None, None), &taken), "Radio X (2)");
    }

    #[test]
    fn batch_distinguishes_arrivals_from_each_other() {
        let mut batch = vec![
            stream("a", "http://a", "BBC 6", Some(AudioFormat::Aac), Some(48)),
            stream("b", "http://b", "BBC 6", Some(AudioFormat::Mp3), Some(128)),
            stream("c", "http://c", "BBC 6", None, None),
        ];
        let mut taken = HashSet::new();
        disambiguate_batch(&mut batch, &mut taken);
        assert_eq!(batch[0].name, "BBC 6");
        assert_eq!(batch[1].name, "BBC 6 (MP3 128k)");
        assert_eq!(batch[2].name, "BBC 6 (2)");
    }

    #[test]
    fn taken_keys_skips_the_excluded_stream() {
        let streams = vec![
            stream("a", "http://a", "Radio X", None, None),
            stream("b", "http://b", "Radio Y", None, None),
        ];
        let all = taken_keys(streams.iter(), None);
        assert!(all.contains(&collision_key("Radio X")));
        let without_a = taken_keys(streams.iter(), Some("a"));
        assert!(!without_a.contains(&collision_key("Radio X")));
        assert!(without_a.contains(&collision_key("Radio Y")));
    }

    #[test]
    fn icy_rename_only_touches_a_never_named_stream() {
        let taken = HashSet::new();
        // name == url -> the placeholder add_stream leaves when no name was typed
        assert_eq!(
            icy_rename("http://a", "http://a", "Radio X", &meta(None, None), &taken),
            Some("Radio X".to_string())
        );
        // a name the user (or the browser) chose is never overwritten
        assert_eq!(icy_rename("My Name", "http://a", "Radio X", &meta(None, None), &taken), None);
    }

    #[test]
    fn icy_rename_suffixes_against_the_profile() {
        let taken = keys(&["Radio X"]);
        let got = icy_rename(
            "http://a",
            "http://a",
            "Radio X",
            &meta(Some(AudioFormat::Aac), Some(64)),
            &taken,
        );
        assert_eq!(got, Some("Radio X (AAC 64k)".to_string()));
    }

    #[test]
    fn icy_rename_ignores_a_blank_icy_name() {
        let taken = HashSet::new();
        assert_eq!(icy_rename("http://a", "http://a", "   ", &meta(None, None), &taken), None);
    }

    fn stream(
        id: &str,
        url: &str,
        name: &str,
        format: Option<AudioFormat>,
        bitrate: Option<u32>,
    ) -> StreamInfo {
        StreamInfo {
            id: id.into(),
            url: url.into(),
            name: name.into(),
            format,
            bitrate,
            icy_name: None,
            icy_genre: None,
            icy_url: None,
            ignorelist: vec![],
            username: None,
            password: None,
            added_at: "2026-01-01".into(),
        }
    }
}
```

Add `mod naming;` to `src-tauri/src/lib.rs` immediately after `mod errors;`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test naming`
Expected: compile errors — `cannot find function collision_key`, `cannot find type NameMeta`, etc.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/naming.rs` (above the test module):

```rust
//! How a stream gets the name it is stored — and recorded — under.
//!
//! One station commonly publishes several streams (Icecast mountpoints with
//! different codecs, or plain mirrors) under one identical `icy-name`, and
//! Radio Browser lists each as its own entry. Identical names are
//! indistinguishable in the list (especially read aloud) and, worse, `%s`
//! turns them into ONE recording folder where simultaneous recordings of the
//! same track collide.
//!
//! The rule: names must be *distinguishable*, not forcibly unique. A colliding
//! arrival gets an ASCII suffix once, at add time, and keeps it forever — the
//! name is a directory, so stability beats accuracy, and a name that changes
//! by itself is a lie to a screen reader.

use crate::profile::{AudioFormat, StreamInfo};
use crate::sanitize::sanitize_component;
use std::collections::HashSet;

/// Upper bound for the ordinal fallback, mirroring `sanitize::resolve_collision`.
const MAX_ORDINAL: u32 = 9999;

/// The value two names are compared by. Two streams collide when their names
/// sanitize to the same `%s` folder, ignoring case — NTFS treats `Radio X` and
/// `radio x` as one directory, so a case-only difference would still merge the
/// recordings.
pub fn collision_key(name: &str) -> String {
    sanitize_component(name.trim()).to_lowercase()
}

/// What is known about a stream at the moment it is added. Both fields are
/// optional: a failed probe or a bare playlist entry knows neither.
#[derive(Debug, Clone, Default)]
pub struct NameMeta {
    pub format: Option<AudioFormat>,
    pub bitrate: Option<u32>,
}

fn codec_label(format: &AudioFormat) -> &'static str {
    match format {
        AudioFormat::Mp3 => "MP3",
        AudioFormat::Aac => "AAC",
    }
}

/// `(AAC 64k)`, `(AAC)`, `(128k)` — or `None` when nothing is known and the
/// caller has to fall back to an ordinal. Deliberately ASCII and unlocalized.
fn informative_suffix(meta: &NameMeta) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Some(format) = &meta.format {
        parts.push(codec_label(format).to_string());
    }
    if let Some(bitrate) = meta.bitrate.filter(|b| *b > 0) {
        parts.push(format!("{bitrate}k"));
    }
    if parts.is_empty() {
        None
    } else {
        Some(format!("({})", parts.join(" ")))
    }
}

/// The name `desired` should actually be stored under, given the collision keys
/// already `taken`. Free names come back untouched; a collision gets the
/// informative suffix, and an ordinal on top of that if even the suffixed name
/// is taken (two truly identical variants).
pub fn disambiguate(desired: &str, meta: &NameMeta, taken: &HashSet<String>) -> String {
    let desired = desired.trim();
    if !taken.contains(&collision_key(desired)) {
        return desired.to_string();
    }
    let base = match informative_suffix(meta) {
        Some(suffix) => {
            let candidate = format!("{desired} {suffix}");
            if !taken.contains(&collision_key(&candidate)) {
                return candidate;
            }
            candidate
        }
        None => desired.to_string(),
    };
    for n in 2..=MAX_ORDINAL {
        let candidate = format!("{base} ({n})");
        if !taken.contains(&collision_key(&candidate)) {
            return candidate;
        }
    }
    base
}

/// Collision keys of every stream, optionally skipping one id — pass the id of
/// the stream being renamed so its own current name is not a conflict.
pub fn taken_keys<'a>(
    streams: impl IntoIterator<Item = &'a StreamInfo>,
    exclude_id: Option<&str>,
) -> HashSet<String> {
    streams
        .into_iter()
        .filter(|s| Some(s.id.as_str()) != exclude_id)
        .map(|s| collision_key(&s.name))
        .collect()
}

/// Name a whole batch in arrival order, so two streams arriving together are
/// also distinguished from each other — a playlist listing every mountpoint of
/// one station is the usual source of same-name pairs. `taken` is updated as it
/// goes; seed it from the destination profile via [`taken_keys`].
pub fn disambiguate_batch(streams: &mut [StreamInfo], taken: &mut HashSet<String>) {
    for stream in streams.iter_mut() {
        let meta = NameMeta { format: stream.format.clone(), bitrate: stream.bitrate };
        stream.name = disambiguate(&stream.name, &meta, taken);
        taken.insert(collision_key(&stream.name));
    }
}

/// The name an ICY-discovered station name should give a stream, or `None` when
/// the stream keeps what it has. Only a never-named stream is renamed —
/// `add_stream` stores the URL as the name when the user typed none, so
/// `current == url` is exactly "this stream has no human name yet". A name the
/// user or the station directory chose is never overwritten.
pub fn icy_rename(
    current: &str,
    url: &str,
    icy_name: &str,
    meta: &NameMeta,
    taken: &HashSet<String>,
) -> Option<String> {
    if current != url {
        return None;
    }
    let icy_name = icy_name.trim();
    if icy_name.is_empty() {
        return None;
    }
    Some(disambiguate(icy_name, meta, taken))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test naming`
Expected: all 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/naming.rs src-tauri/src/lib.rs
git commit -m "feat(naming): pure stream-name disambiguation module"
```

---

### Task 2: Probe verdict carries metadata; `add_stream` auto-suffixes

**Files:**
- Modify: `src-tauri/src/commands/stream_io_commands.rs` (`ProbeVerdict`, `probe_once`)
- Modify: `src-tauri/src/commands/stream_commands.rs` (`add_stream`)
- Test: inline `#[cfg(test)] mod tests` in `src-tauri/src/commands/stream_commands.rs`

**Interfaces:**
- Consumes: `naming::{disambiguate, taken_keys, NameMeta}` from Task 1.
- Produces:
  - `ProbeVerdict { ok: bool, error: Option<String>, bitrate: Option<u32>, format: Option<AudioFormat> }`
  - `add_stream(url: String, name: Option<String>, bitrate: Option<u32>, format: Option<AudioFormat>) -> Result<StreamInfo, String>`
  - `pub fn build_added_stream(streams: &[StreamInfo], resolved_url: String, name: Option<String>, bitrate: Option<u32>, format: Option<AudioFormat>, now: String) -> StreamInfo`

- [ ] **Step 1: Write the failing test**

Append to the `tests` module of `src-tauri/src/commands/stream_commands.rs`:

```rust
    fn named(id: &str, name: &str) -> StreamInfo {
        StreamInfo { id: id.into(), name: name.into(), url: format!("http://{id}"), ..sample() }
    }

    #[test]
    fn added_stream_keeps_a_free_name_and_persists_probe_metadata() {
        let existing = vec![named("a", "Other")];
        let got = build_added_stream(
            &existing,
            "http://new".into(),
            Some("  Radio X  ".into()),
            Some(64),
            Some(AudioFormat::Aac),
            "NOW".into(),
        );
        assert_eq!(got.name, "Radio X"); // trimmed, unsuffixed
        assert_eq!(got.url, "http://new");
        assert_eq!(got.bitrate, Some(64));
        assert_eq!(got.format, Some(AudioFormat::Aac));
        assert_eq!(got.added_at, "NOW");
    }

    #[test]
    fn added_stream_suffixes_a_colliding_name_from_probe_metadata() {
        let existing = vec![named("a", "Radio X")];
        let got = build_added_stream(
            &existing,
            "http://new".into(),
            Some("Radio X".into()),
            Some(64),
            Some(AudioFormat::Aac),
            "NOW".into(),
        );
        assert_eq!(got.name, "Radio X (AAC 64k)");
    }

    #[test]
    fn added_stream_falls_back_to_an_ordinal_when_the_probe_failed() {
        let existing = vec![named("a", "Radio X")];
        let got = build_added_stream(
            &existing,
            "http://new".into(),
            Some("Radio X".into()),
            None,
            None,
            "NOW".into(),
        );
        assert_eq!(got.name, "Radio X (2)");
    }

    #[test]
    fn added_stream_without_a_name_stores_the_url_and_is_never_suffixed() {
        // No name -> the URL is the placeholder; ICY auto-naming replaces it on
        // the first connection. A URL is unique already, so no suffix.
        let existing = vec![named("a", "Radio X")];
        let got = build_added_stream(&existing, "http://new".into(), None, None, None, "NOW".into());
        assert_eq!(got.name, "http://new");
    }

    #[test]
    fn added_stream_treats_a_blank_name_as_no_name() {
        let got = build_added_stream(&[], "http://new".into(), Some("   ".into()), None, None, "NOW".into());
        assert_eq!(got.name, "http://new");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test build_added_stream`
Expected: FAIL — `cannot find function build_added_stream in this scope`.

- [ ] **Step 3: Write the implementation**

In `src-tauri/src/commands/stream_io_commands.rs`, replace the `ProbeVerdict` struct and `probe_once`:

```rust
/// Verdict of a single interactive probe (`probe_stream`). `bitrate`/`format`
/// are what the Add-stream dialog feeds back into `add_stream` so a colliding
/// name can be suffixed informatively (`Radio X (AAC 64k)`) instead of getting
/// a bare ordinal.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeVerdict {
    pub ok: bool,
    pub error: Option<String>,
    pub bitrate: Option<u32>,
    pub format: Option<AudioFormat>,
}
```

```rust
pub(crate) async fn probe_once(url: &str) -> ProbeVerdict {
    match tokio::time::timeout(SINGLE_PROBE_TIMEOUT, probe::probe(url)).await {
        Ok(r) => ProbeVerdict { ok: r.ok, error: r.error, bitrate: r.bitrate, format: r.format },
        Err(_) => ProbeVerdict {
            ok: false,
            error: Some(format!("Timed out after {}s", SINGLE_PROBE_TIMEOUT.as_secs())),
            bitrate: None,
            format: None,
        },
    }
}
```

In `src-tauri/src/commands/stream_commands.rs`, add `use crate::profile::AudioFormat;` to the existing `use crate::profile::{Profile, StreamInfo};` line (making it `use crate::profile::{AudioFormat, Profile, StreamInfo};`), then replace `add_stream` with:

```rust
/// Build the `StreamInfo` a manual add inserts. An explicit name that collides
/// with a stream already in the profile is suffixed once, here, using whatever
/// the Add-stream dialog's probe learned (`Radio X (AAC 64k)`, or `Radio X (2)`
/// when the probe failed and the user added anyway). No name at all means the
/// URL is stored as a placeholder — unique by construction, and replaced by the
/// ICY auto-naming on the first connection. Pure over the profile —
/// unit-testable without Tauri state.
pub fn build_added_stream(
    streams: &[StreamInfo],
    resolved_url: String,
    name: Option<String>,
    bitrate: Option<u32>,
    format: Option<AudioFormat>,
    now: String,
) -> StreamInfo {
    let requested = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let stream_name = match requested {
        Some(n) => {
            let meta = crate::naming::NameMeta { format: format.clone(), bitrate };
            crate::naming::disambiguate(&n, &meta, &crate::naming::taken_keys(streams, None))
        }
        None => resolved_url.clone(),
    };

    StreamInfo {
        id: nanoid::nanoid!(),
        url: resolved_url,
        name: stream_name,
        format,
        bitrate,
        icy_name: None,
        icy_genre: None,
        icy_url: None,
        ignorelist: Vec::new(),
        username: None,
        password: None,
        added_at: now,
    }
}

#[tauri::command]
pub async fn add_stream(
    url: String,
    name: Option<String>,
    bitrate: Option<u32>,
    format: Option<AudioFormat>,
    state: tauri::State<'_, AppState>,
) -> Result<StreamInfo, String> {
    let resolved_url = playlist::resolve_playlist_url(&url)
        .await
        .map_err(|e| e.to_string())?;

    let (new_stream, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let new_stream = build_added_stream(
            &profile.streams,
            resolved_url,
            name,
            bitrate,
            format,
            chrono::Local::now().to_rfc3339(),
        );
        profile.streams.push(new_stream.clone());
        (new_stream, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    Ok(new_stream)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: PASS, including the 5 new `added_stream_*` tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/stream_commands.rs src-tauri/src/commands/stream_io_commands.rs
git commit -m "feat(streams): auto-suffix colliding names on manual add"
```

---

### Task 3: Conflict pre-flight command

**Files:**
- Modify: `src-tauri/src/commands/stream_commands.rs` (add `StreamConflicts`, `find_conflicts`, `check_stream_conflicts`)
- Modify: `src-tauri/src/lib.rs` (register the command in `invoke_handler`)
- Test: inline `#[cfg(test)] mod tests` in `src-tauri/src/commands/stream_commands.rs`

**Interfaces:**
- Consumes: `naming::collision_key` from Task 1.
- Produces:
  - `pub struct StreamConflicts { pub duplicate_url_of: Option<String>, pub name_collides_with: Option<String> }` (serialized camelCase)
  - `pub fn find_conflicts(streams: &[StreamInfo], url: Option<&str>, name: Option<&str>, exclude_id: Option<&str>) -> StreamConflicts`
  - `check_stream_conflicts(url: Option<String>, name: Option<String>, exclude_id: Option<String>) -> Result<StreamConflicts, String>`

- [ ] **Step 1: Write the failing test**

Append to the `tests` module of `src-tauri/src/commands/stream_commands.rs`:

```rust
    #[test]
    fn find_conflicts_reports_the_stream_already_holding_the_url() {
        let streams = vec![StreamInfo { id: "a".into(), url: "http://dup".into(), name: "Radio X".into(), ..sample() }];
        let got = find_conflicts(&streams, Some("http://dup"), None, None);
        assert_eq!(got.duplicate_url_of.as_deref(), Some("Radio X"));
        assert_eq!(got.name_collides_with, None);
    }

    #[test]
    fn find_conflicts_is_silent_for_a_new_url() {
        let streams = vec![StreamInfo { id: "a".into(), url: "http://a".into(), ..sample() }];
        assert_eq!(find_conflicts(&streams, Some("http://new"), None, None).duplicate_url_of, None);
    }

    #[test]
    fn find_conflicts_reports_a_folder_level_name_clash() {
        let streams = vec![named("a", "Radio X")];
        // Different case, and a slash that sanitizes away — still one folder.
        let got = find_conflicts(&streams, None, Some("radio x"), None);
        assert_eq!(got.name_collides_with.as_deref(), Some("Radio X"));
    }

    #[test]
    fn find_conflicts_excludes_the_stream_being_edited() {
        let streams = vec![named("a", "Radio X"), named("b", "Radio Y")];
        // Renaming "a" to its own name is not a conflict...
        assert_eq!(find_conflicts(&streams, None, Some("Radio X"), Some("a")).name_collides_with, None);
        // ...but renaming it onto "b" is.
        assert_eq!(
            find_conflicts(&streams, None, Some("Radio Y"), Some("a")).name_collides_with.as_deref(),
            Some("Radio Y")
        );
    }

    #[test]
    fn find_conflicts_ignores_a_blank_name() {
        let streams = vec![named("a", "Radio X")];
        assert_eq!(find_conflicts(&streams, None, Some("   "), None).name_collides_with, None);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test find_conflicts`
Expected: FAIL — `cannot find function find_conflicts in this scope`.

- [ ] **Step 3: Write the implementation**

Add to `src-tauri/src/commands/stream_commands.rs`, next to `build_added_stream`:

```rust
/// What the Add/Edit-stream dialog warns about before saving. Both are
/// warnings, never bans: the URL is the stream's identity, but a user may
/// legitimately want the same URL twice (different credentials, different
/// ignorelist), and an explicit rename onto an existing name is the user's
/// call — we only say the recordings will share a folder.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamConflicts {
    /// Name of the stream already holding this URL.
    pub duplicate_url_of: Option<String>,
    /// Name of the stream whose `%s` recording folder this name would share.
    pub name_collides_with: Option<String>,
}

/// Pure core of `check_stream_conflicts`. `exclude_id` is the stream being
/// edited, so it never conflicts with itself.
pub fn find_conflicts(
    streams: &[StreamInfo],
    url: Option<&str>,
    name: Option<&str>,
    exclude_id: Option<&str>,
) -> StreamConflicts {
    let others = || streams.iter().filter(|s| Some(s.id.as_str()) != exclude_id);

    let duplicate_url_of = url.and_then(|u| others().find(|s| s.url == u).map(|s| s.name.clone()));

    let name_collides_with = name
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .and_then(|n| {
            let key = crate::naming::collision_key(n);
            others()
                .find(|s| crate::naming::collision_key(&s.name) == key)
                .map(|s| s.name.clone())
        });

    StreamConflicts { duplicate_url_of, name_collides_with }
}

/// Pre-flight for the Add/Edit-stream dialog. `url` is checked in add mode
/// (resolved first, so a `.pls` that points at an already-known stream is
/// caught); `name` + `exclude_id` in edit mode. A URL that fails to resolve is
/// compared as typed — the add itself will surface the real error.
#[tauri::command]
pub async fn check_stream_conflicts(
    url: Option<String>,
    name: Option<String>,
    exclude_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<StreamConflicts, String> {
    let resolved = match url {
        Some(u) => Some(playlist::resolve_playlist_url(&u).await.unwrap_or(u)),
        None => None,
    };
    let profile = state.active_profile.read().await;
    Ok(find_conflicts(
        &profile.streams,
        resolved.as_deref(),
        name.as_deref(),
        exclude_id.as_deref(),
    ))
}
```

Register it in `src-tauri/src/lib.rs` in the `invoke_handler` list, immediately after `commands::stream_commands::add_stream,`:

```rust
            commands::stream_commands::check_stream_conflicts,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/stream_commands.rs src-tauri/src/lib.rs
git commit -m "feat(streams): check_stream_conflicts pre-flight for the add/edit dialog"
```

---

### Task 4: Browser adds suffix against profile and batch

**Files:**
- Modify: `src-tauri/src/commands/browser_commands.rs:174-197` (`append_streams_to_active_profile`)
- Test: inline `#[cfg(test)] mod tests` in `src-tauri/src/commands/browser_commands.rs`

**Interfaces:**
- Consumes: `naming::{disambiguate_batch, taken_keys}` from Task 1; `dedup_new_streams` (already in the file).
- Produces: `fn plan_appended(existing: &[StreamInfo], incoming: Vec<StreamInfo>) -> Vec<StreamInfo>` — the whole decision the command makes inside the profile lock, extracted so it is testable without Tauri state. `append_streams_to_active_profile` keeps its signature and now returns streams whose `name` is already disambiguated.

- [ ] **Step 1: Write the failing test**

Append to the `tests` module of `src-tauri/src/commands/browser_commands.rs`. The tests target `plan_appended` — the real function the command calls — so they cannot pass until Step 3 introduces it:

```rust
    fn named_stream(url: &str, name: &str, codec: &str, bitrate: u32) -> StreamInfo {
        StreamInfo {
            name: name.into(),
            format: codec_to_format(codec),
            bitrate: if bitrate > 0 { Some(bitrate) } else { None },
            ..stream(url)
        }
    }

    #[test]
    fn browser_add_suffixes_against_the_profile() {
        let existing = vec![named_stream("https://old", "BBC 6", "MP3", 128)];
        let added = plan_appended(&existing, vec![named_stream("https://new", "BBC 6", "AAC", 48)]);
        assert_eq!(added[0].name, "BBC 6 (AAC 48k)");
    }

    #[test]
    fn browser_bulk_add_distinguishes_mountpoints_within_one_batch() {
        // The Radio Browser case: six identically named variants of one station.
        let incoming = vec![
            named_stream("https://a", "BBC 6", "AAC", 48),
            named_stream("https://b", "BBC 6", "MP3", 128),
            named_stream("https://c", "BBC 6", "AAC", 48), // identical metadata
        ];
        let added = plan_appended(&[], incoming);
        assert_eq!(added[0].name, "BBC 6");
        assert_eq!(added[1].name, "BBC 6 (MP3 128k)");
        assert_eq!(added[2].name, "BBC 6 (AAC 48k)");
    }

    #[test]
    fn browser_add_leaves_a_distinct_name_alone() {
        let existing = vec![named_stream("https://old", "Groove Salad", "MP3", 128)];
        let added = plan_appended(&existing, vec![named_stream("https://new", "FIP", "AAC", 192)]);
        assert_eq!(added[0].name, "FIP");
    }

    #[test]
    fn browser_add_does_not_burn_a_name_on_a_url_that_is_dropped() {
        // https://old is already in the profile, so it never reaches the naming
        // step and must not push the fresh entry to a suffix.
        let existing = vec![named_stream("https://old", "Other", "MP3", 128)];
        let added = plan_appended(
            &existing,
            vec![named_stream("https://old", "Dropped", "MP3", 128), named_stream("https://new", "FIP", "AAC", 192)],
        );
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].name, "FIP");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test browser_add`
Expected: FAIL — `cannot find function plan_appended in this scope`.

- [ ] **Step 3: Write the implementation**

In `src-tauri/src/commands/browser_commands.rs`, add `plan_appended` next to `dedup_new_streams` and have the command call it:

```rust
/// Everything `append_streams_to_active_profile` decides while holding the
/// profile lock: drop urls already present (and duplicates inside the batch),
/// then name the survivors apart from the profile AND from each other. Radio
/// Browser lists every mountpoint of a station under one identical name, so a
/// bulk add is the likeliest source of same-name pairs. Pure over the profile —
/// unit-testable without Tauri state.
fn plan_appended(existing: &[StreamInfo], incoming: Vec<StreamInfo>) -> Vec<StreamInfo> {
    let mut added = dedup_new_streams(existing, incoming);
    let mut taken = crate::naming::taken_keys(existing.iter(), None);
    crate::naming::disambiguate_batch(&mut added, &mut taken);
    added
}
```

```rust
/// Append new streams to the active profile in one atomic save+emit.
/// `plan_appended` does the url-dedup and the naming. Returns only the streams
/// actually added, with their final names. If nothing is added, skips the
/// save/emit and returns empty.
async fn append_streams_to_active_profile(
    state: &AppState,
    app: &tauri::AppHandle,
    streams: Vec<StreamInfo>,
) -> Result<Vec<StreamInfo>, String> {
    let mut profile = state.active_profile.write().await;
    let added = plan_appended(&profile.streams, streams);
    if added.is_empty() {
        return Ok(added);
    }
    for s in &added {
        profile.streams.push(s.clone());
    }
    let profile_clone = profile.clone();
    drop(profile);

    tokio::task::spawn_blocking(move || profile_clone.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    app.emit("streams-changed", ()).ok();
    Ok(added)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/browser_commands.rs
git commit -m "feat(browser): disambiguate station names against profile and batch"
```

---

### Task 5: Import commit suffixes from the batch probe

**Files:**
- Modify: `src-tauri/src/commands/stream_io_commands.rs` (`SelectedStream`, `commit_stream_import`)
- Test: inline `#[cfg(test)] mod tests` in `src-tauri/src/commands/stream_io_commands.rs`

**Interfaces:**
- Consumes: `naming::{disambiguate, taken_keys, collision_key, NameMeta}` from Task 1.
- Produces:
  - `SelectedStream { url: String, name: String, bitrate: Option<u32>, format: Option<AudioFormat> }` (deserialized camelCase, both metadata fields `#[serde(default)]`)
  - `pub fn plan_import(streams: &[StreamInfo], selected: Vec<SelectedStream>, now: &str) -> Vec<StreamInfo>`

- [ ] **Step 1: Write the failing test**

Append to the `tests` module of `src-tauri/src/commands/stream_io_commands.rs`:

```rust
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
        let planned = plan_import(&profile, vec![sel("https://new", "Radio X", Some(64), Some(AudioFormat::Aac))], "NOW");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test import_`
Expected: FAIL — `cannot find function plan_import`, and `SelectedStream` has no fields `bitrate`/`format`.

- [ ] **Step 3: Write the implementation**

In `src-tauri/src/commands/stream_io_commands.rs`, replace `SelectedStream` and `commit_stream_import`:

```rust
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
```

```rust
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
    let (added, skipped, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let planned = plan_import(&profile.streams, selected, &chrono::Local::now().to_rfc3339());
        let mut added = 0usize;
        for stream in planned {
            if profile.add_stream_checked(stream).is_ok() {
                added += 1;
            }
        }
        (added, requested - added, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(ImportResult { added, skipped })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/stream_io_commands.rs
git commit -m "feat(import): disambiguate imported names using the batch probe"
```

---

### Task 6: ICY auto-rename and `%s` take the profile name

**Files:**
- Modify: `src-tauri/src/stream/manager.rs:651-685`

**Interfaces:**
- Consumes: `naming::{icy_rename, collision_key, NameMeta}` from Task 1.
- Produces: no new public surface. After this task `station_name` (the value handed to `recorder::Recorder::new` and `open_stream_file`) is the profile's `StreamInfo.name`, never the raw ICY name.

There is no unit test here — `recording_task` needs a live `AppHandle`, a socket and a profile on disk. The decision logic it now calls is fully covered by Task 1's `icy_rename` tests; this task is verified by `cargo test` still passing, `pnpm vite:build`, and the manual NVDA/recording run in Task 10.

- [ ] **Step 1: Replace the profile-update block**

In `src-tauri/src/stream/manager.rs`, replace the whole block that currently starts with `{` on the line after `.unwrap_or(AudioFormat::Mp3);` and ends with the two lines

```rust
        // Use ICY name for recording paths if discovered
        let station_name = icy_name_val.unwrap_or_else(|| station_name.clone());
```

with:

```rust
        // --- Update profile with ICY headers, and settle the recording name ---
        // `%s` is ALWAYS the profile's name. Two mountpoints of one station send
        // the SAME icy-name, so using it here would merge their folders and undo
        // the suffix their profile entries carry.
        let station_name = {
            let state = app_handle.state::<crate::app_state::AppState>();
            let (updated_stream, snapshot) = {
                let mut profile = state.active_profile.write().await;
                match profile.streams.iter().position(|s| s.id == stream_id) {
                    Some(i) => {
                        // Naming an unnamed stream picks its recording folder, so
                        // it has to dodge the folders the other streams own.
                        let taken: std::collections::HashSet<String> = profile
                            .streams
                            .iter()
                            .enumerate()
                            .filter(|(j, _)| *j != i)
                            .map(|(_, s)| crate::naming::collision_key(&s.name))
                            .collect();
                        let s = &mut profile.streams[i];
                        if let Some(br) = icy_bitrate {
                            s.bitrate = Some(br as u32);
                        }
                        if let Some(icy) = icy_name_val.as_ref() {
                            let meta = crate::naming::NameMeta {
                                format: Some(detected_format.clone()),
                                bitrate: icy_bitrate.map(|b| b as u32),
                            };
                            if let Some(renamed) =
                                crate::naming::icy_rename(&s.name, &s.url, icy, &meta, &taken)
                            {
                                s.name = renamed;
                            }
                            s.icy_name = Some(icy.clone());
                        }
                        if icy_genre_val.is_some() {
                            s.icy_genre = icy_genre_val.clone();
                        }
                        if icy_url_val.is_some() {
                            s.icy_url = icy_url_val.clone();
                        }
                        s.format = Some(detected_format.clone());
                        (Some(s.clone()), Some(profile.clone()))
                    }
                    None => (None, None),
                }
            };
            match (updated_stream, snapshot) {
                (Some(updated), Some(snap)) => {
                    let _ = tokio::task::spawn_blocking(
                        move || -> Result<(), crate::errors::RadioError> { snap.save() },
                    )
                    .await;
                    let name = updated.name.clone();
                    app_handle.emit("stream-info-updated", updated).ok();
                    name
                }
                // Stream was removed from the profile mid-recording — keep the
                // name the task started with.
                _ => station_name.clone(),
            }
        };
```

- [ ] **Step 2: Verify it compiles and nothing regressed**

Run: `cd src-tauri && cargo test`
Expected: PASS with no warnings about unused `icy_name_val`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/stream/manager.rs
git commit -m "fix(recorder): %s uses the profile name; ICY rename dodges collisions"
```

---

### Task 7: Typed IPC wrappers

**Files:**
- Modify: `src/lib/tauri.ts` (`ProbeVerdict`, `addStream`, `checkStreamConflicts`, `commitStreamImport`)

**Interfaces:**
- Consumes: the Rust commands from Tasks 2, 3, 5.
- Produces:
  - `interface ProbeVerdict { ok: boolean; error: string | null; bitrate: number | null; format: "mp3" | "aac" | null }`
  - `interface StreamConflicts { duplicateUrlOf: string | null; nameCollidesWith: string | null }`
  - `type StreamMeta = { bitrate: number | null; format: "mp3" | "aac" | null }`
  - `addStream(url: string, name?: string, meta?: StreamMeta): Promise<StreamInfo>`
  - `checkStreamConflicts(args: { url?: string; name?: string; excludeId?: string }): Promise<StreamConflicts>`
  - `commitStreamImport(selected: ({ url: string; name: string } & Partial<StreamMeta>)[]): Promise<StreamImportResult>`

- [ ] **Step 1: Update the type and wrappers**

In `src/lib/tauri.ts`, replace the `ProbeVerdict` interface:

```ts
/** Verdict of a single interactive probe (`probe_stream`). `bitrate`/`format`
 *  are fed back into `addStream` so a colliding name gets an informative
 *  suffix (`Radio X (AAC 64k)`) instead of a bare ordinal. */
export interface ProbeVerdict {
  ok: boolean;
  error: string | null;
  bitrate: number | null;
  format: "mp3" | "aac" | null;
}

/** What the stream is known to be at add time — drives the name suffix. */
export type StreamMeta = { bitrate: number | null; format: "mp3" | "aac" | null };

/** Warnings (never bans) the add/edit dialog raises before saving. */
export interface StreamConflicts {
  /** Name of the stream already holding this URL. */
  duplicateUrlOf: string | null;
  /** Name of the stream whose recording folder this name would share. */
  nameCollidesWith: string | null;
}
```

Replace `addStream` and add `checkStreamConflicts` next to it:

```ts
export async function addStream(url: string, name?: string, meta?: StreamMeta): Promise<StreamInfo> {
  return invoke("add_stream", {
    url,
    name,
    bitrate: meta?.bitrate ?? null,
    format: meta?.format ?? null,
  });
}
/** Pre-flight for the add/edit dialog: pass `url` when adding, `name` +
 *  `excludeId` when renaming. Both results are warnings, not refusals. */
export async function checkStreamConflicts(args: {
  url?: string;
  name?: string;
  excludeId?: string;
}): Promise<StreamConflicts> {
  return invoke("check_stream_conflicts", {
    url: args.url ?? null,
    name: args.name ?? null,
    excludeId: args.excludeId ?? null,
  });
}
```

Replace the `commitStreamImport` signature:

```ts
export async function commitStreamImport(
  selected: ({ url: string; name: string } & Partial<StreamMeta>)[],
): Promise<StreamImportResult> {
  return invoke("commit_stream_import", { selected });
}
```

- [ ] **Step 2: Verify the bundle still builds**

Run: `pnpm vite:build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat(ipc): typed wrappers for conflict pre-flight and probe metadata"
```

---

### Task 8: Add/Edit dialog — warnings and "use official name"

**Files:**
- Modify: `src/components/streams/AddStreamDialog.tsx`
- Modify: `src/components/streams/AddStreamDialog.test.tsx`
- Modify: `src/i18n/messages/uk.json`, `src/i18n/messages/en.json`

**Interfaces:**
- Consumes: `tauri.checkStreamConflicts`, `tauri.addStream(url, name, meta)`, `ProbeVerdict.bitrate/format` from Task 7.
- Produces: no new module surface. New message keys `stream_duplicate_url_warning`, `stream_name_collision_warning`, `stream_save_anyway`, `stream_official_name`, `stream_use_official_name`.

- [ ] **Step 1: Add the message keys**

In `src/i18n/messages/uk.json`, immediately after `"stream_probe_add_anyway": "Все одно додати",`:

```json
  "stream_save_anyway": "Все одно зберегти",
  "stream_duplicate_url_warning": "Цей URL уже є в профілі — потік «{name}». Ви все одно можете додати його.",
  "stream_name_collision_warning": "Це ім'я вже використовує потік «{name}» — записи підуть в одну теку.",
  "stream_official_name": "Отримана від станції назва: {name}",
  "stream_use_official_name": "Використати офіційну назву",
```

In `src/i18n/messages/en.json`, at the same position (after `"stream_probe_add_anyway": "Add anyway",`):

```json
  "stream_save_anyway": "Save anyway",
  "stream_duplicate_url_warning": "This URL is already in the profile as \"{name}\". You can add it anyway.",
  "stream_name_collision_warning": "The stream \"{name}\" already uses this name — both will record into one folder.",
  "stream_official_name": "Name reported by the station: {name}",
  "stream_use_official_name": "Use the official name",
```

- [ ] **Step 2: Write the failing tests**

Replace the mock factories at the top of `src/components/streams/AddStreamDialog.test.tsx`:

```tsx
vi.mock("../../lib/tauri", () => ({
  probeStream: vi.fn(),
  addStream: vi.fn(),
  updateStream: vi.fn(),
  checkStreamConflicts: vi.fn(),
}));

vi.mock("../../i18n/paraglide/messages", () => ({
  add_stream: () => "Add stream",
  edit_stream: () => "Edit stream",
  stream_url: () => "URL",
  stream_name: () => "Name",
  cancel: () => "Cancel",
  save: () => "Save",
  saving: () => "Saving…",
  stream_probe_checking: () => "Checking stream…",
  stream_probe_failed: () => "The stream did not respond",
  stream_probe_add_anyway: () => "Add anyway",
  stream_save_anyway: () => "Save anyway",
  stream_duplicate_url_warning: ({ name }: { name: string }) => `URL already in profile as ${name}`,
  stream_name_collision_warning: ({ name }: { name: string }) => `Name already used by ${name}`,
  stream_official_name: ({ name }: { name: string }) => `Station name: ${name}`,
  stream_use_official_name: () => "Use the official name",
  stream_added: ({ name }: { name: string }) => `Stream added: ${name}`,
  stream_updated: ({ name }: { name: string }) => `Stream updated: ${name}`,
}));
```

Update the destructured mocks and the `beforeEach`, and fix the existing expectations for the new `addStream` signature:

```tsx
const probeStream = vi.mocked(tauri.probeStream);
const addStream = vi.mocked(tauri.addStream);
const checkStreamConflicts = vi.mocked(tauri.checkStreamConflicts);

const NO_CONFLICTS = { duplicateUrlOf: null, nameCollidesWith: null };
const NO_META = { bitrate: null, format: null };
```

In `beforeEach`, after `addStream.mockResolvedValue(newStream);` add:

```tsx
    checkStreamConflicts.mockResolvedValue(NO_CONFLICTS);
```

Every existing `expect(addStream).toHaveBeenCalledWith("http://a", undefined)` becomes:

```tsx
expect(addStream).toHaveBeenCalledWith("http://a", undefined, NO_META);
```

Every `probeStream.mockResolvedValue({ ok: true, error: null })` becomes `probeStream.mockResolvedValue({ ok: true, error: null, ...NO_META })`, and likewise for the `{ ok: false, error: "…" }` cases. In the "marks the form busy" test, the `release` type becomes `(v: tauri.ProbeVerdict) => void` and the call `release({ ok: true, error: null, ...NO_META })`.

Then append the new tests:

```tsx
describe("AddStreamDialog conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    $streams.set([]);
    $editStream.set(null);
    $showAddStreamDialog.set(true);
    addStream.mockResolvedValue(newStream);
    probeStream.mockResolvedValue({ ok: true, error: null, bitrate: null, format: null });
    checkStreamConflicts.mockResolvedValue(NO_CONFLICTS);
  });

  it("passes the probed bitrate and codec to addStream so the name can be suffixed", async () => {
    probeStream.mockResolvedValue({ ok: true, error: null, bitrate: 64, format: "aac" });
    render(<AddStreamDialog />);

    await userEvent.type(screen.getByLabelText("URL"), "http://a");
    await userEvent.type(screen.getByLabelText("Name"), "Radio X");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(addStream).toHaveBeenCalledWith("http://a", "Radio X", { bitrate: 64, format: "aac" }),
    );
  });

  it("warns about a duplicate URL, then adds anyway on the second submit", async () => {
    checkStreamConflicts.mockResolvedValue({ duplicateUrlOf: "Radio X", nameCollidesWith: null });
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();

    expect(await screen.findByText("URL already in profile as Radio X")).toBeInTheDocument();
    expect(addStream).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Add anyway" }));
    await waitFor(() => expect(addStream).toHaveBeenCalled());
    expect(probeStream).toHaveBeenCalledTimes(1); // neither check re-runs
    expect(checkStreamConflicts).toHaveBeenCalledTimes(1);
  });

  it("warns about a name that would share a recording folder, then saves anyway", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "A", icyName: null } as never);
    checkStreamConflicts.mockResolvedValue({ duplicateUrlOf: null, nameCollidesWith: "Radio X" });
    vi.mocked(tauri.updateStream).mockResolvedValue({ id: "s1", url: "http://a", name: "Radio X" } as never);
    render(<AddStreamDialog />);

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Radio X");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Name already used by Radio X")).toBeInTheDocument();
    expect(tauri.updateStream).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(tauri.updateStream).toHaveBeenCalledWith("s1", "Radio X"));
    expect(checkStreamConflicts).toHaveBeenCalledWith({ name: "Radio X", excludeId: "s1" });
    expect(probeStream).not.toHaveBeenCalled(); // editing never probes
  });

  it("offers the station-reported name in edit mode and copies it into the field", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "My Name", icyName: "Radio X" } as never);
    render(<AddStreamDialog />);

    expect(screen.getByText("Station name: Radio X")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use the official name" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Radio X");
    // Copying the name makes the block redundant — it must disappear.
    expect(screen.queryByRole("button", { name: "Use the official name" })).not.toBeInTheDocument();
  });

  it("hides the official-name block when the stream has never connected", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "My Name", icyName: null } as never);
    render(<AddStreamDialog />);

    expect(screen.queryByRole("button", { name: "Use the official name" })).not.toBeInTheDocument();
  });

  it("re-checks the name after the official name is applied", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "My Name", icyName: "Radio X" } as never);
    checkStreamConflicts.mockResolvedValue({ duplicateUrlOf: null, nameCollidesWith: "Radio X" });
    render(<AddStreamDialog />);

    await userEvent.click(screen.getByRole("button", { name: "Use the official name" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Name already used by Radio X")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test AddStreamDialog`
Expected: FAIL — `tauri.checkStreamConflicts is not a function` / the new texts are not in the document.

- [ ] **Step 4: Write the implementation**

Replace `src/components/streams/AddStreamDialog.tsx` with:

```tsx
import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import * as tauri from "../../lib/tauri";
import type { StreamMeta } from "../../lib/tauri";
import { $streams, $showAddStreamDialog, $editStream } from "../../stores/streams";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

const NO_META: StreamMeta = { bitrate: null, format: null };

export function AddStreamDialog() {
  const showAddDialog = useStore($showAddStreamDialog);
  const editStream = useStore($editStream);

  const isOpen = showAddDialog || editStream !== null;
  const isEdit = editStream !== null;

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  // The pre-flight checks each run once per URL/name and then stand down, so a
  // second submit ("…anyway") goes straight through. `warning` holds whichever
  // of them spoke — one message at a time, one live region.
  const [probed, setProbed] = useState(false);
  const [probeMeta, setProbeMeta] = useState<StreamMeta>(NO_META);
  const [conflictsChecked, setConflictsChecked] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  // Sync form fields when dialog opens
  useEffect(() => {
    if (isOpen) {
      setUrl(editStream?.url ?? "");
      setName(editStream?.name ?? "");
      setError(null);
      setWarning(null);
      setProbed(false);
      setProbeMeta(NO_META);
      setConflictsChecked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Probing and saving both lock the form; only the label distinguishes them.
  const busy = loading || probing;

  // A new URL invalidates the reachability verdict AND the duplicate check.
  const changeUrl = (next: string) => {
    setUrl(next);
    setProbed(false);
    setProbeMeta(NO_META);
    setConflictsChecked(false);
    setWarning(null);
  };

  // A new name invalidates only the collision check (edit mode).
  const changeName = (next: string) => {
    setName(next);
    setConflictsChecked(false);
    setWarning(null);
  };

  const handleClose = () => {
    $showAddStreamDialog.set(false);
    $editStream.set(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Adding: check reachability first, once per URL. A failed probe is only a
    // warning — the second submit goes through so a temporarily-down stream can
    // still be added. Edit never probes (the URL is not editable there).
    if (!isEdit && !probed) {
      setProbing(true);
      let verdict: tauri.ProbeVerdict = { ok: false, error: null, ...NO_META };
      try {
        verdict = await tauri.probeStream(url);
      } catch {
        // treat an IPC failure like an unreachable stream
      } finally {
        setProbing(false);
        setProbed(true);
      }
      if (!verdict.ok) {
        setWarning(m.stream_probe_failed());
        return;
      }
      setProbeMeta({ bitrate: verdict.bitrate, format: verdict.format });
    }

    // Then the profile-level conflicts, also once. Adding warns about a URL the
    // profile already holds; renaming warns about a name that would send two
    // streams into one recording folder. Neither refuses — an explicit second
    // submit is respected.
    if (!conflictsChecked) {
      let conflicts: tauri.StreamConflicts = { duplicateUrlOf: null, nameCollidesWith: null };
      try {
        conflicts = isEdit
          ? await tauri.checkStreamConflicts({ name, excludeId: editStream.id })
          : await tauri.checkStreamConflicts({ url });
      } catch {
        // A pre-flight that cannot run must not block the save.
      }
      setConflictsChecked(true);
      const clash = isEdit
        ? conflicts.nameCollidesWith && m.stream_name_collision_warning({ name: conflicts.nameCollidesWith })
        : conflicts.duplicateUrlOf && m.stream_duplicate_url_warning({ name: conflicts.duplicateUrlOf });
      if (clash) {
        setWarning(clash);
        return;
      }
    }

    setLoading(true);
    try {
      if (isEdit && editStream) {
        const updated = await tauri.updateStream(editStream.id, name);
        $streams.set($streams.get().map((s) => s.id === updated.id ? updated : s));
        addToast(m.stream_updated({ name: updated.name }), "success");
      } else {
        const newStream = await tauri.addStream(url, name || undefined, probeMeta);
        $streams.set([...$streams.get(), newStream]);
        addToast(m.stream_added({ name: newStream.name }), "success");
      }
      handleClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // The station's own name, offered only while it differs from what the field
  // holds. Copying it is an explicit act: the stored name is a folder on disk,
  // so nothing rewrites it behind the user's back.
  const officialName = isEdit && editStream.icyName && editStream.icyName !== name.trim()
    ? editStream.icyName
    : null;

  const submitLabel = probing
    ? m.stream_probe_checking()
    : loading
      ? m.saving()
      : warning
        ? (isEdit ? m.stream_save_anyway() : m.stream_probe_add_anyway())
        : m.save();

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) handleClose(); }}
    >
      <Modal className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {isEdit ? m.edit_stream() : m.add_stream()}
          </Heading>
          <form onSubmit={handleSubmit} aria-busy={busy || undefined} className="flex flex-col gap-3">
            {!isEdit && (
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                {m.stream_url()}
                <input
                  type="url"
                  value={url}
                  onChange={(e) => changeUrl(e.target.value)}
                  required
                  autoFocus
                  disabled={busy}
                  className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
                  placeholder="https://..."
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.stream_name()}
              <input
                type="text"
                value={name}
                onChange={(e) => changeName(e.target.value)}
                autoFocus={isEdit}
                disabled={busy}
                className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
              />
            </label>
            {officialName && (
              <div className="flex flex-col items-start gap-1 rounded border border-slate-700 p-2 forced-colors:border-[ButtonText]">
                <p className="text-xs text-slate-400 forced-colors:text-[CanvasText]">
                  {m.stream_official_name({ name: officialName })}
                </p>
                <button
                  type="button"
                  onClick={() => changeName(officialName)}
                  disabled={busy}
                  className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
                >
                  {m.stream_use_official_name()}
                </button>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-red-400 forced-colors:text-[CanvasText]">{error}</p>}
            {/* Probe / conflict warnings: polite so they do not cut off the field
                the user is in; one region for every state so NVDA sees a text change. */}
            <p aria-live="polite" className="text-sm text-amber-300 empty:hidden forced-colors:text-[CanvasText]">
              {probing ? m.stream_probe_checking() : warning ?? ""}
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {m.cancel()}
              </button>
              <button
                type="submit"
                disabled={busy}
                aria-busy={busy || undefined}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {submitLabel}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test AddStreamDialog`
Expected: PASS — the 6 original tests plus the 6 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/components/streams/AddStreamDialog.tsx src/components/streams/AddStreamDialog.test.tsx src/i18n/messages/uk.json src/i18n/messages/en.json
git commit -m "feat(streams): warn on duplicate URL and name clash; offer the station name"
```

---

### Task 9: Import dialog sends probe metadata; browser row a11y

**Files:**
- Modify: `src/components/streams/ImportStreamsDialog.tsx:131-133` (`handleImport`)
- Modify: `src/components/streams/ImportStreamsDialog.test.tsx`
- Modify: `src/components/browser/StationItem.tsx:88-96` (summary label)
- Modify: `src/components/browser/StationItem.test.tsx`
- Modify: `src/components/browser/StationList.tsx:59-70` (`handleAdd`)

**Interfaces:**
- Consumes: `commitStreamImport` accepting `bitrate`/`format` (Task 7); the existing `browser_station_already_added` message key (present in both locales, currently unused).
- Produces: no new module surface.

- [ ] **Step 1: Write the failing tests**

In `src/components/streams/ImportStreamsDialog.test.tsx`, add a test that the probed metadata reaches the commit (place it inside the existing `describe`, matching how that file already drives progress events):

```tsx
  it("sends the probed bitrate and codec so the backend can suffix a duplicate name", async () => {
    $importCandidates.set([{ url: "https://a/1", name: "Radio X", alreadyInProfile: false }]);
    render(<ImportStreamsDialog />);

    emitProgress({ url: "https://a/1", status: "ok", icyName: null, bitrate: 64, format: "aac", error: null });

    await userEvent.click(screen.getByRole("button", { name: /Import/ }));

    await waitFor(() =>
      expect(commitStreamImport).toHaveBeenCalledWith([
        { url: "https://a/1", name: "Radio X", bitrate: 64, format: "aac" },
      ]),
    );
  });
```

If that file has no `emitProgress` helper yet, use whatever mechanism its existing tests use to deliver a `stream-import-progress` payload, and mirror it.

In `src/components/browser/StationItem.test.tsx`, add:

```tsx
  it("puts codec and bitrate in the row's accessible name", () => {
    // Six identically named BBC 6 Music variants must be told apart by ear
    // BEFORE they are added, so the codec/bitrate belong in the row name itself.
    renderItem({ name: "BBC 6", country: "United Kingdom", codec: "AAC", bitrate: 48, tags: "pop" });
    const row = screen.getByRole("option", { name: /BBC 6/ });
    expect(row).toHaveAccessibleName("BBC 6, United Kingdom, AAC, 48 kbps, pop");
  });

  it("omits metadata the directory does not report", () => {
    renderItem({ name: "BBC 6", country: "", codec: "MP3", bitrate: 0, tags: "" });
    expect(screen.getByRole("option", { name: /BBC 6/ })).toHaveAccessibleName("BBC 6, MP3");
  });
```

Match the existing file's render helper and row role — read the file first and reuse its `renderItem`/role conventions rather than introducing new ones.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test ImportStreamsDialog StationItem`
Expected: FAIL — the commit payload lacks `bitrate`/`format`; the accessible name is `BBC 6, United Kingdom, pop`.

- [ ] **Step 3: Write the implementation**

In `src/components/streams/ImportStreamsDialog.tsx`, replace the first line of `handleImport`:

```tsx
    // bitrate/format come from this dialog's own batch probe — the backend uses
    // them to suffix a name that collides (one playlist often lists several
    // mountpoints of one station) and persists them on the stream.
    const selected = selectable
      .filter((r) => r.checked)
      .map((r) => ({
        url: r.url,
        name: r.name,
        bitrate: r.bitrate,
        format: r.format as "mp3" | "aac" | null,
      }));
```

In `src/components/browser/StationItem.tsx`, replace the summary lines:

```tsx
  // Down-scan summary: name + the metadata that tells same-named variants apart
  // (one station commonly appears once per mountpoint), with a state prefix when
  // relevant. Codec and bitrate are here on purpose — read aloud, the name alone
  // is identical across all six BBC 6 Music entries.
  const summaryMeta = [
    station.country,
    station.codec,
    station.bitrate ? `${station.bitrate} kbps` : "",
    station.tags,
  ]
    .filter(Boolean)
    .join(", ");
```

In `src/components/browser/StationList.tsx`, replace the early return in `handleAdd`:

```tsx
    async (station: StationResult) => {
      if (isAlreadyAdded(station)) {
        // Say so rather than no-op: the row already reads "Added" visually, but
        // a keyboard user activating it heard nothing at all.
        announce(m.browser_station_already_added({ name: station.name }), "polite");
        return;
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/ImportStreamsDialog.tsx src/components/streams/ImportStreamsDialog.test.tsx src/components/browser/StationItem.tsx src/components/browser/StationItem.test.tsx src/components/browser/StationList.tsx
git commit -m "feat(a11y): codec/bitrate in station row names; import sends probe metadata"
```

---

### Task 10: Gates, documentation, and backlog closure

**Files:**
- Modify: `docs/data-models.md` (§3.1 StreamInfo)
- Modify: `docs/backlog/p0-stream-name-disambiguation.md` → `git mv` to `docs/backlog/done/`
- Modify: `docs/backlog/ROADMAP.md`

- [ ] **Step 1: Run every gate**

```bash
pnpm test
pnpm vite:build
cd src-tauri && cargo test && cd ..
```

Expected: all green. A first `vitest` run after an idle period can fail spuriously (cold transform cache) — re-run once before investigating.

- [ ] **Step 2: Document the rule in `docs/data-models.md`**

Under §3.1 StreamInfo, add a subsection covering: `name` is not unique and is the `%s` recording folder; a colliding name gets a one-time ASCII suffix at add time (`(AAC 64k)` → `(AAC)`/`(128k)` → `(2)`, stacking as `(AAC 64k) (2)`); collisions are compared on the sanitized name, case-insensitively; the suffix is never revised afterwards; `icy_name` keeps the station's own name and is copied into `name` only by the explicit "use official name" button; ICY auto-naming applies only while `name == url`; existing profiles are not migrated.

- [ ] **Step 3: Close the backlog record**

In `docs/backlog/p0-stream-name-disambiguation.md`: tick every box under «Критерії готовності», set `status: done`, `completed: 2026-08-06`, `updated: 2026-08-06`. Add a note recording the one interpretation the record left open: for the station browser, "URL duplicate = warning, not ban" is delivered as a spoken warning on an already-added row — the browser still refuses to create a second entry for one URL, because URL is the stream's identity there; the "add anyway" escape hatch exists only on the manual add path.

```bash
git mv docs/backlog/p0-stream-name-disambiguation.md docs/backlog/done/
```

Move the record's row into the «Виконано» section of `docs/backlog/ROADMAP.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: record the stream-naming rule and close the backlog entry"
```

- [ ] **Step 5: Manual NVDA verification (developer, before release)**

Not automatable — hand off as a checklist:
1. Add two Radio Browser variants of one station (e.g. BBC Radio 6 Music) → the second lands as `… (AAC 64k)`; both rows read distinctly.
2. Arrow through the browser results → each row announces codec and bitrate.
3. Press Enter on a station already in the profile → NVDA says it is already added.
4. Add a URL already in the profile by hand → warning, then "Все одно додати" saves.
5. Record both variants at once → two separate folders under the recordings directory.
6. Edit a stream that has connected → the "Використати офіційну назву" button is reachable by Tab, announced, and fills the field.
7. Rename a stream onto an existing name → warning, then "Все одно зберегти" saves.
