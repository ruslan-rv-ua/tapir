# Saved Songs Manager (Phase 3C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible "Saved Songs" section that lists recorded tracks (scan-on-demand from `recording.output_dir`), supports filter/sort/search, plays files through the existing player, edits ID3v2 tags (artist/title/album/genre), renames files (collision-safe), and deletes to the Windows Recycle Bin.

**Architecture:** A new `songs` Rust module (scanner via `walkdir` + `lofty`, tag writer, file ops including `SHFileOperationW`) exposed through six IPC commands. Frontend follows the existing panel pattern (BrowserPanel/StreamsPanel): nanostore `$songs`, two screen zones (filter + composite list), React Aria dialogs for TagEditor / Rename, existing `ConfirmDialog` for delete. State stays in sync via three targeted events (`song-tags-updated`, `song-deleted`, `song-renamed`) plus a full rescan after `recording-completed`. No new persistent state.

**Tech Stack:** Tauri 2, `walkdir = "2"` (new), `lofty 0.24` (existing), `windows 0.62` with `Win32_UI_Shell` (added), React 19 + React Aria Components, nanostores, Paraglide.js (uk/en).

**Spec:** [docs/superpowers/specs/2026-05-28-phase-3C-saved-songs-design.md](../specs/2026-05-28-phase-3C-saved-songs-design.md)

**Verify commands:**
- Build: `cd C:\dev\Tapir\src-tauri && cargo build`
- Lint: `cd C:\dev\Tapir\src-tauri && cargo clippy --all-targets -- -D warnings`
- Unit tests (Rust): `cd C:\dev\Tapir\src-tauri && cargo test --lib`
- Frontend type-check: `cd C:\dev\Tapir && pnpm tsc --noEmit`
- Manual run: `cd C:\dev\Tapir && pnpm tauri dev`

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src-tauri/Cargo.toml` | **Modify** | Add `walkdir = "2"` dep; add `Win32_UI_Shell` to the `windows` features array |
| `src-tauri/src/songs/mod.rs` | **Create** | `pub use scanner::*`; module wiring; `Song` struct |
| `src-tauri/src/songs/scanner.rs` | **Create** | `scan(output_dir)`, `read_song(path, output_dir, format)`; format detection helper |
| `src-tauri/src/songs/tags.rs` | **Create** | `write_song_tags()` — read-modify-save via lofty |
| `src-tauri/src/songs/ops.rs` | **Create** | `rename_file()`, `delete_to_recycle_bin()` |
| `src-tauri/src/commands/songs_commands.rs` | **Create** | 6 IPC commands (list/play/explorer/rename/tags/delete) |
| `src-tauri/src/commands/mod.rs` | **Modify** | `pub mod songs_commands;` |
| `src-tauri/src/lib.rs` | **Modify** | `mod songs;` + register six handlers |
| `src-tauri/src/profile.rs` | **Modify** | Add deprecation comment above `saved_tracks` field |
| `src/types/song.ts` | **Create** | `Song` TypeScript interface |
| `src/lib/tauri.ts` | **Modify** | 6 IPC wrappers + 3 event payload types |
| `src/stores/songs.ts` | **Create** | `$songs`, filter atoms, `$filteredSongs`, `$songsStations`, `loadSongs` |
| `src/components/songs/SongsPanel.tsx` | **Create** | Panel container, zone registration, event listeners |
| `src/components/songs/SongsFilterBar.tsx` | **Create** | Search input + sort select + station chips |
| `src/components/songs/SongsList.tsx` | **Create** | Composite list with roving focus |
| `src/components/songs/SongItem.tsx` | **Create** | Row: summary / status / title / meta / actions segments |
| `src/components/songs/SongContextMenu.tsx` | **Create** | React Aria MenuTrigger/Menu (Play / Explorer / Rename / Tags / Delete) |
| `src/components/songs/TagEditorDialog.tsx` | **Create** | Modal form (title/artist/album/genre) |
| `src/components/songs/RenameDialog.tsx` | **Create** | Modal form (single basename input) |
| `src/components/layout/ActivityBar.tsx` | **Modify** | Drop `disabled: true, phase: "3"` from `songs` entry |
| `src/App.tsx` | **Modify** | Route `activeSection === "songs"` to `<SongsPanel />` |
| `src/i18n/messages/uk.json` | **Modify** | Add ~28 Ukrainian message keys |
| `src/i18n/messages/en.json` | **Modify** | Add ~28 English message keys |
| `src-tauri/tests/fixtures/sample.mp3` | **Create** | Tiny silent MP3 fixture for integration test (≤4 KB) |
| `docs/superpowers/checklists/2026-05-28-phase-3C-manual-test.md` | **Create** | Manual NVDA acceptance checklist |

---

## Chunk 1: Backend foundation (deps + module skeleton)

### Task 1: Add dependencies and create empty `songs` module

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/songs/mod.rs`
- Create: `src-tauri/src/songs/scanner.rs`
- Create: `src-tauri/src/songs/tags.rs`
- Create: `src-tauri/src/songs/ops.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1.1 — Add `walkdir` and `Win32_UI_Shell`**

In `src-tauri/Cargo.toml`, locate the `[dependencies]` section.

After the `chrono = ...` line (around line 67), add:

```toml
walkdir = "2"
```

Then update the existing `windows` entry (around lines 72-74) to add the Shell feature:

```toml
# Win32 APIs for quit-confirm MessageBox and Shell file operations
# (Recycle Bin delete via SHFileOperationW).
windows = { version = "0.62", features = [
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_Shell",
    "Win32_Foundation",
] }
```

`Win32_Foundation` is required for `HWND` and `PCWSTR` types used by Shell APIs.

- [ ] **Step 1.2 — Create `src-tauri/src/songs/mod.rs`**

```rust
//! Saved Songs Manager: scan recordings directory, read/write tags,
//! rename files, delete to Recycle Bin.

pub mod scanner;
pub mod tags;
pub mod ops;

use serde::Serialize;
use crate::profile::AudioFormat;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub path: String,
    pub file_name: String,
    pub artist: String,
    pub title: String,
    pub album: String,
    pub genre: String,
    pub station: String,
    pub format: AudioFormat,
    pub duration_ms: u64,
    pub size_bytes: u64,
    pub recorded_at: String,
    pub is_complete: bool,
}
```

- [ ] **Step 1.3 — Create empty `src-tauri/src/songs/scanner.rs`**

```rust
//! Walk recordings directory, read tags via lofty, return `Song` entries.

// Implementation in Tasks 3-4.
```

- [ ] **Step 1.4 — Create empty `src-tauri/src/songs/tags.rs`**

```rust
//! Write ID3v2 tags via lofty (read-modify-save).

// Implementation in Task 5.
```

- [ ] **Step 1.5 — Create empty `src-tauri/src/songs/ops.rs`**

```rust
//! File operations: rename (collision-safe) and delete to Recycle Bin.

// Implementation in Tasks 6-7.
```

- [ ] **Step 1.6 — Register the `songs` module in `lib.rs`**

In `src-tauri/src/lib.rs`, locate the `mod` declarations at the top (lines 1-14). Add `mod songs;` in alphabetical position, after `mod settings;`:

```rust
mod settings;
mod songs;
mod stream;
```

- [ ] **Step 1.7 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS. Warnings about unused modules are fine — they go away as Tasks 2-7 fill in the implementation.

- [ ] **Step 1.8 — Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/songs src-tauri/src/lib.rs
git commit -m "feat(songs): scaffold songs module + add walkdir and Win32_UI_Shell"
```

---

## Chunk 2: Scanner (TDD)

### Task 2: `read_song` — unit tests + implementation

**Files:**
- Modify: `src-tauri/src/songs/scanner.rs`

- [ ] **Step 2.1 — Add failing tests**

Replace `src-tauri/src/songs/scanner.rs` body with:

```rust
//! Walk recordings directory, read tags via lofty, return `Song` entries.

use std::path::{Path, PathBuf};
use chrono::{DateTime, Local};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::prelude::*;
use walkdir::WalkDir;

use crate::errors::RadioError;
use crate::profile::AudioFormat;
use crate::songs::Song;

const STATION_ROOT_SENTINEL: &str = "—";

/// Map an extension (lower-cased) to our `AudioFormat`. None for unsupported.
pub fn format_from_extension(ext: &str) -> Option<AudioFormat> {
    match ext {
        "mp3" => Some(AudioFormat::Mp3),
        "aac" | "m4a" => Some(AudioFormat::Aac),
        _ => None,
    }
}

/// Compute the station name from a file path relative to `output_dir`.
/// First path component → station. Files in `output_dir` root → sentinel.
fn derive_station(path: &Path, output_dir: &Path) -> String {
    path.strip_prefix(output_dir)
        .ok()
        .and_then(|rel| rel.components().next())
        .and_then(|c| c.as_os_str().to_str())
        .filter(|first| {
            // If the only component is the file itself, no station folder.
            PathBuf::from(first).extension().is_none()
        })
        .map(String::from)
        .unwrap_or_else(|| STATION_ROOT_SENTINEL.to_string())
}

fn is_complete_basename(basename: &str) -> bool {
    !basename.ends_with("_incomplete")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_from_extension_recognizes_mp3() {
        assert!(matches!(format_from_extension("mp3"), Some(AudioFormat::Mp3)));
    }

    #[test]
    fn format_from_extension_recognizes_aac_and_m4a() {
        assert!(matches!(format_from_extension("aac"), Some(AudioFormat::Aac)));
        assert!(matches!(format_from_extension("m4a"), Some(AudioFormat::Aac)));
    }

    #[test]
    fn format_from_extension_rejects_unknown() {
        assert!(format_from_extension("ogg").is_none());
        assert!(format_from_extension("flac").is_none());
        assert!(format_from_extension("").is_none());
    }

    #[test]
    fn derive_station_uses_first_subdir() {
        let out = PathBuf::from("/recordings");
        let path = PathBuf::from("/recordings/SomaFM/Tycho - A Walk.mp3");
        assert_eq!(derive_station(&path, &out), "SomaFM");
    }

    #[test]
    fn derive_station_uses_sentinel_when_file_in_root() {
        let out = PathBuf::from("/recordings");
        let path = PathBuf::from("/recordings/orphan.mp3");
        assert_eq!(derive_station(&path, &out), STATION_ROOT_SENTINEL);
    }

    #[test]
    fn is_complete_basename_detects_suffix() {
        assert!(is_complete_basename("Tycho - A Walk"));
        assert!(!is_complete_basename("Tycho - A Walk_incomplete"));
    }
}
```

