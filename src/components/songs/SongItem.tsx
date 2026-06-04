import { Play, Square, FileMusic, AlertCircle } from "lucide-react";
import type { Song } from "../../types/song";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { CompositeRow, CompositeSegment, CompositeAction } from "../common/composite-list";
import { SongContextMenu, type SongAction } from "./SongContextMenu";
import { formatDuration, formatBytes, formatDate, formatDateTime } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";

export interface SongItemData {
  id: string;
  /** Segments after summary. Same set for every row — completeness no longer adds a stop. */
  segments: Exclude<SegmentKind, "summary">[];
}

export function getSongSegments(): SongItemData["segments"] {
  return ["track", "tech", "action-play", "action-menu"];
}

interface Props {
  song: Song;
  isActiveRow: boolean;
  isPlaying: boolean;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  onPlay: () => void;
  onAction: (action: SongAction) => void;
}

export function SongItem({ song, isActiveRow, isPlaying, isFocused, onPlay, onAction }: Props) {
  const baseSummary = m.songs_row_summary({
    title: song.title || song.fileName,
    artist: song.artist || "—",
    station: song.station,
    size: formatBytes(song.sizeBytes),
    date: formatDateTime(song.recordedAt), // a11y name keeps the full date + time
  });
  const summaryLabel = song.isComplete
    ? baseSummary
    : `${m.songs_incomplete_badge()}, ${baseSummary}`;

  // Line 2 tail: short, fixed-width values that must always stay visible.
  const metaTail = [
    song.durationMs > 0 ? formatDuration(song.durationMs) : null,
    formatBytes(song.sizeBytes),
    formatDate(song.recordedAt),
  ]
    .filter(Boolean)
    .join(" · ");

  // Spoken name for the metadata stop. role="group" announces only aria-label,
  // not the child text — without this the Right/Left drill-down to line 2 is
  // silent. Comma-joined for natural screen-reader pauses (visible text uses ·).
  const techLabel = [
    song.artist || "—",
    song.station,
    song.durationMs > 0 ? formatDuration(song.durationMs) : null,
    formatBytes(song.sizeBytes),
    formatDate(song.recordedAt),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <CompositeRow
      itemId={song.path}
      isFocused={isFocused}
      isActiveRow={isActiveRow}
      label={summaryLabel}
      roleDescription={m.item_role_song()}
      className="border-b border-slate-800 px-3 py-2"
      activeClassName="bg-slate-800/40"
    >
      {/* Line 1: state icon + title, with the action buttons pushed right. */}
      <div className="flex items-center gap-2">
        <CompositeSegment
          itemId={song.path}
          segment="track"
          isFocused={isFocused}
          label={song.title || song.fileName}
          className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-100"
        >
          {song.isComplete ? (
            <FileMusic size={14} aria-hidden className="flex-none text-slate-500" />
          ) : (
            <AlertCircle
              size={14}
              aria-hidden
              className="flex-none text-amber-400 forced-colors:text-[Highlight]"
            />
          )}
          <span className="truncate">{song.title || song.fileName}</span>
        </CompositeSegment>

        <div className="ml-auto flex flex-none gap-1">
          <CompositeAction
            itemId={song.path}
            segment="action-play"
            isFocused={isFocused}
            onClick={onPlay}
            label={isPlaying ? m.songs_action_stop() : m.songs_action_play()}
            ariaPressed={isPlaying}
            className="rounded p-1.5 text-slate-300 hover:bg-slate-700 forced-colors:text-[ButtonText]"
          >
            {isPlaying ? <Square size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </CompositeAction>

          <SongContextMenu song={song} menuFocused={isFocused("action-menu")} onAction={onAction} />
        </div>
      </div>

      {/* Line 2: metadata. artist·station truncate first; the tail always shows. */}
      <CompositeSegment
        itemId={song.path}
        segment="tech"
        isFocused={isFocused}
        label={techLabel}
        className="mt-1 flex items-center gap-1 text-xs text-slate-400"
      >
        <span className="min-w-0 flex-1 truncate">
          {song.artist || "—"} · {song.station}
        </span>
        <span className="flex-none whitespace-nowrap">
          {" · "}
          {metaTail}
        </span>
      </CompositeSegment>
    </CompositeRow>
  );
}
