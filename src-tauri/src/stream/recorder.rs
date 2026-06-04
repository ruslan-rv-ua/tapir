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
    /// Metadata of the in-progress track, kept so close() can tag a track that
    /// is stopped mid-recording and preserved as an `_incomplete` file.
    track_artist: String,
    track_title: String,
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
            track_artist: String::new(),
            track_title: String::new(),
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
    /// Returns the incomplete file name on success.
    pub async fn start_track(&mut self, artist: &str, title: &str) -> Result<String, RadioError> {
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

        self.track_incomplete_path = Some(incomplete_path.clone());
        self.track_final_path = Some(final_path);
        self.track_file = Some(file);
        self.track_artist = artist.to_string();
        self.track_title = title.to_string();

        let file_name = incomplete_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        Ok(file_name)
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
    ///
    /// A track that is still being recorded when the stream stops (user stop,
    /// EOF, or read error) is *kept* on disk under its `_incomplete` name rather
    /// than discarded — see PRD §5.2. Returns the preserved incomplete path, if
    /// any, so callers can react to it.
    pub async fn close(&mut self) -> Result<Option<PathBuf>, RadioError> {
        // Flush and close the track file (drop the handle so tags can be written).
        if let Some(mut f) = self.track_file.take() {
            let _ = f.flush().await; // best-effort flush
        }
        // Preserve the in-progress track as an `_incomplete` file instead of
        // deleting it. The file is already named with the incomplete template.
        // (incomplete_path is only ever Some while a track file was open.)
        let kept_incomplete = self.track_incomplete_path.take();
        if let Some(ref path) = kept_incomplete {
            // Tag the partial file (non-fatal: it is still valid audio).
            let _ = tags::writer::write_tags(
                path,
                &self.format,
                &self.track_artist,
                &self.track_title,
                "",
                &self.station_name,
            );
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

        Ok(kept_incomplete)
    }
}

fn audio_format_ext(format: &AudioFormat) -> &'static str {
    match format {
        AudioFormat::Mp3 => "mp3",
        AudioFormat::Aac => "aac",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn test_settings() -> RecordingSettings {
        // Keep files flat in the output dir (no `%s\` subfolder) for easy assertions.
        RecordingSettings {
            file_name_template: "%a - %t".to_string(),
            incomplete_file_name_template: "%a - %t_incomplete".to_string(),
            save_stream_file: false,
            skip_short_tracks_ms: 0,
            auto_correct_case: false,
            ..RecordingSettings::default()
        }
    }

    fn count_files_ending_with(dir: &std::path::Path, suffix: &str) -> usize {
        std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(suffix))
            .count()
    }

    // Regression: stopping mid-track must NOT delete the in-progress recording.
    // PRD §5.2 — incomplete tracks are kept on disk with the `_incomplete`
    // suffix and are not removed automatically. Previously close() deleted them.
    #[tokio::test]
    async fn close_keeps_in_progress_incomplete_track() {
        let dir = tempdir().unwrap();
        let mut rec = Recorder::new(
            dir.path().to_path_buf(),
            test_settings(),
            AudioFormat::Mp3,
            "TestRadio".to_string(),
        );

        rec.start_track("Tycho", "A Walk").await.unwrap();
        rec.write_bytes(b"some audio bytes").await.unwrap();

        let kept = rec.close().await.unwrap();

        let kept = kept.expect("close() must report the preserved incomplete path");
        assert!(kept.exists(), "the reported incomplete file must exist on disk");
        assert!(kept.to_string_lossy().ends_with("_incomplete.mp3"));
        assert_eq!(
            count_files_ending_with(dir.path(), "_incomplete.mp3"),
            1,
            "the in-progress track must be preserved as an _incomplete file on stop"
        );
    }

    #[tokio::test]
    async fn close_with_no_active_track_succeeds() {
        let dir = tempdir().unwrap();
        let mut rec = Recorder::new(
            dir.path().to_path_buf(),
            test_settings(),
            AudioFormat::Mp3,
            "TestRadio".to_string(),
        );

        // No start_track called — closing must be a no-op, not an error.
        rec.close().await.unwrap();
        assert_eq!(count_files_ending_with(dir.path(), ".mp3"), 0);
    }

    // Normal split path is unchanged: a completed track is renamed
    // incomplete → final and the _incomplete file no longer exists.
    #[tokio::test]
    async fn finalize_track_renames_incomplete_to_final() {
        let dir = tempdir().unwrap();
        let mut rec = Recorder::new(
            dir.path().to_path_buf(),
            test_settings(),
            AudioFormat::Mp3,
            "TestRadio".to_string(),
        );

        rec.start_track("Tycho", "A Walk").await.unwrap();
        rec.write_bytes(b"some audio bytes").await.unwrap();
        let final_path = rec
            .finalize_track("Tycho", "A Walk", 60_000)
            .await
            .unwrap();

        assert!(final_path.is_some(), "track above min duration must be kept");
        assert_eq!(count_files_ending_with(dir.path(), "_incomplete.mp3"), 0);
        assert_eq!(count_files_ending_with(dir.path(), "A Walk.mp3"), 1);
    }
}
