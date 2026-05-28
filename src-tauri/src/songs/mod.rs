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
