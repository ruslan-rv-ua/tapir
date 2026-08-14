import type { PlaybackSource, StreamStatus } from "./tauri";
import { trackLabel } from "./playbackAnnounce";

/** Strip directory and extension from a file path (either path separator). */
function fileStem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.\w+$/, "");
}

/**
 * The track label to show in the window title for the current playback source,
 * or null when there is nothing meaningful to show (caller falls back to the
 * bare app title).
 * - stream:  "Artist — Title" from the stream's current track (null if unknown).
 * - file:    the file name without directory or extension.
 * - preview: the preview's name.
 */
export function windowTitleLabel(
  source: PlaybackSource | null,
  statuses: Record<string, StreamStatus>,
): string | null {
  if (!source) return null;
  switch (source.type) {
    // Same fact as the F9 announce, so the same renderer — the two must not
    // drift into different punctuation for the same track.
    case "stream":
      return trackLabel(statuses[source.streamId]?.currentTrack);
    case "file":
      return fileStem(source.path) || null;
    case "preview":
      return source.name || null;
  }
}