- [ ] **Step 2.2 — Run tests to verify they fail at compile or PASS**

Run: `cd C:\dev\Tapir\src-tauri && cargo test --lib songs::scanner::tests`
Expected: 6 tests PASS (these test pure helpers without the unimplemented IO functions).

- [ ] **Step 2.3 — Add `read_song` implementation**

Append to `src-tauri/src/songs/scanner.rs` (after `is_complete_basename`, before `#[cfg(test)]`):

```rust
/// Read a single file into a `Song`. Returns Err if the file can't be opened
/// or has no audio properties; tag values fall back to empty strings.
pub fn read_song(path: &Path, output_dir: &Path, format: AudioFormat) -> Result<Song, RadioError> {
    let metadata = std::fs::metadata(path)?;
    let size_bytes = metadata.len();
    let modified: DateTime<Local> = metadata
        .modified()
        .map(DateTime::<Local>::from)
        .unwrap_or_else(|_| Local::now());
    let recorded_at = modified.format("%Y-%m-%dT%H:%M:%S").to_string();

    let basename_with_ext = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let basename = path
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let tagged = lofty::read_from_path(path)
        .map_err(|e| RadioError::Format(format!("Read tags: {e}")))?;
    let duration_ms = tagged.properties().duration().as_millis() as u64;

    let (artist, title, album, genre) = match tagged.primary_tag() {
        Some(tag) => (
            tag.artist().map(|c| c.to_string()).unwrap_or_default(),
            tag.title().map(|c| c.to_string()).unwrap_or_default(),
            tag.album().map(|c| c.to_string()).unwrap_or_default(),
            tag.genre().map(|c| c.to_string()).unwrap_or_default(),
        ),
        None => (String::new(), String::new(), String::new(), String::new()),
    };

    Ok(Song {
        path: path.to_string_lossy().to_string(),
        file_name: basename_with_ext,
        artist,
        title,
        album,
        genre,
        station: derive_station(path, output_dir),
        format,
        duration_ms,
        size_bytes,
        recorded_at,
        is_complete: is_complete_basename(&basename),
    })
}
```

- [ ] **Step 2.4 — Verify build still passes**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS. (No new failing tests, no new warnings.)

- [ ] **Step 2.5 — Commit**

```bash
git add src-tauri/src/songs/scanner.rs
git commit -m "feat(songs): add scanner helpers and read_song with unit tests"
```

---

### Task 3: `scan` — directory walker + integration test fixture

**Files:**
- Modify: `src-tauri/src/songs/scanner.rs`
- Create: `src-tauri/tests/fixtures/sample.mp3`

- [ ] **Step 3.1 — Add the `scan` function**

Append to `src-tauri/src/songs/scanner.rs` (after `read_song`, before `#[cfg(test)]`):

```rust
/// Walk `output_dir` recursively, return one `Song` per recognized audio file.
/// Errors per-file are logged and skipped; the walk continues.
pub fn scan(output_dir: &Path) -> Vec<Song> {
    if !output_dir.exists() {
        return Vec::new();
    }
    let mut songs = Vec::new();
    for entry in WalkDir::new(output_dir).follow_links(false).into_iter().flatten() {
        let path = entry.path();
        if !entry.file_type().is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let Some(format) = format_from_extension(&ext) else { continue };
        match read_song(path, output_dir, format) {
            Ok(song) => songs.push(song),
            Err(e) => log::warn!("Skip song {}: {e}", path.display()),
        }
    }
    songs
}
```

- [ ] **Step 3.2 — Add tests for `scan`**

Inside the existing `#[cfg(test)] mod tests { ... }` block in `scanner.rs`, append:

```rust
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn scan_returns_empty_when_dir_missing() {
        let p = PathBuf::from("/nonexistent/path/that/does/not/exist");
        assert!(scan(&p).is_empty());
    }

    #[test]
    fn scan_skips_unrecognized_extensions() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("notes.txt"), b"hello").unwrap();
        fs::write(dir.path().join("playlist.m3u"), b"#EXTM3U").unwrap();
        assert!(scan(dir.path()).is_empty());
    }

    #[test]
    fn scan_skips_corrupt_audio_files_and_continues() {
        let dir = tempdir().unwrap();
        // Empty MP3 file — lofty will reject it; scan should not panic.
        fs::write(dir.path().join("broken.mp3"), b"").unwrap();
        // No valid files to find, but the call must succeed.
        let songs = scan(dir.path());
        assert!(songs.is_empty());
    }
```

- [ ] **Step 3.3 — Add `tempfile` as a dev-dependency**

In `src-tauri/Cargo.toml`, add (or extend) the `[dev-dependencies]` section. If absent, add it at the bottom:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3.4 — Run scanner tests**

Run: `cd C:\dev\Tapir\src-tauri && cargo test --lib songs::scanner::tests`
Expected: 9 tests PASS.

- [ ] **Step 3.5 — Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/songs/scanner.rs
git commit -m "feat(songs): implement scan() with directory walker + tests"
```

---

## Chunk 3: Tag writing and file operations

### Task 4: `tags::write_song_tags` with round-trip test

**Files:**
- Modify: `src-tauri/src/songs/tags.rs`
- Create: `src-tauri/tests/fixtures/sample.mp3`

- [ ] **Step 4.1 — Add a silent MP3 fixture**

A tiny MP3 fixture is needed so the round-trip test has a real file to read and write. Create a folder if missing:

```bash
mkdir -p src-tauri/tests/fixtures
```

Generate a 1-second silent MP3 from the command line. Using PowerShell with `ffmpeg` (if available on PATH):

```powershell
ffmpeg -y -f lavfi -i anullsrc=r=22050:cl=mono -t 1 -q:a 9 src-tauri/tests/fixtures/sample.mp3
```

If `ffmpeg` is not available, use a pre-made 1-second silent MP3 from the lofty test corpus — copy any small MP3 from the system (e.g. a Windows sample). The fixture must be ≤4 KB and decode without errors.

**Verification:** the file exists and is between 100 bytes and 4096 bytes:

```powershell
(Get-Item src-tauri/tests/fixtures/sample.mp3).Length
```

- [ ] **Step 4.2 — Implement `write_song_tags`**

Replace `src-tauri/src/songs/tags.rs` body with:

```rust
//! Write ID3v2 tags via lofty (read-modify-save).

use std::path::Path;
use lofty::config::WriteOptions;
use lofty::file::TaggedFileExt;
use lofty::prelude::*;
use lofty::tag::{Tag, TagType};

use crate::errors::RadioError;
use crate::profile::AudioFormat;

