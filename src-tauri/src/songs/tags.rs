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
    use std::path::PathBuf;
    use tempfile::tempdir;

    const FIXTURE_MP3: &[u8] = include_bytes!("../../tests/fixtures/sample.mp3");

    fn copy_fixture(dir: &Path, name: &str) -> PathBuf {
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
