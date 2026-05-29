import { Play, Square, FileMusic, AlertCircle } from "lucide-react";
import type { Song } from "../../types/song";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { SongContextMenu, type SongAction } from "./SongContextMenu";
import { formatDuration } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";

export interface SongItemData {
  id: string;
  /** Segments after summary. Status sits before track on incomplete files. */
  segments: Exclude<SegmentKind, "summary">[];
}

export function getSongSegments(song: Song): SongItemData["segments"] {
  const base: SongItemData["segments"] = ["track", "tech", "action-play", "action-menu"];
  return song.isComplete ? base : ["status", ...base];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
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
  const summaryLabel = m.songs_row_summary({
    title: song.title || song.fileName,
    artist: song.artist || "—",
    station: song.station,
    size: formatSize(song.sizeBytes),
    date: formatDate(song.recordedAt),
  });

  return (
    <li
      role="listitem"
      data-item-id={song.path}
      data-segment="summary"
      aria-label={summaryLabel}
      tabIndex={isFocused("summary") ? 0 : -1}
      className={[
        "flex items-center gap-3 border-b border-slate-800 px-3 py-2 outline-none",
        "focus-visible:ring-2 focus-visible:ring-blue-400",
        isActiveRow ? "bg-slate-800/40" : "",
      ].join(" ")}
    >
      {!song.isComplete && (
        <span
          tabIndex={isFocused("status") ? 0 : -1}
          data-item-id={song.path}
          data-segment="status"
          aria-label={m.songs_incomplete_badge()}
          className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Mark] forced-colors:text-[MarkText]"
        >
          <AlertCircle size={12} aria-hidden /> {m.songs_incomplete_badge()}
        </span>
      )}

      <span
        tabIndex={isFocused("track") ? 0 : -1}
        data-item-id={song.path}
        data-segment="track"
        aria-label={song.title || song.fileName}
        className="flex flex-1 min-w-0 items-center gap-2 truncate text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <FileMusic size={14} aria-hidden className="flex-none text-slate-500" />
        <span className="truncate">{song.title || song.fileName}</span>
      </span>

      <span
        tabIndex={isFocused("tech") ? 0 : -1}
        data-item-id={song.path}
        data-segment="tech"
        className="min-w-0 flex-1 truncate text-xs text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {song.artist} · {song.station}{song.durationMs > 0 ? ` · ${formatDuration(song.durationMs)}` : ""}
      </span>

      <button
        type="button"
        onClick={onPlay}
        data-item-id={song.path}
        data-segment="action-play"
        tabIndex={isFocused("action-play") ? 0 : -1}
        aria-label={isPlaying ? m.songs_action_stop() : m.songs_action_play()}
        aria-pressed={isPlaying}
        className="rounded p-1.5 text-slate-300 outline-none hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText]"
      >
        {isPlaying ? <Square size={16} aria-hidden /> : <Play size={16} aria-hidden />}
      </button>

      <SongContextMenu
        song={song}
        menuFocused={isFocused("action-menu")}
        onAction={onAction}
      />
    </li>
  );
}