/// Write artist/title/album/genre to the file's primary tag, preserving any
/// other existing tag fields (e.g. comment, station). Empty `album` / `genre`
/// remove the corresponding frame.
pub fn write_song_tags(
    path: &Path,
    format: AudioFormat,
    artist: &str,
    title: &str,
    album: &str,
    genre: &str,
) -> Result<(), RadioError> {
    let mut tagged = lofty::read_from_path(path)
        .map_err(|e| RadioError::Format(format!("Read tags: {e}")))?;

    let tag_type = match format {
        AudioFormat::Mp3 | AudioFormat::Aac => TagType::Id3v2,
    };

    if tagged.primary_tag().is_none() {
        tagged.insert_tag(Tag::new(tag_type));
    }
    let tag = tagged
        .primary_tag_mut()
        .expect("Primary tag inserted above");

    tag.set_artist(artist.to_string());
    tag.set_title(title.to_string());
    if album.is_empty() {
        tag.remove_album();
    } else {
        tag.set_album(album.to_string());
    }
    if genre.is_empty() {
        tag.remove_genre();
    } else {
        tag.set_genre(genre.to_string());
    }

    tagged
        .save_to_path(path, WriteOptions::default())
        .map_err(|e| RadioError::Format(format!("Write tags: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    const FIXTURE_MP3: &[u8] = include_bytes!("../../tests/fixtures/sample.mp3");

    fn copy_fixture(dir: &Path, name: &str) -> std::path::PathBuf {
        let p = dir.join(name);
        fs::write(&p, FIXTURE_MP3).unwrap();
        p
    }

    #[test]
    fn round_trip_writes_and_reads_back_fields() {
        let dir = tempdir().unwrap();
        let p = copy_fixture(dir.path(), "test.mp3");

        write_song_tags(&p, AudioFormat::Mp3, "Tycho", "A Walk", "Dive", "Ambient").unwrap();

        let tagged = lofty::read_from_path(&p).unwrap();
        let tag = tagged.primary_tag().expect("Tag was just written");
        assert_eq!(tag.artist().as_deref(), Some("Tycho"));
        assert_eq!(tag.title().as_deref(), Some("A Walk"));
        assert_eq!(tag.album().as_deref(), Some("Dive"));
        assert_eq!(tag.genre().as_deref(), Some("Ambient"));
    }

    #[test]
    fn empty_album_removes_album_frame() {
        let dir = tempdir().unwrap();
        let p = copy_fixture(dir.path(), "test.mp3");

        write_song_tags(&p, AudioFormat::Mp3, "Tycho", "A Walk", "Dive", "Ambient").unwrap();
        write_song_tags(&p, AudioFormat::Mp3, "Tycho", "A Walk", "", "Ambient").unwrap();

        let tagged = lofty::read_from_path(&p).unwrap();
        let tag = tagged.primary_tag().unwrap();
        assert!(tag.album().is_none());
        // Other fields preserved.
        assert_eq!(tag.artist().as_deref(), Some("Tycho"));
        assert_eq!(tag.genre().as_deref(), Some("Ambient"));
    }

    #[test]
    fn empty_genre_removes_genre_frame() {
        let dir = tempdir().unwrap();
        let p = copy_fixture(dir.path(), "test.mp3");

        write_song_tags(&p, AudioFormat::Mp3, "A", "B", "C", "Genre").unwrap();
        write_song_tags(&p, AudioFormat::Mp3, "A", "B", "C", "").unwrap();

        let tagged = lofty::read_from_path(&p).unwrap();
        let tag = tagged.primary_tag().unwrap();
        assert!(tag.genre().is_none());
    }
}
```

- [ ] **Step 4.3 — Run tag tests**

Run: `cd C:\dev\Tapir\src-tauri && cargo test --lib songs::tags::tests`
Expected: 3 tests PASS.

If lofty errors on the fixture (e.g. "no audio frame found"), regenerate the fixture with valid lame headers. A safe ffmpeg recipe:

```powershell
ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -c:a libmp3lame -b:a 64k src-tauri/tests/fixtures/sample.mp3
```

- [ ] **Step 4.4 — Commit**

```bash
git add src-tauri/tests/fixtures/sample.mp3 src-tauri/src/songs/tags.rs
git commit -m "feat(songs): write_song_tags with read-modify-save and round-trip tests"
```

---

### Task 5: `ops::rename_file` with collision resolution

**Files:**
- Modify: `src-tauri/src/songs/ops.rs`

- [ ] **Step 5.1 — Implement `rename_file`**

Replace `src-tauri/src/songs/ops.rs` body with:

```rust
//! File operations: rename (collision-safe) and delete to Recycle Bin.

use std::path::{Path, PathBuf};

use crate::errors::RadioError;
use crate::sanitize;

/// Rename `old` so its file stem becomes `new_basename` (extension preserved).
/// Resolves filename collisions via existing `sanitize::resolve_collision`
/// (suffix `_2`, `_3`, ...). Returns the final path.
///
/// `new_basename` is treated as a single path component — slashes / colons /
/// other path separators are stripped via `sanitize_component`.
pub fn rename_file(old: &Path, new_basename: &str) -> Result<PathBuf, RadioError> {
    let parent = old
        .parent()
        .ok_or_else(|| RadioError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "rename: missing parent dir",
        )))?;
    let ext = old
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let cleaned = sanitize::sanitize_component(new_basename.trim());
    if cleaned.is_empty() {
        return Err(RadioError::Format("Empty filename".into()));
    }
    let candidate = if ext.is_empty() {
        parent.join(&cleaned)
    } else {
        parent.join(format!("{cleaned}.{ext}"))
    };
    let final_path = sanitize::resolve_collision(&candidate);
    std::fs::rename(old, &final_path)?;
    Ok(final_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn rename_changes_basename_keeps_extension() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("old name.mp3");
        fs::write(&src, b"data").unwrap();

        let new_path = rename_file(&src, "fresh name").unwrap();
        assert!(new_path.exists());
        assert_eq!(new_path.file_name().unwrap(), "fresh name.mp3");
        assert!(!src.exists());
    }

    #[test]
    fn rename_resolves_collision_with_suffix() {
        let dir = tempdir().unwrap();
        let existing = dir.path().join("target.mp3");
        fs::write(&existing, b"target").unwrap();
        let src = dir.path().join("source.mp3");
        fs::write(&src, b"source").unwrap();

        let new_path = rename_file(&src, "target").unwrap();
        // Suffix added — exact suffix depends on sanitize::resolve_collision.
        assert!(new_path.exists());
        assert_ne!(new_path, existing);
        assert!(new_path.file_name().unwrap().to_string_lossy().contains("target"));
    }

    #[test]
    fn rename_rejects_empty_input() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("file.mp3");
        fs::write(&src, b"x").unwrap();
        assert!(rename_file(&src, "").is_err());
        assert!(rename_file(&src, "   ").is_err());
    }
}
```

- [ ] **Step 5.2 — Run rename tests**

Run: `cd C:\dev\Tapir\src-tauri && cargo test --lib songs::ops::tests::rename`
Expected: 3 tests PASS.

- [ ] **Step 5.3 — Commit**

```bash
git add src-tauri/src/songs/ops.rs
git commit -m "feat(songs): rename_file with collision resolution + tests"
```

---

### Task 6: `ops::delete_to_recycle_bin` (Win32 SHFileOperationW)

**Files:**
- Modify: `src-tauri/src/songs/ops.rs`

- [ ] **Step 6.1 — Append the Recycle Bin function**

Append to `src-tauri/src/songs/ops.rs` (after `rename_file` and before `#[cfg(test)]`):

```rust
/// Send `path` to the Windows Recycle Bin via `SHFileOperationW`.
/// Synchronous, no UI, no confirmation prompts. Returns Err if the operation
/// fails (e.g. file is open by another process, path on a non-recyclable
/// volume such as a network share, or path no longer exists).
pub fn delete_to_recycle_bin(path: &Path) -> Result<(), RadioError> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{
        SHFileOperationW, SHFILEOPSTRUCTW, FO_DELETE, FOF_ALLOWUNDO,
        FOF_NO_UI,
    };

    if !path.exists() {
        return Err(RadioError::NotFound(path.to_string_lossy().to_string()));
    }

    // `pFrom` is a double-NULL-terminated wide string.
    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);
    wide.push(0);

    let mut op = SHFILEOPSTRUCTW {
        hwnd: Default::default(),
        wFunc: FO_DELETE as u32,
        pFrom: PCWSTR(wide.as_ptr()),
        pTo: PCWSTR::null(),
        // FOF_NO_UI is the documented "all flags off" shortcut for silent ops.
        fFlags: (FOF_ALLOWUNDO | FOF_NO_UI) as u16,
        fAnyOperationsAborted: Default::default(),
        hNameMappings: std::ptr::null_mut(),
        lpszProgressTitle: PCWSTR::null(),
    };

    let rc = unsafe { SHFileOperationW(&mut op) };
    if rc != 0 {
        return Err(RadioError::Other(format!(
            "SHFileOperationW failed: 0x{rc:X}"
        )));
    }
    if op.fAnyOperationsAborted.as_bool() {
        return Err(RadioError::Other("Recycle Bin operation aborted".into()));
    }
    Ok(())
}
```

- [ ] **Step 6.2 — Add a NotFound test**

Inside the existing `#[cfg(test)] mod tests { ... }` block in `ops.rs`, append:

```rust
    #[test]
    fn delete_to_recycle_bin_returns_not_found_for_missing() {
        let dir = tempdir().unwrap();
        let missing = dir.path().join("nope.mp3");
        let err = delete_to_recycle_bin(&missing).unwrap_err();
        assert!(matches!(err, RadioError::NotFound(_)));
    }
```

The "happy path" (actually move to Recycle Bin) is intentionally not unit-tested because it's a side-effecting OS call. It's exercised by the manual NVDA checklist in Task 16.

- [ ] **Step 6.3 — Verify build + tests**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

Run: `cd C:\dev\Tapir\src-tauri && cargo test --lib songs::ops`
Expected: 4 tests PASS.

- [ ] **Step 6.4 — Commit**

```bash
git add src-tauri/src/songs/ops.rs
git commit -m "feat(songs): delete_to_recycle_bin via SHFileOperationW"
```

---

## Chunk 4: IPC commands + profile annotation

### Task 7: Annotate `saved_tracks` as deprecated (no behavior change)

**Files:**
- Modify: `src-tauri/src/profile.rs`

- [ ] **Step 7.1 — Add the comment**

In `src-tauri/src/profile.rs`, locate the `saved_tracks: Vec<SavedTrack>` field inside `pub struct Profile` (around line 248). Replace the field with the annotated version:

```rust
    // DEPRECATED Phase 3C: not populated. Saved Songs Manager scans the
    // recordings directory on demand instead. Kept for backward compat with
    // existing profile JSON files; reserved for a future cached-index approach.
    #[serde(default)]
    pub saved_tracks: Vec<SavedTrack>,
```

- [ ] **Step 7.2 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

- [ ] **Step 7.3 — Commit**

```bash
git add src-tauri/src/profile.rs
git commit -m "docs(profile): mark saved_tracks as deprecated (Phase 3C scans on demand)"
```

---

### Task 8: Implement IPC commands and register them

