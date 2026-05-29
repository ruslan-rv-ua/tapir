import { Play, FileMusic, MoreHorizontal, AlertCircle } from "lucide-react";
import type { Song } from "../../types/song";
import type { SegmentKind } from "../../hooks/useCompositeList";
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

function formatMB(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1);
}

function formatDate(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

interface Props {
  song: Song;
  isActiveRow: boolean;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  onPlay: () => void;
  onContextMenu: () => void;
}

export function SongItem({ song, isActiveRow, isFocused, onPlay, onContextMenu }: Props) {
  const summaryLabel = m.songs_row_summary({
    title: song.title || song.fileName,
    artist: song.artist || "—",
    station: song.station,
    sizeMb: formatMB(song.sizeBytes),
    date: formatDate(song.recordedAt),
  });

  return (
    <li
      role="listitem"
      data-item-id={song.path}
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
          aria-label={m.songs_incomplete_badge()}
          className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Mark] forced-colors:text-[MarkText]"
        >
          <AlertCircle size={12} aria-hidden /> {m.songs_incomplete_badge()}
        </span>
      )}

      <span
        tabIndex={isFocused("track") ? 0 : -1}
        aria-label={song.title || song.fileName}
        className="flex flex-1 min-w-0 items-center gap-2 truncate text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <FileMusic size={14} aria-hidden className="flex-none text-slate-500" />
        <span className="truncate">{song.title || song.fileName}</span>
      </span>

      <span
        tabIndex={isFocused("tech") ? 0 : -1}
        aria-label={`${song.artist || "—"} · ${song.album || "—"} · ${song.format} · ${formatMB(song.sizeBytes)} МБ`}
        className="hidden min-w-0 flex-1 truncate text-xs text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 md:block"
      >
        {song.artist} · {song.station}
      </span>

      <button
        type="button"
        onClick={onPlay}
        tabIndex={isFocused("action-play") ? 0 : -1}
        aria-label={m.songs_action_play()}
        className="rounded p-1.5 text-slate-300 outline-none hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText]"
      >
        <Play size={16} aria-hidden />
      </button>

      <button
        type="button"
        onClick={onContextMenu}
        data-context-menu-trigger
        data-item-id={song.path}
        tabIndex={isFocused("action-menu") ? 0 : -1}
        aria-label={m.songs_action_menu()}
        className="rounded p-1.5 text-slate-300 outline-none hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText]"
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
    </li>
  );
}
