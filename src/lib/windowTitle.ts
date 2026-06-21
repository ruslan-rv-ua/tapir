import type { PlaybackSource, StreamStatus } from "./tauri";

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
    case "stream": {
      const track = statuses[source.streamId]?.currentTrack;
      if (track?.artist || track?.title) {
        return [track.artist, track.title].filter(Boolean).join(" — ");
      }
      return null;
    }
    case "file":
      return fileStem(source.path) || null;
    case "preview":
      return source.name || null;
  }
}