**Files:**
- Create: `src-tauri/src/commands/songs_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 8.1 — Create `songs_commands.rs`**

```rust
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
    // `/select,` highlights the file in its containing folder.
    std::process::Command::new("explorer.exe")
        .args([format!("/select,{path}")])
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
    let result = tokio::task::spawn_blocking(move || -> Result<Song, String> {
        let new_path = songs::ops::rename_file(Path::new(&old_path), &new_basename)
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
        RenamedPayload { old_path: result.path.as_str(), new_song: &result },
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
        songs::tags::write_song_tags(p, format, &artist, &title, &album, &genre)
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
```

- [ ] **Step 8.2 — Register the module**

In `src-tauri/src/commands/mod.rs`, append:

```rust
pub mod songs_commands;
```

- [ ] **Step 8.3 — Register handlers in `lib.rs`**

In `src-tauri/src/lib.rs`, inside the existing `tauri::generate_handler![...]` array (around lines 94-131), append six entries before the closing `]`:

```rust
            commands::songs_commands::list_saved_songs,
            commands::songs_commands::play_saved_song,
            commands::songs_commands::open_song_in_explorer,
            commands::songs_commands::rename_song,
            commands::songs_commands::update_song_tags,
            commands::songs_commands::delete_song,
```

- [ ] **Step 8.4 — Verify build + clippy**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

Run: `cd C:\dev\Tapir\src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: PASS.

- [ ] **Step 8.5 — Commit**

```bash
git add src-tauri/src/commands/songs_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(songs): register six IPC commands for Saved Songs Manager"
```

---

## Chunk 5: Frontend foundation (types, store, wrappers, i18n)

### Task 9: Frontend types, IPC wrappers, and store

**Files:**
- Create: `src/types/song.ts`
- Modify: `src/lib/tauri.ts`
- Create: `src/stores/songs.ts`

- [ ] **Step 9.1 — Create `src/types/song.ts`**

```ts
export interface Song {
  path: string;
  fileName: string;
  artist: string;
  title: string;
  album: string;
  genre: string;
  station: string;
  format: "mp3" | "aac";
  durationMs: number;
  sizeBytes: number;
  recordedAt: string;
  isComplete: boolean;
}

export interface SongTagsUpdatedPayload extends Song {}

export interface SongDeletedPayload {
  path: string;
}

export interface SongRenamedPayload {
  oldPath: string;
  newSong: Song;
}
```

- [ ] **Step 9.2 — Add IPC wrappers to `src/lib/tauri.ts`**

Append to `src/lib/tauri.ts` (after the existing browser/settings wrappers section, at the end of the file):

```ts
// ── Songs (Phase 3C) ──────────────────────────────────────────────────────

import type { Song } from "../types/song";

export async function listSavedSongs(): Promise<Song[]> {
  return invoke("list_saved_songs");
}
export async function playSavedSong(path: string): Promise<void> {
  return invoke("play_saved_song", { path });
}
export async function openSongInExplorer(path: string): Promise<void> {
  return invoke("open_song_in_explorer", { path });
}
export async function renameSavedSong(oldPath: string, newBasename: string): Promise<Song> {
  return invoke("rename_song", { oldPath, newBasename });
}
export async function updateSongTags(
  path: string, artist: string, title: string, album: string, genre: string,
): Promise<Song> {
  return invoke("update_song_tags", { path, artist, title, album, genre });
}
export async function deleteSavedSong(path: string): Promise<void> {
  return invoke("delete_song", { path });
}
```

If TypeScript complains that the top-level `import { invoke }` is not in scope at the bottom of the file, move the import to the top with the other imports.

- [ ] **Step 9.3 — Create `src/stores/songs.ts`**

```ts
import { atom, computed } from "nanostores";
import type { Song } from "../types/song";
import * as tauri from "../lib/tauri";

export type SongsSort = "date" | "title" | "artist" | "size";

export const $songs = atom<Song[]>([]);
export const $songsLoading = atom<boolean>(false);
export const $songsError = atom<string | null>(null);

export const $songsQuery = atom<string>("");
export const $songsStation = atom<string | null>(null);
export const $songsSort = atom<SongsSort>("date");

export const $songsStations = computed($songs, (songs) =>
  Array.from(new Set(songs.map((s) => s.station))).sort()
);

export const $filteredSongs = computed(
  [$songs, $songsQuery, $songsStation, $songsSort],
  (songs, q, station, sort) => {
    const qLower = q.trim().toLowerCase();
    const filtered = songs.filter((s) => {
      if (station && s.station !== station) return false;
      if (
        qLower &&
        !`${s.artist} ${s.title} ${s.album}`.toLowerCase().includes(qLower)
      ) {
        return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "title":  return a.title.localeCompare(b.title);
        case "artist": return a.artist.localeCompare(b.artist);
        case "size":   return b.sizeBytes - a.sizeBytes;
        case "date":   return b.recordedAt.localeCompare(a.recordedAt);
      }
    });
  }
);

export async function loadSongs(): Promise<void> {
  $songsLoading.set(true);
  $songsError.set(null);
  try {
    const songs = await tauri.listSavedSongs();
    $songs.set(songs);
  } catch (e) {
    $songsError.set(String(e));
    $songs.set([]);
  } finally {
    $songsLoading.set(false);
  }
}

export function replaceSongByPath(updated: Song, oldPath?: string): void {
  const key = oldPath ?? updated.path;
  $songs.set($songs.get().map((s) => (s.path === key ? updated : s)));
}

export function removeSongByPath(path: string): void {
  $songs.set($songs.get().filter((s) => s.path !== path));
}
```

- [ ] **Step 9.4 — Type-check**

Run: `cd C:\dev\Tapir && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 9.5 — Commit**

```bash
git add src/types/song.ts src/lib/tauri.ts src/stores/songs.ts
git commit -m "feat(songs): frontend types, IPC wrappers, and nanostore"
```

---

### Task 10: Unit tests for `$filteredSongs`

**Files:**
- Create: `src/stores/songs.test.ts`

- [ ] **Step 10.1 — Add Vitest tests for the computed**

```ts
import { describe, expect, it, beforeEach } from "vitest";
import {
  $songs, $songsQuery, $songsStation, $songsSort, $filteredSongs, $songsStations,
} from "./songs";
import type { Song } from "../types/song";

function song(over: Partial<Song>): Song {
  return {
    path: "/x.mp3", fileName: "x.mp3",
    artist: "", title: "", album: "", genre: "",
    station: "Default", format: "mp3",
    durationMs: 0, sizeBytes: 0, recordedAt: "2026-01-01T00:00:00",
    isComplete: true,
    ...over,
  };
}

beforeEach(() => {
  $songs.set([]);
  $songsQuery.set("");
  $songsStation.set(null);
  $songsSort.set("date");
});

describe("$filteredSongs", () => {
  it("returns all songs when no filters set", () => {
    $songs.set([song({ title: "A" }), song({ title: "B" })]);
    expect($filteredSongs.get()).toHaveLength(2);
  });

  it("filters by station", () => {
    $songs.set([song({ station: "X" }), song({ station: "Y" })]);
    $songsStation.set("Y");
    expect($filteredSongs.get().map((s) => s.station)).toEqual(["Y"]);
  });

  it("filters by query case-insensitive across artist/title/album", () => {
    $songs.set([
      song({ artist: "Tycho", title: "Walk" }),
      song({ artist: "Boards of Canada", title: "Roygbiv" }),
      song({ album: "Selected Ambient Works" }),
    ]);
    $songsQuery.set("ambient");
    expect($filteredSongs.get()).toHaveLength(1);
  });

  it("sorts by date desc by default", () => {
    $songs.set([
      song({ recordedAt: "2026-01-01T00:00:00", title: "old" }),
      song({ recordedAt: "2026-06-01T00:00:00", title: "new" }),
    ]);
    expect($filteredSongs.get().map((s) => s.title)).toEqual(["new", "old"]);
  });

  it("sorts by title ascending", () => {
    $songs.set([song({ title: "Beta" }), song({ title: "Alpha" })]);
    $songsSort.set("title");
    expect($filteredSongs.get().map((s) => s.title)).toEqual(["Alpha", "Beta"]);
  });

  it("sorts by artist ascending", () => {
    $songs.set([song({ artist: "Zoe" }), song({ artist: "Adam" })]);
    $songsSort.set("artist");
    expect($filteredSongs.get().map((s) => s.artist)).toEqual(["Adam", "Zoe"]);
  });

  it("sorts by size descending", () => {
    $songs.set([
      song({ sizeBytes: 100, title: "small" }),
      song({ sizeBytes: 1000, title: "big" }),
    ]);
    $songsSort.set("size");
    expect($filteredSongs.get().map((s) => s.title)).toEqual(["big", "small"]);
  });
});

describe("$songsStations", () => {
  it("returns unique sorted station list", () => {
    $songs.set([
      song({ station: "B" }), song({ station: "A" }), song({ station: "B" }),
    ]);
    expect($songsStations.get()).toEqual(["A", "B"]);
  });
});
```

- [ ] **Step 10.2 — Run the tests**

Run: `cd C:\dev\Tapir && pnpm test --run src/stores/songs.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 10.3 — Commit**

```bash
git add src/stores/songs.test.ts
git commit -m "test(songs): unit tests for $filteredSongs computed"
```

---

### Task 11: i18n strings (uk + en)

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 11.1 — Add Ukrainian keys**

In `src/i18n/messages/uk.json`, insert the following keys. Place them alphabetically near the existing `"songs_section"` entry (line 35). If `"songs_section"` exists, update its value to `"Збережені пісні"` and add the rest grouped after it.

```json
  "songs_section": "Збережені пісні",
  "songs_loading": "Завантаження пісень…",
  "songs_loaded_zero": "Немає збережених пісень",
  "songs_loaded_one": "Знайдено {count} пісню",
  "songs_loaded_few": "Знайдено {count} пісні",
  "songs_loaded_many": "Знайдено {count} пісень",
  "songs_empty": "Поки що немає записаних пісень",
  "songs_error": "Не вдалось завантажити список: {error}",
  "songs_search_placeholder": "Пошук по виконавцю, треку чи альбому",
  "songs_sort_label": "Сортування",
  "songs_sort_date": "За датою",
  "songs_sort_title": "За назвою",
  "songs_sort_artist": "За виконавцем",
  "songs_sort_size": "За розміром",
  "songs_filter_all": "Усі станції",
  "songs_filter_station": "Станція: {station}",
  "songs_action_play": "Грати",
  "songs_action_menu": "Дії",
  "songs_action_explorer": "Відкрити в Explorer",
  "songs_action_rename": "Перейменувати…",
  "songs_action_tags": "Редагувати теги…",
  "songs_action_delete": "Видалити",
  "songs_confirm_delete_title": "Видалити пісню?",
  "songs_confirm_delete_body": "Файл буде переміщено у Кошик: {fileName}",
  "songs_toast_deleted": "Пісню видалено",
  "songs_toast_renamed": "Файл перейменовано на {newName}",
  "songs_toast_tags_saved": "Теги оновлено",
  "songs_toast_failed": "Не вдалось виконати дію: {error}",
  "songs_incomplete_badge": "незавершений",
  "songs_row_summary": "{title}, виконавець {artist}, станція {station}, {sizeMb} МБ, записано {date}",
  "tag_editor_title": "Редагувати теги",
  "tag_editor_artist": "Виконавець",
  "tag_editor_song_title": "Назва треку",
  "tag_editor_album": "Альбом",
  "tag_editor_genre": "Жанр",
  "tag_editor_save": "Зберегти",
  "rename_dialog_title": "Перейменувати файл",
  "rename_dialog_label": "Нове ім'я (без розширення)",
  "rename_dialog_save": "Перейменувати",
  "songs_zone_filter": "Фільтр пісень",
  "songs_zone_list": "Список збережених пісень",
```

- [ ] **Step 11.2 — Add English keys**

In `src/i18n/messages/en.json`, add the same keys with English values. Use the same JSON shape:

```json
  "songs_section": "Saved Songs",
  "songs_loading": "Loading songs…",
  "songs_loaded_zero": "No saved songs",
  "songs_loaded_one": "Found {count} song",
  "songs_loaded_few": "Found {count} songs",
  "songs_loaded_many": "Found {count} songs",
  "songs_empty": "No recorded songs yet",
  "songs_error": "Failed to load: {error}",
  "songs_search_placeholder": "Search by artist, track or album",
  "songs_sort_label": "Sort",
  "songs_sort_date": "By date",
  "songs_sort_title": "By title",
  "songs_sort_artist": "By artist",
  "songs_sort_size": "By size",
  "songs_filter_all": "All stations",
  "songs_filter_station": "Station: {station}",
  "songs_action_play": "Play",
  "songs_action_menu": "Actions",
  "songs_action_explorer": "Open in Explorer",
  "songs_action_rename": "Rename…",
  "songs_action_tags": "Edit tags…",
  "songs_action_delete": "Delete",
  "songs_confirm_delete_title": "Delete song?",
  "songs_confirm_delete_body": "File will be moved to the Recycle Bin: {fileName}",
  "songs_toast_deleted": "Song deleted",
  "songs_toast_renamed": "File renamed to {newName}",
  "songs_toast_tags_saved": "Tags updated",
  "songs_toast_failed": "Action failed: {error}",
  "songs_incomplete_badge": "incomplete",
  "songs_row_summary": "{title}, artist {artist}, station {station}, {sizeMb} MB, recorded {date}",
  "tag_editor_title": "Edit tags",
  "tag_editor_artist": "Artist",
  "tag_editor_song_title": "Track title",
  "tag_editor_album": "Album",
  "tag_editor_genre": "Genre",
  "tag_editor_save": "Save",
  "rename_dialog_title": "Rename file",
  "rename_dialog_label": "New name (without extension)",
  "rename_dialog_save": "Rename",
  "songs_zone_filter": "Songs filter",
  "songs_zone_list": "Saved songs list",
```

- [ ] **Step 11.3 — Trigger Paraglide regeneration**

Paraglide regenerates `src/i18n/paraglide/messages` on Vite startup. Either run `pnpm dev` and stop it, or run the explicit codegen command:

Run: `cd C:\dev\Tapir && pnpm exec paraglide-js compile --project ./project.inlang`
Expected: regenerates `src/i18n/paraglide/messages.js` (or `.ts`) without errors.

If the project uses a different codegen invocation, look at `package.json` "scripts" — most projects expose a `pnpm i18n` or similar. The intent is: every new key in uk.json + en.json becomes an exported function from `src/i18n/paraglide/messages`.

- [ ] **Step 11.4 — Type-check**

Run: `cd C:\dev\Tapir && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 11.5 — Commit**

```bash
git add src/i18n/messages src/i18n/paraglide
git commit -m "i18n(songs): add uk + en strings for Saved Songs Manager"
```

---

## Chunk 6: UI scaffolding (panel, filter bar, list)

### Task 12: Enable songs in ActivityBar; minimal `SongsPanel` + App routing

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`
- Create: `src/components/songs/SongsPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 12.1 — Enable the songs entry**

In `src/components/layout/ActivityBar.tsx`, locate the `SECTIONS` array (around line 20). Replace the `songs` entry:

```diff
-  { id: "songs", label: m.songs_section, Icon: Music, disabled: true, phase: "3" },
+  { id: "songs", label: m.songs_section, Icon: Music },
```

- [ ] **Step 12.2 — Create a stub `SongsPanel.tsx`**

```tsx
import { useEffect } from "react";
import { useStore } from "@nanostores/react";
import { $filteredSongs, $songsLoading, $songsError, loadSongs } from "../../stores/songs";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function SongsPanel({ onZonesChange, exitZone: _exitZone }: Props) {
  const songs = useStore($filteredSongs);
  const loading = useStore($songsLoading);
  const error = useStore($songsError);

  useEffect(() => {
    loadSongs();
    // Stub: no zones registered yet — Tasks 13/14 add filter + list zones.
    onZonesChange([]);
  }, [onZonesChange]);

  return (
    <div role="region" aria-label={m.songs_section()} className="flex flex-1 flex-col overflow-hidden">
      {loading && <p className="p-4 text-slate-400" role="status">{m.songs_loading()}</p>}
      {error && <p className="p-4 text-red-400" role="alert">{m.songs_error({ error })}</p>}
      {!loading && !error && songs.length === 0 && (
        <p className="p-4 text-slate-400">{m.songs_empty()}</p>
      )}
      {!loading && !error && songs.length > 0 && (
        <p className="p-4 text-slate-400">
          Showing {songs.length} songs (full UI in Tasks 13-15)
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 12.3 — Route the section in `App.tsx`**

In `src/App.tsx`, locate the `<main>` block that conditionally renders panels (around lines 292-296). Add the import at the top:

```diff
 import { BrowserPanel } from "./components/browser/BrowserPanel";
+import { SongsPanel } from "./components/songs/SongsPanel";
```

Add the routing line after the existing `BrowserPanel`:

```diff
         {activeSection === "browser" && <BrowserPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
+        {activeSection === "songs" && <SongsPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
         <PlayerPanel ref={playerZoneRef} exitZone={(forward: boolean) => exitZone("player", forward)} />
```

- [ ] **Step 12.4 — Manual smoke test**

Run: `cd C:\dev\Tapir && pnpm tauri dev`

- Click "Збережені пісні" in the ActivityBar.
- Expected: panel shows "Поки що немає записаних пісень" if `data/recordings/` is empty, or "Showing N songs" otherwise.
- No console errors. Activity bar item is no longer disabled and has no "Buде доступно у Фазі 3" announcement.

- [ ] **Step 12.5 — Commit**

```bash
git add src/components/layout/ActivityBar.tsx src/components/songs/SongsPanel.tsx src/App.tsx
git commit -m "feat(songs): wire SongsPanel into ActivityBar + App routing"
```

---

### Task 13: `SongsFilterBar` — search, sort, station chips

**Files:**
- Create: `src/components/songs/SongsFilterBar.tsx`
- Modify: `src/components/songs/SongsPanel.tsx`

- [ ] **Step 13.1 — Implement `SongsFilterBar.tsx`**

```tsx
import { useStore } from "@nanostores/react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  $songsQuery, $songsStation, $songsSort, $songsStations,
} from "../../stores/songs";
import { useFocusBoundary } from "../../hooks/useFocusBoundary";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
}

export const SongsFilterBar = forwardRef<ZoneEntry, Props>(({ exitZone }, ref) => {
  const query = useStore($songsQuery);
  const station = useStore($songsStation);
  const sort = useStore($songsSort);
  const stations = useStore($songsStations);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const { restoreFocus } = useFocusBoundary(containerRef, exitZone);

  useImperativeHandle(ref, () => ({
    id: "songs-filter",
    get el() { return containerRef.current!; },
    focus: restoreFocus,
  }), [restoreFocus]);

  return (
    <div
      ref={containerRef}
      data-zone-id="songs-filter"
      aria-label={m.songs_zone_filter()}
      role="region"
      className="flex flex-col gap-2 border-b border-slate-700 bg-slate-900/40 p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-1 min-w-[220px] flex-col gap-1">
          <span className="sr-only">{m.songs_search_placeholder()}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => $songsQuery.set(e.target.value)}
            placeholder={m.songs_search_placeholder()}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText] forced-colors:border-[ButtonText]"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span>{m.songs_sort_label()}</span>
          <select
            value={sort}
            onChange={(e) => $songsSort.set(e.target.value as typeof sort)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
          >
            <option value="date">{m.songs_sort_date()}</option>
            <option value="title">{m.songs_sort_title()}</option>
            <option value="artist">{m.songs_sort_artist()}</option>
            <option value="size">{m.songs_sort_size()}</option>
          </select>
        </label>
      </div>

      <div role="group" aria-label={m.songs_filter_all()} className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => $songsStation.set(null)}
          aria-pressed={station === null}
          className={[
            "rounded-full border px-3 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
            station === null
              ? "border-sky-400 bg-sky-400/20 text-sky-200 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
              : "border-slate-600 text-slate-300 hover:border-slate-500 forced-colors:text-[ButtonText]",
          ].join(" ")}
        >
          {m.songs_filter_all()}
        </button>
        {stations.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => $songsStation.set(s)}
            aria-pressed={station === s}
            className={[
              "rounded-full border px-3 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
              station === s
                ? "border-sky-400 bg-sky-400/20 text-sky-200 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                : "border-slate-600 text-slate-300 hover:border-slate-500 forced-colors:text-[ButtonText]",
            ].join(" ")}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
});
SongsFilterBar.displayName = "SongsFilterBar";
```

- [ ] **Step 13.2 — Register the filter zone in `SongsPanel`**

Replace `src/components/songs/SongsPanel.tsx` body with:

```tsx
import { useEffect, useRef } from "react";
import { useStore } from "@nanostores/react";
import { $filteredSongs, $songsLoading, $songsError, loadSongs } from "../../stores/songs";
import { SongsFilterBar } from "./SongsFilterBar";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function SongsPanel({ onZonesChange, exitZone }: Props) {
  const songs = useStore($filteredSongs);
  const loading = useStore($songsLoading);
  const error = useStore($songsError);

  const filterRef = useRef<ZoneEntry | null>(null);

  useEffect(() => {
    loadSongs();
  }, []);

  useEffect(() => {
    if (filterRef.current) onZonesChange([filterRef.current]);
  }, [onZonesChange]);

  return (
    <div role="region" aria-label={m.songs_section()} className="flex flex-1 flex-col overflow-hidden">
      <SongsFilterBar ref={filterRef} exitZone={(forward) => exitZone("songs-filter", forward)} />
      {loading && <p className="p-4 text-slate-400" role="status">{m.songs_loading()}</p>}
      {error && <p className="p-4 text-red-400" role="alert">{m.songs_error({ error })}</p>}
      {!loading && !error && songs.length === 0 && (
        <p className="p-4 text-slate-400">{m.songs_empty()}</p>
      )}
      {!loading && !error && songs.length > 0 && (
        <p className="p-4 text-slate-400">
          Showing {songs.length} songs (list UI in Task 14)
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 13.3 — Type-check + smoke test**

Run: `cd C:\dev\Tapir && pnpm tsc --noEmit`
Expected: PASS.

Run: `cd C:\dev\Tapir && pnpm tauri dev` — open Songs section:
- Filter bar visible with search + sort + "Усі станції" chip.
- Typing in search filters the count.
- Sort change updates the count if order differs.
- Tab from ActivityBar enters filter bar; Tab again leaves to the next zone.

- [ ] **Step 13.4 — Commit**

```bash
git add src/components/songs/SongsFilterBar.tsx src/components/songs/SongsPanel.tsx
git commit -m "feat(songs): SongsFilterBar with search, sort, station chips"
```

---

### Task 14: `SongsList` + `SongItem` (composite list)

**Files:**
- Create: `src/components/songs/SongItem.tsx`
- Create: `src/components/songs/SongsList.tsx`
- Modify: `src/components/songs/SongsPanel.tsx`

- [ ] **Step 14.1 — Implement `SongItem.tsx`**

```tsx
import { Play, FileMusic, MoreHorizontal, AlertCircle } from "lucide-react";
import type { Song } from "../../types/song";
import type { SegmentKind } from "../../hooks/useCompositeList";
import * as m from "../../i18n/paraglide/messages";

export interface SongItemData {
  id: string;
  /** Segments after summary. Status sits before track on incomplete files. */
  segments: Exclude<SegmentKind, "summary">[];
}

export function getSongSegments(song: Song): SongItemData["segments"] {
  const base: SongItemData["segments"] = ["track", "tech", "action-play", "action-menu"];
  return song.isComplete ? base : ["status", ...base];
}

function formatMB(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1);
}

function formatDate(iso: string): string {
  // Strip seconds for compactness; full ISO read aloud by NVDA is fine.
  return iso.replace("T", " ").slice(0, 16);
}

interface Props {
  song: Song;
  isActiveRow: boolean;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  onPlay: () => void;
  onContextMenu: () => void;
}

export function SongItem({ song, isActiveRow, isFocused, onPlay, onContextMenu }: Props) {
  const summaryLabel = m.songs_row_summary({
    title: song.title || song.fileName,
    artist: song.artist || "—",
    station: song.station,
    sizeMb: formatMB(song.sizeBytes),
    date: formatDate(song.recordedAt),
  });

  return (
    <li
      role="listitem"
      data-item-id={song.path}
      aria-label={summaryLabel}
      tabIndex={isFocused("summary") ? 0 : -1}
      className={[
        "flex items-center gap-3 border-b border-slate-800 px-3 py-2 outline-none",
        "focus-visible:ring-2 focus-visible:ring-blue-400",
        isActiveRow ? "bg-slate-800/40" : "",
      ].join(" ")}
    >
      {!song.isComplete && (
        <span
          tabIndex={isFocused("status") ? 0 : -1}
          aria-label={m.songs_incomplete_badge()}
          className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Mark] forced-colors:text-[MarkText]"
        >
          <AlertCircle size={12} aria-hidden /> {m.songs_incomplete_badge()}
        </span>
      )}

      <span
        tabIndex={isFocused("track") ? 0 : -1}
        aria-label={song.title || song.fileName}
        className="flex flex-1 min-w-0 items-center gap-2 truncate text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <FileMusic size={14} aria-hidden className="flex-none text-slate-500" />
        <span className="truncate">{song.title || song.fileName}</span>
      </span>

      <span
        tabIndex={isFocused("tech") ? 0 : -1}
        aria-label={`${song.artist || "—"} · ${song.album || "—"} · ${song.format} · ${formatMB(song.sizeBytes)} МБ`}
        className="hidden min-w-0 flex-1 truncate text-xs text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 md:block"
      >
        {song.artist} · {song.station}
      </span>

      <button
        type="button"
        onClick={onPlay}
        tabIndex={isFocused("action-play") ? 0 : -1}
        aria-label={m.songs_action_play()}
        className="rounded p-1.5 text-slate-300 outline-none hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText]"
      >
        <Play size={16} aria-hidden />
      </button>

      <button
        type="button"
        onClick={onContextMenu}
        data-context-menu-trigger
        data-item-id={song.path}
        tabIndex={isFocused("action-menu") ? 0 : -1}
        aria-label={m.songs_action_menu()}
        className="rounded p-1.5 text-slate-300 outline-none hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText]"
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
    </li>
  );
}
```

- [ ] **Step 14.2 — Implement `SongsList.tsx`**

```tsx
import { forwardRef, useImperativeHandle, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $filteredSongs } from "../../stores/songs";
import { useCompositeList } from "../../hooks/useCompositeList";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { SongItem, getSongSegments } from "./SongItem";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onPlay: (path: string) => void;
  onContextMenu: (path: string) => void;
}

export const SongsList = forwardRef<ZoneEntry, Props>(
  ({ exitZone, onEmpty, onPlay, onContextMenu }, ref) => {
    const songs = useStore($filteredSongs);

    const items = useMemo(
      () => songs.map((s) => ({ id: s.path, segments: getSongSegments(s) })),
      [songs]
    );

    const { listRef, onKeyDownCapture, isFocused, restoreFocus, activeItemId } =
      useCompositeList({
        zoneId: "songs-list",
        items,
        onTabOut: exitZone,
        onEmpty,
        onAction: (type, itemId, segment) => {
          if (type === "contextMenu") {
            onContextMenu(itemId);
            return;
          }
          if ((type === "primary" || type === "toggle") && segment === "summary") {
            onPlay(itemId);
          }
        },
      });

    useImperativeHandle(ref, () => ({
      id: "songs-list",
      get el() { return listRef.current!; },
      focus: restoreFocus,
    }), [restoreFocus]);

    return (
      <ul
        ref={listRef}
        role="list"
        data-zone-id="songs-list"
        aria-label={m.songs_zone_list()}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onKeyDownCapture={onKeyDownCapture}
      >
        {songs.map((song) => (
          <SongItem
            key={song.path}
            song={song}
            isActiveRow={activeItemId === song.path}
            isFocused={(segment) => isFocused(song.path, segment)}
            onPlay={() => onPlay(song.path)}
            onContextMenu={() => onContextMenu(song.path)}
          />
        ))}
      </ul>
    );
  }
);
SongsList.displayName = "SongsList";
```

- [ ] **Step 14.3 — Wire list into `SongsPanel`**

Replace `src/components/songs/SongsPanel.tsx` body with:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { $filteredSongs, $songsLoading, $songsError, loadSongs } from "../../stores/songs";
import { SongsFilterBar } from "./SongsFilterBar";
import { SongsList } from "./SongsList";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function SongsPanel({ onZonesChange, exitZone }: Props) {
  const songs = useStore($filteredSongs);
  const loading = useStore($songsLoading);
  const error = useStore($songsError);

  const filterRef = useRef<ZoneEntry | null>(null);
  const listRef = useRef<ZoneEntry | null>(null);
  const [, forceZonesUpdate] = useState(0);

  useEffect(() => {
    loadSongs();
  }, []);

  const refreshZones = useCallback(() => {
    const zones: ZoneEntry[] = [];
    if (filterRef.current) zones.push(filterRef.current);
    if (listRef.current) zones.push(listRef.current);
    onZonesChange(zones);
  }, [onZonesChange]);

  useEffect(() => {
    refreshZones();
  }, [refreshZones, songs.length]);

  const handlePlay = useCallback((path: string) => {
    tauri.playSavedSong(path).catch((err) => addToast(String(err), "error"));
  }, []);

  const handleContextMenu = useCallback((_path: string) => {
    // Stub: real menu wired in Task 15.
  }, []);

  return (
    <div role="region" aria-label={m.songs_section()} className="flex flex-1 flex-col overflow-hidden">
      <SongsFilterBar ref={filterRef} exitZone={(forward) => exitZone("songs-filter", forward)} />
      {loading && <p className="p-4 text-slate-400" role="status">{m.songs_loading()}</p>}
      {error && <p className="p-4 text-red-400" role="alert">{m.songs_error({ error })}</p>}
      {!loading && !error && songs.length === 0 && (
        <p className="p-4 text-slate-400">{m.songs_empty()}</p>
      )}
      {!loading && !error && songs.length > 0 && (
        <SongsList
          ref={listRef}
          exitZone={(forward) => exitZone("songs-list", forward)}
          onEmpty={() => filterRef.current?.focus("forward")}
          onPlay={handlePlay}
          onContextMenu={handleContextMenu}
        />
      )}
      <span className="sr-only" aria-hidden>{forceZonesUpdate}</span>
    </div>
  );
}
```

- [ ] **Step 14.4 — Manual smoke test**

Run: `cd C:\dev\Tapir && pnpm tauri dev`

Pre-req: at least one MP3 in `data/recordings/` (record any stream for ~30 s in the Streams panel).

- Open Songs section. List shows song(s).
- Tab through ActivityBar → Filter → List. Up/Down moves between rows. Left/Right walks segments (track / tech / Play / Menu). Enter on summary → playback begins (audible).
- Verify NVDA reads the aria-label of the row on summary focus.

- [ ] **Step 14.5 — Commit**

```bash
git add src/components/songs/SongItem.tsx src/components/songs/SongsList.tsx src/components/songs/SongsPanel.tsx
git commit -m "feat(songs): SongsList + SongItem composite list with roving focus"
```

---

## Chunk 7: Dialogs, context menu, events

### Task 15: Context menu + TagEditorDialog + RenameDialog + delete confirm

**Files:**
- Create: `src/components/songs/SongContextMenu.tsx`
- Create: `src/components/songs/TagEditorDialog.tsx`
- Create: `src/components/songs/RenameDialog.tsx`
- Modify: `src/components/songs/SongsPanel.tsx`

- [ ] **Step 15.1 — Create `SongContextMenu.tsx`**

```tsx
import {
  Button, Menu, MenuItem, MenuTrigger, Popover,
} from "react-aria-components";
import type { Song } from "../../types/song";
import * as m from "../../i18n/paraglide/messages";

type Action = "play" | "explorer" | "rename" | "tags" | "delete";

interface Props {
  song: Song;
  /** Renders the trigger; receives toggle props for `data-context-menu-trigger`. */
  onAction: (action: Action) => void;
}

export function SongContextMenu({ song, onAction }: Props) {
  return (
    <MenuTrigger>
      <Button
        data-context-menu-trigger
        data-item-id={song.path}
        aria-label={m.songs_action_menu()}
        className="sr-only"
      >
        {m.songs_action_menu()}
      </Button>
      <Popover
        placement="bottom end"
        className="rounded border border-slate-700 bg-slate-900 p-1 shadow-xl outline-none forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]"
      >
        <Menu className="flex min-w-[180px] flex-col text-sm outline-none">
          <MenuItem onAction={() => onAction("play")} className="cursor-pointer rounded px-2 py-1 text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_play()}
          </MenuItem>
          <MenuItem onAction={() => onAction("explorer")} className="cursor-pointer rounded px-2 py-1 text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_explorer()}
          </MenuItem>
          <MenuItem onAction={() => onAction("rename")} className="cursor-pointer rounded px-2 py-1 text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_rename()}
          </MenuItem>
          <MenuItem onAction={() => onAction("tags")} className="cursor-pointer rounded px-2 py-1 text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_tags()}
          </MenuItem>
          <MenuItem onAction={() => onAction("delete")} className="cursor-pointer rounded px-2 py-1 text-red-300 outline-none data-[focused]:bg-red-900/40 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight]">
            {m.songs_action_delete()}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
```

Note: the SongItem already exposes a separate "Actions" button (rendered as a normal button). The pattern used by `StreamItem` puts the MenuTrigger button inside the row and dispatches via `data-context-menu-trigger`. For songs we adopt the same convention: the menu is mounted alongside each row but the **visible** action button is the one in SongItem. The MenuTrigger button stays `sr-only`; clicking the visible row button programmatically clicks the hidden trigger.

We adjust SongItem in Step 15.4.

- [ ] **Step 15.2 — Create `TagEditorDialog.tsx`**

```tsx
import { useState } from "react";
import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import type { Song } from "../../types/song";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  song: Song;
  onClose: () => void;
  onSaved: (updated: Song) => void;
}

export function TagEditorDialog({ song, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [album, setAlbum] = useState(song.album);
  const [genre, setGenre] = useState(song.genre);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const updated = await tauri.updateSongTags(song.path, artist, title, album, genre);
      addToast(m.songs_toast_tags_saved(), "success");
      onSaved(updated);
      onClose();
    } catch (err) {
      addToast(m.songs_toast_failed({ error: String(err) }), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <Modal className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {m.tag_editor_title()}
          </Heading>
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.tag_editor_song_title()}
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.tag_editor_artist()}
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.tag_editor_album()}
              <input
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.tag_editor_genre()}
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50 forced-colors:text-[ButtonText]"
              >
                {m.cancel()}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
              >
                {m.tag_editor_save()}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 15.3 — Create `RenameDialog.tsx`**

```tsx
import { useState } from "react";
import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import type { Song } from "../../types/song";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  song: Song;
  onClose: () => void;
  onSaved: (updated: Song, oldPath: string) => void;
}

export function RenameDialog({ song, onClose, onSaved }: Props) {
  const stem = song.fileName.replace(/\.[^.]+$/, "");
  const [name, setName] = useState(stem);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const updated = await tauri.renameSavedSong(song.path, name.trim());
      addToast(m.songs_toast_renamed({ newName: updated.fileName }), "success");
      onSaved(updated, song.path);
      onClose();
    } catch (err) {
      addToast(m.songs_toast_failed({ error: String(err) }), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {m.rename_dialog_title()}
          </Heading>
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.rename_dialog_label()}
              <input
                autoFocus
                value={name}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setName(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50 forced-colors:text-[ButtonText]"
              >
                {m.cancel()}
              </button>
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
              >
                {m.rename_dialog_save()}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 15.4 — Wire everything into `SongsPanel.tsx`**

Replace `src/components/songs/SongsPanel.tsx` body with:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import {
  $filteredSongs, $songs, $songsLoading, $songsError,
  loadSongs, replaceSongByPath, removeSongByPath,
} from "../../stores/songs";
import { SongsFilterBar } from "./SongsFilterBar";
import { SongsList } from "./SongsList";
import { SongContextMenu } from "./SongContextMenu";
import { TagEditorDialog } from "./TagEditorDialog";
import { RenameDialog } from "./RenameDialog";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import type { SongDeletedPayload, SongRenamedPayload, Song } from "../../types/song";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { addToast } from "../../stores/toasts";
import { useAnnounce } from "../../hooks/useAnnounce";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function SongsPanel({ onZonesChange, exitZone }: Props) {
  const songs = useStore($filteredSongs);
  const allSongs = useStore($songs);
  const loading = useStore($songsLoading);
  const error = useStore($songsError);
  const announce = useAnnounce();

  const filterRef = useRef<ZoneEntry | null>(null);
  const listRef = useRef<ZoneEntry | null>(null);

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [tagEditorFor, setTagEditorFor] = useState<Song | null>(null);
  const [renameFor, setRenameFor] = useState<Song | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Song | null>(null);

  useEffect(() => {
    loadSongs();
  }, []);

  useEffect(() => {
    const zones: ZoneEntry[] = [];
    if (filterRef.current) zones.push(filterRef.current);
    if (listRef.current) zones.push(listRef.current);
    onZonesChange(zones);
  }, [onZonesChange, songs.length]);

  // Event listeners
  useTauriEvent<Song>("song-tags-updated", (payload) => {
    replaceSongByPath(payload);
  });
  useTauriEvent<SongDeletedPayload>("song-deleted", (payload) => {
    removeSongByPath(payload.path);
    announce(m.songs_toast_deleted(), "assertive");
  });
  useTauriEvent<SongRenamedPayload>("song-renamed", (payload) => {
    replaceSongByPath(payload.newSong, payload.oldPath);
  });
  useTauriEvent("recording-completed", () => {
    loadSongs();
  });

  const findSong = useCallback((path: string) => allSongs.find((s) => s.path === path), [allSongs]);

  const handlePlay = useCallback((path: string) => {
    tauri.playSavedSong(path).catch((err) => addToast(String(err), "error"));
  }, []);

  const handleContextMenu = useCallback((path: string) => {
    setActiveMenu(path);
  }, []);

  const handleMenuAction = useCallback(
    async (path: string, action: "play" | "explorer" | "rename" | "tags" | "delete") => {
      const song = findSong(path);
      if (!song) return;
      setActiveMenu(null);
      switch (action) {
        case "play":
          handlePlay(path);
          break;
        case "explorer":
          try { await tauri.openSongInExplorer(path); }
          catch (e) { addToast(m.songs_toast_failed({ error: String(e) }), "error"); }
          break;
        case "rename":
          setRenameFor(song);
          break;
        case "tags":
          setTagEditorFor(song);
          break;
        case "delete":
          setConfirmDelete(song);
          break;
      }
    },
    [findSong, handlePlay]
  );

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      await tauri.deleteSavedSong(confirmDelete.path);
    } catch (e) {
      addToast(m.songs_toast_failed({ error: String(e) }), "error");
    }
    setConfirmDelete(null);
  };

  return (
    <div role="region" aria-label={m.songs_section()} className="flex flex-1 flex-col overflow-hidden">
      <SongsFilterBar ref={filterRef} exitZone={(forward) => exitZone("songs-filter", forward)} />
      {loading && <p className="p-4 text-slate-400" role="status">{m.songs_loading()}</p>}
      {error && <p className="p-4 text-red-400" role="alert">{m.songs_error({ error })}</p>}
      {!loading && !error && songs.length === 0 && (
        <p className="p-4 text-slate-400">{m.songs_empty()}</p>
      )}
      {!loading && !error && songs.length > 0 && (
        <SongsList
          ref={listRef}
          exitZone={(forward) => exitZone("songs-list", forward)}
          onEmpty={() => filterRef.current?.focus("forward")}
          onPlay={handlePlay}
          onContextMenu={handleContextMenu}
        />
      )}

      {activeMenu && (() => {
        const song = findSong(activeMenu);
        return song ? (
          <SongContextMenu
            song={song}
            onAction={(action) => handleMenuAction(activeMenu, action)}
          />
        ) : null;
      })()}

      {tagEditorFor && (
        <TagEditorDialog
          song={tagEditorFor}
          onClose={() => setTagEditorFor(null)}
          onSaved={(updated) => replaceSongByPath(updated)}
        />
      )}

      {renameFor && (
        <RenameDialog
          song={renameFor}
          onClose={() => setRenameFor(null)}
          onSaved={(updated, oldPath) => replaceSongByPath(updated, oldPath)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={m.songs_confirm_delete_title()}
          message={m.songs_confirm_delete_body({ fileName: confirmDelete.fileName })}
          confirmLabel={m.songs_action_delete()}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 15.5 — Type-check and manual smoke test**

Run: `cd C:\dev\Tapir && pnpm tsc --noEmit`
Expected: PASS.

Run: `cd C:\dev\Tapir && pnpm tauri dev`

- Open Songs panel; expand context menu on a row (click the "Дії" button).
- "Грати" — playback starts.
- "Відкрити в Explorer" — Explorer opens with file highlighted.
- "Редагувати теги…" — dialog opens; change artist; save; toast "Теги оновлено"; list row updates.
- "Перейменувати…" — dialog opens; rename; toast "Файл перейменовано на …"; list updates.
- "Видалити" — ConfirmDialog opens with focus on "Скасувати"; Confirm → file goes to Recycle Bin; toast + announce; row disappears.

- [ ] **Step 15.6 — Commit**

```bash
git add src/components/songs/SongContextMenu.tsx src/components/songs/TagEditorDialog.tsx src/components/songs/RenameDialog.tsx src/components/songs/SongsPanel.tsx
git commit -m "feat(songs): context menu + TagEditor + Rename + delete confirm"
```

---

## Chunk 8: Verification

### Task 16: Acceptance test + NVDA checklist

**Files:**
- Create: `docs/superpowers/checklists/2026-05-28-phase-3C-manual-test.md`
- Modify: `docs/implementation-phases.md`

- [ ] **Step 16.1 — Run the full Rust + frontend test suite**

Run: `cd C:\dev\Tapir\src-tauri && cargo test --lib`
Expected: all PASS (includes 9 scanner + 3 tags + 4 ops = 16 new tests).

Run: `cd C:\dev\Tapir\src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: PASS.

Run: `cd C:\dev\Tapir && pnpm tsc --noEmit && pnpm test --run`
Expected: PASS.

- [ ] **Step 16.2 — Create the manual NVDA checklist**

```markdown
# Phase 3C — Saved Songs Manager: Manual NVDA Acceptance Test

> Run with NVDA active. Date filled in as test is executed.

## Pre-conditions

- [ ] `data/recordings/` contains at least 3 MP3 files across 2 stations
- [ ] At least one file has `_incomplete` suffix
- [ ] Tapir built and launched in release mode (`pnpm tauri build`, then `src-tauri/target/release/tapir.exe`)

## Navigation

- [ ] Tab from ActivityBar → Filter zone → List zone → Player → StatusBar → cycles back
- [ ] Shift+Tab reverses the cycle
- [ ] F6 / Shift+F6 jumps zones as expected

## Filter bar

- [ ] Search input filters list as typed; NVDA reads new count via live region
- [ ] Sort dropdown changes order (verify date desc / title asc / artist asc / size desc)
- [ ] Station chip "Усі станції" + per-station chips toggle filter; `aria-pressed` reflected by NVDA

## List

- [ ] Up/Down moves between summary focus stops; NVDA reads the full row label
- [ ] Left/Right walks segments (track / tech / Play / Menu) and, for incomplete rows, status badge
- [ ] Shift+F10 opens the context menu on the focused row
- [ ] Right-click opens the context menu

## Context menu

- [ ] Грати → playback begins; PlayerPanel reflects the file
- [ ] Відкрити в Explorer → Explorer opens with the file highlighted
- [ ] Перейменувати… → dialog opens, current name selected, focus on input
- [ ] Редагувати теги… → dialog opens, title field focused
- [ ] Видалити → ConfirmDialog opens with focus on Cancel

## Tag editor

- [ ] Editing artist/title/album/genre and Save → toast "Теги оновлено", row in list updates without rescan
- [ ] ESC cancels without saving
- [ ] Submit while empty fields work (empty album/genre clears the frame)

## Rename

- [ ] New name with collision → file saved with suffix; toast announces new filename
- [ ] Empty input → Save button disabled
- [ ] ESC cancels

## Delete

- [ ] Confirm → file moved to Recycle Bin; toast + announce "Пісню видалено"
- [ ] Verify file appears in Windows Recycle Bin and can be restored
- [ ] Cancel keeps the file
- [ ] File open by Tapir player → toast surfaces OS error

## Incomplete files

- [ ] Files ending in `_incomplete` show status badge "незавершений"
- [ ] Play / Tags / Rename / Delete actions all available for incomplete files

## Loading & errors

- [ ] First open of section announces "Завантаження пісень…" then count
- [ ] `output_dir` empty / missing → "Поки що немає записаних пісень" displayed
- [ ] Corrupt MP3 in directory → skipped silently, others load

## High Contrast

- [ ] With Windows High Contrast mode active, filter chips, list rows, action buttons, menu items, and dialogs remain readable
- [ ] `aria-pressed` state of station chip is visually distinguishable in HC

## Refresh behavior

- [ ] Start a new recording in Streams panel; let it finalize; switch to Songs → new file appears (triggered by `recording-completed`)
- [ ] External delete via Explorer → list does NOT auto-refresh (acceptable; next section open refreshes)

## Sign-off

- Tested by: _____
- Date: _____
- NVDA version: _____
- Tapir build hash: _____
```

- [ ] **Step 16.3 — Update `docs/implementation-phases.md`**

In `docs/implementation-phases.md`, locate the summary table row for Phase 3C (around line 22). Change `⬜` to `✅ Complete`:

```diff
-| 3C | Saved Songs Manager | Менеджер записаних файлів, редагування тегів | ⬜ |
+| 3C | Saved Songs Manager | Менеджер записаних файлів, редагування тегів | ✅ Complete |
```

Then locate the "Критерії 'Done'" list for Phase 3C (around lines 356-362) and tick each item:

```diff
-- [ ] Список усіх записаних файлів з metadata
-- [ ] Сортування за назвою, артистом, датою, розміром
-- [ ] Фільтрація та пошук
-- [ ] Контекстне меню: відтворити, відкрити в explorer, видалити, перейменувати, редагувати теги
-- [ ] TagEditor: зміна artist, title, album, genre
-- [ ] Confirm dialog при видаленні
-- [ ] NVDA: grid navigation, live region при операціях
+- [x] Список усіх записаних файлів з metadata
+- [x] Сортування за назвою, артистом, датою, розміром
+- [x] Фільтрація та пошук
+- [x] Контекстне меню: відтворити, відкрити в explorer, видалити, перейменувати, редагувати теги
+- [x] TagEditor: зміна artist, title, album, genre
+- [x] Confirm dialog при видаленні
+- [x] NVDA: composite-list navigation, live region при операціях
```

The original criteria mentioned "grid navigation" but Phase 3C uses composite-list navigation per FRD-navigation; the change reflects the actual implementation.

- [ ] **Step 16.4 — Final commit**

```bash
git add docs/superpowers/checklists/2026-05-28-phase-3C-manual-test.md docs/implementation-phases.md
git commit -m "docs(phases): add Phase 3C manual checklist and mark complete"
```

- [ ] **Step 16.5 — Run the manual checklist**

Walk through the entire checklist in `docs/superpowers/checklists/2026-05-28-phase-3C-manual-test.md` line by line. Tick each item as it passes. If any fails, file a follow-up commit with the fix before declaring Phase 3C done.

---

## Notes for the implementing engineer

- **`portable::data_dir()` vs absolute paths.** `recording.output_dir` may be either; `resolve_output_dir` in `songs_commands.rs` (Step 8.1) handles both. If the field is empty, `PathBuf::from("")` joined with `data_dir()` produces `data_dir()` itself — acceptable for our purposes.
- **Fixture MP3.** If `ffmpeg` is unavailable when generating the fixture in Task 4, an alternative is to copy any small `.mp3` from the Tapir recordings directory after running the app once. The fixture must be a valid MP3 that lofty can parse, with or without existing tags.
- **`SHFileOperationW` vs `IFileOperation`.** `SHFileOperationW` is the older API. It works for our needs and avoids the COM ceremony of `IFileOperation`. Both move files to the Recycle Bin equivalently when `FOF_ALLOWUNDO` is set.
- **`recording-completed` listener.** Always re-runs the full scan rather than appending the freshly recorded file — safer (covers cases where the recorder produced multiple files in the same session) and the cost is acceptable for collections of a few thousand files.
- **`SongContextMenu` mount location.** Currently the panel mounts a single menu at a time, keyed by `activeMenu`. If a user keyboard-trigger fires through the row's "Дії" button, the row sets `activeMenu` and the menu mounts as a sibling — React Aria's `MenuTrigger` then auto-opens because of the way it's wired to the trigger. If this doesn't open correctly in manual testing, follow the `StreamContextMenu` pattern (one MenuTrigger per row) which is known to work.
- **NVDA.** Screen reader running during the manual checklist is the primary accessibility check. Do not declare Phase 3C complete without an NVDA pass.

---

## Self-Review

**Spec coverage** (each spec section → tasks that implement it):

| Spec section | Task(s) |
|---|---|
| §1 Scope: scan-on-demand, tag editor, recycle bin, FRD list | 3, 4, 6, 14 |
| §3.1 Frontend `Song` type | 9 |
| §3.2 Rust `Song` struct | 1 |
| §3.3 IPC commands × 6 | 8 |
| §3.4 Events `song-tags-updated`, `song-deleted`, `song-renamed` | 8, 15 |
| §4.1 File structure | 1–8 (backend), 9–15 (frontend) |
| §4.2 Scanner details | 2, 3 |
| §4.3 Tags details | 4 |
| §4.4 Recycle Bin via SHFileOperationW | 6 |
| §4.5 walkdir + lofty + windows deps | 1 |
| §4.6 `saved_tracks` deprecation comment | 7 |
| §5.1 Frontend file structure | 9–15 |
| §5.2 Store + computeds | 9, 10 |
| §5.3 Two zones + event listeners | 12, 13, 14, 15 |
| §5.4 SongItem segments | 14 |
| §5.5 TagEditorDialog | 15 |
| §5.6 RenameDialog | 15 |
| §5.7 ConfirmDialog with default-focus-on-Cancel | 15 |
| §5.8 i18n keys | 11 |
| §6 Edge cases (empty dir, race, lofty errors, recycle fail) | scanner ignores per-file errors (3), command errors propagate as toasts (15), `delete_to_recycle_bin` returns NotFound for missing files (6) |
| §7 Accessibility (composite list, live regions, forced colors) | 13, 14, 15 + manual checklist 16 |
| §8.1–8.3 Rust + frontend unit tests | 2, 3, 4, 5, 6, 10 |
| §8.4 NVDA checklist | 16 |

**Placeholder scan:**
- No `TBD`, `TODO`, "implement later" in any step.
- "Stub" appears in Task 12 (intentional, replaced in Task 13) and Task 14 (intentional, replaced in Task 15) — both with explicit "real wiring in Task N" annotations.
- All steps that change code include the actual code blocks.
- All commands have expected outputs.

**Type consistency check:**
- `Song` struct identical in `mod.rs` (Task 1), passed through `read_song` (Task 2), `scan` (Task 3), `update_song_tags`, `rename_song`, `list_saved_songs` (Task 8), and TS `Song` (Task 9) — fields and casing (camelCase via serde) match end-to-end.
- `AudioFormat` reused from `profile.rs`, never redefined.
- `RadioError` variants (`NotFound`, `Format`, `Io`, `Other`) used consistently across `scanner.rs`, `tags.rs`, `ops.rs`.
- IPC command parameter names use Rust snake_case in `#[tauri::command]` signatures (`old_path`, `new_basename`) and Tauri auto-converts them to camelCase keys on the frontend (`oldPath`, `newBasename`) — TS wrappers in Task 9.2 use camelCase consistently.
- Event names (`song-tags-updated`, `song-deleted`, `song-renamed`) match between backend emit (Task 8) and frontend listeners (Task 15).
- Menu action enum `"play" | "explorer" | "rename" | "tags" | "delete"` matches between `SongContextMenu` (Task 15.1) and `SongsPanel` `handleMenuAction` (Task 15.4).
- `SongDeletedPayload.path: string` matches Rust `DeletedPayload { path: &str }` (camelCase identical).
- `SongRenamedPayload { oldPath, newSong }` matches Rust `RenamedPayload { old_path, new_song }` via serde rename_all.
