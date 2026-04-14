use crate::errors::RadioError;
use crate::profile::AudioFormat;
use lofty::config::WriteOptions;
use lofty::prelude::*;
use lofty::tag::{Tag, TagType};
use std::path::Path;

pub fn write_tags(
    path: &Path,
    format: &AudioFormat,
    artist: &str,
    title: &str,
    album: &str,
    station: &str,
) -> Result<(), RadioError> {
    let tag_type = match format {
        AudioFormat::Mp3 => TagType::Id3v2,
        AudioFormat::Aac => TagType::Mp4Ilst,
    };

    let mut tag = Tag::new(tag_type);
    tag.set_artist(artist.to_string());
    tag.set_title(title.to_string());
    if !album.is_empty() {
        tag.set_album(album.to_string());
    }
    tag.set_comment(format!("Recorded from: {}", station));

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| RadioError::Format(format!("Failed to write tags: {}", e)))?;

    Ok(())
}
