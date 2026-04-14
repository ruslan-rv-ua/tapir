use crate::errors::RadioError;
use crate::profile::{AudioFormat, RecordingSettings};
use crate::sanitize;
use crate::tags;
use std::path::PathBuf;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

pub struct Recorder {
    stream_file: Option<File>,
    stream_file_path: Option<PathBuf>,
    track_file: Option<File>,
    track_incomplete_path: Option<PathBuf>,
    track_final_path: Option<PathBuf>,
    output_dir: PathBuf,
    settings: RecordingSettings,
    format: AudioFormat,
    station_name: String,
    track_number: u32,
}

impl Recorder {
    pub fn new(
        output_dir: PathBuf,
        settings: RecordingSettings,
        format: AudioFormat,
        station_name: String,
    ) -> Self {
        Self {
            stream_file: None,
            stream_file_path: None,
            track_file: None,
            track_incomplete_path: None,
            track_final_path: None,
            output_dir,
            settings,
            format,
            station_name,
            track_number: 0,
        }
    }

    /// Write bytes to the stream file and/or track file, whichever are open.
    pub async fn write_bytes(&mut self, bytes: &[u8]) -> Result<(), RadioError> {
        if let Some(ref mut f) = self.stream_file {
            f.write_all(bytes).await?;
        }
        if let Some(ref mut f) = self.track_file {
            f.write_all(bytes).await?;
        }
        Ok(())
    }

    /// Begin recording a new track. Opens the incomplete file.
    pub async fn start_track(&mut self, artist: &str, title: &str) -> Result<(), RadioError> {
        self.track_number += 1;

        let ext = audio_format_ext(&self.format);

        // Build incomplete path using the incomplete template
        let incomplete_path = sanitize::build_track_path(
            &self.output_dir,
            &self.settings.incomplete_file_name_template.clone(),
            artist,
            title,
            &self.station_name.clone(),
            self.track_number,
            self.settings.auto_correct_case,
            ext,
        );

        // Resolve collision on incomplete path
        let incomplete_path = sanitize::resolve_collision(&incomplete_path);

        // Create parent directories
        if let Some(parent) = incomplete_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        // Open / create the file
        let file = File::create(&incomplete_path).await?;

        // Also compute final path using the regular template (no collision yet — applied at finalize)
        let final_path = sanitize::build_track_path(
            &self.output_dir,
            &self.settings.file_name_template.clone(),
            artist,
            title,
            &self.station_name.clone(),
            self.track_number,
            self.settings.auto_correct_case,
            ext,
        );

        self.track_incomplete_path = Some(incomplete_path);
        self.track_final_path = Some(final_path);
        self.track_file = Some(file);

        Ok(())
    }

    /// Finalize the current track: flush, rename incomplete → final, write tags.
    /// Returns the final path if the track was kept, or None if it was discarded.
    pub async fn finalize_track(
        &mut self,
        artist: &str,
        title: &str,
        duration_ms: u64,
    ) -> Result<Option<PathBuf>, RadioError> {
        if self.track_file.is_none() {
            return Ok(None);
        }

        // Take paths first so we can clean up on error
        let incomplete_path = self.track_incomplete_path.take();
        let final_path = self.track_final_path.take();

        // Flush and close the track file
        if let Some(mut f) = self.track_file.take() {
            if let Err(e) = f.flush().await {
                // Clean up the incomplete file before propagating
                if let Some(ref path) = incomplete_path {
                    let _ = tokio::fs::remove_file(path).await;
                }
                return Err(e.into());
            }
            // File dropped (closed) here
        }

        if duration_ms < self.settings.skip_short_tracks_ms as u64 {
            // Too short — delete the incomplete file
            if let Some(path) = &incomplete_path {
                if path.exists() {
                    tokio::fs::remove_file(path).await?;
                }
            }
            return Ok(None);
        }

        let incomplete_path = match incomplete_path {
            Some(p) => p,
            None => return Ok(None),
        };

        // Resolve collision on the final path before renaming
        let final_path = match final_path {
            Some(p) => sanitize::resolve_collision(&p),
            None => return Ok(None),
        };

        // Create parent dirs for final path (may differ from incomplete)
        if let Some(parent) = final_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        // Rename incomplete → final
        tokio::fs::rename(&incomplete_path, &final_path).await?;

        // Write tags (non-fatal: renamed file is still valid audio)
        let _ = tags::writer::write_tags(
            &final_path,
            &self.format,
            artist,
            title,
            "",
            &self.station_name,
        );

        Ok(Some(final_path))
    }

    /// Open the continuous stream file (only if save_stream_file is set).
    pub async fn open_stream_file(&mut self, station: &str, date: &str) -> Result<(), RadioError> {
        if !self.settings.save_stream_file {
            return Ok(());
        }

        let ext = audio_format_ext(&self.format);
        // Use stream_file_name_template; %d in template will be replaced by render_template
        // We pass empty artist/title; the date is baked in via chrono inside render_template.
        // To pass a specific date string we use the template as-is — the sanitize module's
        // render_template reads chrono::Local::now() internally, so `date` here is informational
        // only for the caller. We still use track_number=0 and auto_correct=false for stream files.
        let _ = date; // date is rendered inside render_template via chrono

        let path = sanitize::build_track_path(
            &self.output_dir,
            &self.settings.stream_file_name_template.clone(),
            "",
            "",
            station,
            0,
            false,
            ext,
        );

        let path = sanitize::resolve_collision(&path);

        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let file = File::create(&path).await?;
        self.stream_file = Some(file);
        self.stream_file_path = Some(path);

        Ok(())
    }

    /// Close all open files, optionally deleting the stream file.
    pub async fn close(&mut self) -> Result<(), RadioError> {
        // Flush and close track file
        if let Some(mut f) = self.track_file.take() {
            let _ = f.flush().await; // best-effort flush
        }
        // Delete the incomplete file if one exists
        if let Some(path) = self.track_incomplete_path.take() {
            if path.exists() {
                let _ = tokio::fs::remove_file(&path).await;
            }
        }
        self.track_final_path = None;

        if self.settings.delete_stream_file_on_stop {
            // Drop the file handle first before deleting (required on Windows)
            self.stream_file = None;
            if let Some(path) = self.stream_file_path.take() {
                if path.exists() {
                    tokio::fs::remove_file(&path).await?;
                }
            }
        } else {
            if let Some(mut f) = self.stream_file.take() {
                f.flush().await?;
            }
            self.stream_file_path = None;
        }

        Ok(())
    }
}

fn audio_format_ext(format: &AudioFormat) -> &'static str {
    match format {
        AudioFormat::Mp3 => "mp3",
        AudioFormat::Aac => "aac",
    }
}
