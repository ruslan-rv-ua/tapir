import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { formatBitrate, formatDuration } from "../../lib/formatters";
import { StreamContextMenu } from "./StreamContextMenu";
import { AddPatternDialog } from "../wishlist/AddPatternDialog";
import { $playerStatus } from "../../stores/player";
import * as m from "../../i18n/paraglide/messages";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import { useAnnounce } from "../../hooks/useAnnounce";

export interface StreamItemData {
  id: string;
  /** Dynamic segment list — do NOT include 'summary'. */
  segments: Exclude<SegmentKind, 'summary'>[];
}

/** Compute the segment list for a stream based on its status. */
export function getStreamSegments(status: StreamStatus | undefined): StreamItemData['segments'] {
  const state = status?.state ?? "idle";
  const active = state === "recording" || state === "connecting" || state === "reconnecting";
  return active ? ["track", "tech", "status", "actions"] : ["track", "tech", "actions"];
}

interface Props {
  stream: StreamInfo;
  status: StreamStatus | undefined;
  isFocused: (segment: 'summary' | SegmentKind) => boolean;
  onPrimaryAction: () => void;
  onContextMenu: () => void;
  onDelete: () => void;
}

export function StreamItem({ stream, status, isFocused, onPrimaryAction: _onPrimaryAction, onContextMenu: _onContextMenu, onDelete }: Props) {
  const state = status?.state ?? "idle";
  const isRecording = state === "recording";
  const playerStatus = useStore($playerStatus);
  const announce = useAnnounce();
  const [patternDialog, setPatternDialog] = useState<{ listType: "wishlist" | "ignorelist"; initialPattern: string } | null>(null);
  const [, setTick] = useState(0);

  const isThisStreamPlaying =
    playerStatus.state !== "stopped" &&
    playerStatus.source?.type === "stream" &&
    playerStatus.source.streamId === stream.id;

  // Update elapsed time display while recording
  useEffect(() => {
    if (!isRecording || !status?.recordingStartedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording, status?.recordingStartedAt]);

  const elapsedMs = status?.recordingStartedAt
    ? Date.now() - new Date(status.recordingStartedAt).getTime()
    : 0;

  const handleRecordToggle = async () => {
    try {
      if (isRecording) await tauri.stopRecording(stream.id);
      else await tauri.startRecording(stream.id);
    } catch (err) { addToast(String(err), "error"); }
  };

  const handlePlayToggle = async () => {
    try {
      if (isThisStreamPlaying) await tauri.stopPlayback();
      else await tauri.playStream(stream.id);
    } catch (err) { addToast(String(err), "error"); }
  };

  // Summary label
  const statusParts: string[] = [];
  if (isRecording) statusParts.push(m.status_recording());
  if (isThisStreamPlaying) statusParts.push(m.segment_playing());
  const summaryLabel = statusParts.length > 0
    ? `${statusParts.join(", ")}, ${stream.name}`
    : stream.name;

  // Segment aria-labels
  const trackLabel = status?.currentTrack
    ? `${m.segment_track()}, ${status.currentTrack.artist} — ${status.currentTrack.title}`
    : `${m.segment_track()}, —`;

  const techLabel = `${m.segment_tech()}, ${formatBitrate(stream.bitrate)}`;

  const statusLabel =
    state === "recording"    ? `${m.segment_status_duration()}, ${formatDuration(elapsedMs)}` :
    state === "connecting"   ? `${m.segment_status()}, ${m.status_connecting()}` :
    state === "reconnecting" ? `${m.segment_status()}, ${m.status_reconnecting()}` :
    `${m.segment_status()}, ${m.status_idle()}`;

  const actionLabels = [
    isThisStreamPlaying ? m.stop_stream_playback() : m.play_stream(),
    isRecording ? m.stop_recording() : m.start_recording(),
    m.stream_context_menu(),
  ];
  const actionsLabel = `${m.segment_actions()}: ${actionLabels.join(", ")}`;

  const segments = getStreamSegments(status);

  return (
    <li
      className={`grid border-b border-slate-800 forced-colors:border-[ButtonText] ${
        isRecording
          ? "bg-red-950/30 border-l-2 border-l-red-500"
          : isThisStreamPlaying
          ? "bg-blue-950/30"
          : ""
      }`}
      style={{ gridTemplateColumns: "100px 1fr 1.5fr 90px 90px 240px" }}
    >
      {/* Summary focus point */}
      <div
        data-item-id={stream.id}
        data-segment="summary"
        tabIndex={isFocused("summary") ? 0 : -1}
        aria-label={summaryLabel}
        className="flex items-center px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
        style={{ gridRow: 1, gridColumn: 2 }}
      >
        <span className="font-medium text-slate-200 truncate">{stream.name}</span>
      </div>

      {/* Visual status dot — col 1, aria-hidden (screen readers get status from summary + status segment) */}
      <div
        aria-hidden="true"
        className="flex items-center gap-1.5 px-3 py-2 text-xs"
        style={{ gridRow: 1, gridColumn: 1 }}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full forced-colors:shadow-none ${
            state === "recording" || state === "error"
              ? "bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,.2)] forced-colors:bg-[Highlight]"
              : state === "connecting" || state === "reconnecting"
              ? "bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,.18)] forced-colors:bg-[Highlight]"
              : "bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,.15)] forced-colors:bg-[Highlight]"
          }`}
        />
        <span className="truncate text-slate-400">
          {state === "recording"    ? m.status_recording() :
           state === "connecting"   ? m.status_connecting() :
           state === "reconnecting" ? m.status_reconnecting() :
           state === "error"        ? m.status_error() :
           m.status_idle()}
        </span>
      </div>

      {segments.map((kind) => {
        if (kind === "track") return (
          <div
            key="track"
            data-item-id={stream.id}
            data-segment="track"
            tabIndex={isFocused("track") ? 0 : -1}
            aria-label={trackLabel}
            className="px-3 py-2 text-sm text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight] truncate"
            style={{ gridRow: 1, gridColumn: 3 }}
          >
            {status?.currentTrack
              ? `${status.currentTrack.artist} — ${status.currentTrack.title}`
              : "—"}
          </div>
        );

        if (kind === "tech") return (
          <div
            key="tech"
            data-item-id={stream.id}
            data-segment="tech"
            tabIndex={isFocused("tech") ? 0 : -1}
            aria-label={techLabel}
            className="px-3 py-2 text-sm text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
            style={{ gridRow: 1, gridColumn: 4 }}
          >
            {formatBitrate(stream.bitrate)}
          </div>
        );

        if (kind === "status") return (
          <div
            key="status"
            data-item-id={stream.id}
            data-segment="status"
            tabIndex={isFocused("status") ? 0 : -1}
            aria-label={statusLabel}
            className="px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
            style={{ gridRow: 1, gridColumn: 5 }}
          >
            {state === "recording"    ? formatDuration(elapsedMs) :
             state === "connecting"   ? m.status_connecting() :
             state === "reconnecting" ? m.status_reconnecting() :
             m.status_idle()}
          </div>
        );

        if (kind === "actions") return (
          <div
            key="actions"
            data-item-id={stream.id}
            data-segment="actions"
            tabIndex={isFocused("actions") ? 0 : -1}
            aria-label={actionsLabel}
            className="flex gap-1 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
            style={{ gridRow: 1, gridColumn: 6 }}
          >
            <button
              tabIndex={-1}
              onClick={handlePlayToggle}
              aria-label={isThisStreamPlaying ? m.stop_stream_playback() : m.play_stream()}
              className={`rounded px-2 py-0.5 text-xs ${isThisStreamPlaying ? "bg-blue-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"}`}
            >
              {isThisStreamPlaying ? "■" : "▶"}
            </button>
            <button
              tabIndex={-1}
              onClick={handleRecordToggle}
              aria-label={isRecording ? m.stop_recording() : m.start_recording()}
              className={`rounded px-2 py-0.5 text-xs ${isRecording ? "bg-red-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"}`}
            >
              {isRecording ? m.stop_recording() : m.start_recording()}
            </button>
            <StreamContextMenu
              stream={stream}
              status={status}
              onAddToWishlist={(track) => setPatternDialog({ listType: "wishlist", initialPattern: track })}
              onAddToIgnorelist={(track) => setPatternDialog({ listType: "ignorelist", initialPattern: track })}
              onDelete={onDelete}
            />
          </div>
        );

        return null;
      })}

      {patternDialog && createPortal(
        <AddPatternDialog
          listType={patternDialog.listType}
          initialPattern={patternDialog.initialPattern}
          onSubmit={async (pattern) => {
            try {
              if (patternDialog.listType === "wishlist") await tauri.addToWishlist(pattern);
              else await tauri.addToIgnorelist(pattern);
              announce(m.announcement_pattern_added({ pattern }), "polite");
              setPatternDialog(null);
            } catch (err) { addToast(String(err), "error"); }
          }}
          onClose={() => setPatternDialog(null)}
        />,
        document.body
      )}
    </li>
  );
}
