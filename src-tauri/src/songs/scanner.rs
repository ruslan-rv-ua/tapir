//! Walk recordings directory, read tags via lofty, return `Song` entries.

use std::path::{Path, PathBuf};
use chrono::{DateTime, Local};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::prelude::*;

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
