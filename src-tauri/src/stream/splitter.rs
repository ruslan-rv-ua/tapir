use crate::stream::connection::TrackMetadata;

pub struct SplitterConfig {
    pub skip_first_incomplete_track: bool,
    pub skip_short_tracks_ms: u32,
}

pub enum SplitAction {
    /// Start writing to a new track file
    StartTrack(TrackMetadata),
    /// Finalize current track, start new one
    FinalizeAndStart {
        completed: TrackMetadata,
        new: TrackMetadata,
        duration_ms: u64,
    },
    /// Skip this segment (first incomplete or too short)
    Skip,
}

pub struct Splitter {
    config: SplitterConfig,
    current_metadata: Option<TrackMetadata>,
    is_first_track: bool,
    track_start_time: Option<std::time::Instant>,
}

impl Splitter {
    pub fn new(config: SplitterConfig) -> Self {
        Self {
            config,
            current_metadata: None,
            is_first_track: true,
            track_start_time: None,
        }
    }

    /// Called when new metadata arrives. Returns what action to take.
    pub fn on_metadata_change(&mut self, new_meta: TrackMetadata) -> SplitAction {
        // First track: skip if configured to do so
        if self.is_first_track && self.config.skip_first_incomplete_track {
            self.is_first_track = false;
            self.current_metadata = Some(new_meta);
            self.track_start_time = Some(std::time::Instant::now());
            return SplitAction::Skip;
        }

        // No current track yet (first track not skipped)
        if self.current_metadata.is_none() {
            self.current_metadata = Some(new_meta.clone());
            self.is_first_track = false;
            self.track_start_time = Some(std::time::Instant::now());
            return SplitAction::StartTrack(new_meta);
        }

        // Check if metadata has actually changed
        let changed = {
            let current = self.current_metadata.as_ref().unwrap();
            current.artist != new_meta.artist || current.title != new_meta.title
        };

        if !changed {
            return SplitAction::Skip;
        }

        // Metadata changed — compute duration
        let duration_ms = self
            .track_start_time
            .map(|t| t.elapsed().as_millis() as u64)
            .unwrap_or(0);

        if duration_ms < self.config.skip_short_tracks_ms as u64 {
            // Track too short — discard it and start fresh
            self.current_metadata = Some(new_meta.clone());
            self.track_start_time = Some(std::time::Instant::now());
            return SplitAction::Skip;
        }

        // Finalize the completed track and start the new one
        let completed = self.current_metadata.take().unwrap();
        self.current_metadata = Some(new_meta.clone());
        self.track_start_time = Some(std::time::Instant::now());
        SplitAction::FinalizeAndStart {
            completed,
            new: new_meta,
            duration_ms,
        }
    }
}
