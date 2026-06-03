import type { StationResult } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";

/**
 * Left/Right focus-stop order for a station row (Layout A: one stop per value).
 * Each metadata stop is included only when its value is present; the two action
 * stops are always present. Mirrors getStreamSegments.
 */
export function getStationSegments(station: StationResult): Exclude<SegmentKind, "summary">[] {
  const segments: Exclude<SegmentKind, "summary">[] = [];
  if (station.country) segments.push("country");
  if (station.language) segments.push("language");
  if (station.codec) segments.push("codec");
  if (station.bitrate) segments.push("bitrate"); // 0 = unknown from API
  if (station.tags) segments.push("genre");
  if (station.clickcount) segments.push("popularity"); // 0 = unknown from API
  segments.push("action-play", "action-add");
  return segments;
}
