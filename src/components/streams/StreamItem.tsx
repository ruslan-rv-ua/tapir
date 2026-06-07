import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw, AlertCircle, Volume2, Circle } from "lucide-react";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { CompositeRow, CompositeSegment, CompositeAction } from "../common/composite-list";
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
  segments: Exclude<SegmentKind, "summary">[];
}

/**
 * Compute the segment list (Left/Right focus-stop order) for a stream.
 * Every row exposes its three action buttons as individual stops; 'status'
 * appears only while the stream is active.
 */
export function getStreamSegments(status: StreamStatus | undefined): StreamItemData["segments"] {
  const state = status?.state ?? "idle";
  const active = state === "recording" || state === "connecting" || state === "reconnecting";
  const actions: StreamItemData["segments"] = ["action-play", "action-record", "action-menu"];
  return active ? ["track", "tech", "status", ...actions] : ["track", "tech", ...actions];
}

interface Props {
  stream: StreamInfo;
  status: StreamStatus | undefined;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  /** This row is the active item — used for a subtle context highlight. */
  isActiveRow: boolean;
  maxRetries: number;
  onDelete: () => void;
  /** Primary action on a mouse double-click of the row (record/play per setting). */
  onActivate?: () => void;
}

export function StreamItem({
  stream,
  status,
  isFocused,
  isActiveRow,
  maxRetries,
  onDelete,
  onActivate,
}: Props) {
  const state = status?.state ?? "idle";
  const isRecording = state === "recording";
  const playerStatus = useStore($playerStatus);
  const announce = useAnnounce();
  const [patternDialog, setPatternDialog] = useState<{
    listType: "wishlist" | "ignorelist";
    initialPattern: string;
  } | null>(null);
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
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  const handlePlayToggle = async () => {
    try {
      if (isThisStreamPlaying) await tauri.stopPlayback();
      else await tauri.playStream(stream.id);
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  // Summary label — uses screen-reader-friendly words, not the visual "REC".
  const stateLabel =
    isRecording && isThisStreamPlaying
      ? m.status_recording_and_playing()
      : isRecording
        ? m.status_recording_label()
        : isThisStreamPlaying
          ? m.segment_playing()
          : state === "error"
            ? m.status_error()
            : null;
  const summaryLabel = stateLabel ? `${stateLabel}, ${stream.name}` : stream.name;

  const slot1Icon =
    state === "recording" ? (
      <Circle
        size={10}
        aria-hidden
        className="fill-red-500 text-red-500 motion-safe:animate-pulse forced-colors:fill-[Highlight] forced-colors:text-[Highlight]"
      />
    ) : state === "connecting" ? (
      <Loader2 size={14} aria-hidden className="text-amber-400 motion-safe:animate-spin forced-colors:text-[Highlight]" />
    ) : state === "reconnecting" ? (
      <RefreshCw size={14} aria-hidden className="text-amber-400 motion-safe:animate-spin forced-colors:text-[Highlight]" />
    ) : state === "error" ? (
      <AlertCircle size={14} aria-hidden className="text-red-500 forced-colors:text-[Highlight]" />
    ) : null;

  const slot2Icon = isThisStreamPlaying ? (
    <Volume2 size={14} aria-hidden className="text-blue-400 forced-colors:text-[Highlight]" />
  ) : null;

  // When the stream is neither recording/connecting nor playing through us, any
  // known currentTrack is the *last* one we saw — show it dimmed + italic and
  // re-label it for screen readers.
  const isStreamActive =
    isRecording || isThisStreamPlaying || state === "connecting" || state === "reconnecting";
  const hasTrack = !!status?.currentTrack;
  const showAsLastTrack = !isStreamActive && hasTrack;
  const trackValue = status?.currentTrack
    ? `${status.currentTrack.artist} — ${status.currentTrack.title}`
    : "—";
  const trackLabel = showAsLastTrack ? m.segment_track_last({ track: trackValue }) : trackValue;
  const trackTextClass = showAsLastTrack ? "text-slate-500 italic" : "text-slate-400";

  const techValue = formatBitrate(stream.bitrate);

  const retryAttempt = status?.reconnectAttempt ?? null;
  const retryLabel =
    retryAttempt !== null && maxRetries > 0
      ? m.status_reconnecting_attempt({ attempt: retryAttempt, max: maxRetries })
      : retryAttempt !== null
        ? m.status_reconnecting_attempt_unlimited({ attempt: retryAttempt })
        : m.status_reconnecting();

  const statusValue =
    state === "recording"
      ? formatDuration(elapsedMs)
      : state === "connecting"
        ? m.status_connecting()
        : state === "reconnecting"
          ? retryLabel
          : m.status_idle();
  // Recording rows describe the value as a duration; others as stream status.
  const statusRoleDesc = state === "recording" ? m.segment_status_duration() : m.segment_status();

  const segments = getStreamSegments(status);

  // A subtle background marks the active row while focus is drilled into a segment.
  const rowBg = isRecording
    ? "bg-red-950/30 border-l-2 border-l-red-500"
    : isThisStreamPlaying
      ? "bg-blue-950/30"
      : isActiveRow
        ? "bg-slate-800/60"
        : "";

  return (
    <CompositeRow
      itemId={stream.id}
      isFocused={isFocused}
      label={summaryLabel}
      roleDescription={m.item_role_stream()}
      className={`grid border-b border-slate-800 forced-colors:border-[ButtonText] ${rowBg}`}
      style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.5fr) 90px 90px auto" }}
      onActivate={onActivate}
    >
      {/* Stream name with inline status slots — visual only; the row's accessible name is on the <li>. */}
      <div style={{ gridRow: 1, gridColumn: 1 }} className="flex items-center gap-1 min-w-0 px-3 py-2">
        <span data-slot="record" aria-hidden="true" className="w-4 h-4 flex items-center justify-center shrink-0">
          {slot1Icon}
        </span>
        <span data-slot="play" aria-hidden="true" className="w-4 h-4 flex items-center justify-center shrink-0">
          {slot2Icon}
        </span>
        <span className="font-medium text-slate-200 truncate">{stream.name}</span>
      </div>

      {segments.map((kind) => {
        if (kind === "track")
          return (
            <CompositeSegment
              key="track"
              itemId={stream.id}
              segment="track"
              isFocused={isFocused}
              label={trackLabel}
              roleDescription={m.segment_track()}
              className={`px-3 py-2 text-sm ${trackTextClass} truncate`}
              style={{ gridRow: 1, gridColumn: 2 }}
            >
              {trackValue}
            </CompositeSegment>
          );

        if (kind === "tech")
          return (
            <CompositeSegment
              key="tech"
              itemId={stream.id}
              segment="tech"
              isFocused={isFocused}
              label={techValue}
              roleDescription={m.segment_tech()}
              className="px-3 py-2 text-sm text-slate-400"
              style={{ gridRow: 1, gridColumn: 3 }}
            >
              {techValue}
            </CompositeSegment>
          );

        if (kind === "status")
          return (
            <CompositeSegment
              key="status"
              itemId={stream.id}
              segment="status"
              isFocused={isFocused}
              label={statusValue}
              roleDescription={statusRoleDesc}
              className="px-3 py-2 text-sm"
              style={{ gridRow: 1, gridColumn: 4 }}
            >
              {statusValue}
            </CompositeSegment>
          );

        return null;
      })}

      {/* Actions — each button is its own Left/Right focus stop (roving tabIndex). */}
      <div className="flex gap-1 px-3 py-2" style={{ gridRow: 1, gridColumn: 5 }}>
        <CompositeAction
          itemId={stream.id}
          segment="action-play"
          isFocused={isFocused}
          onClick={handlePlayToggle}
          label={
            isThisStreamPlaying
              ? m.stop_stream_playback_named({ name: stream.name })
              : m.play_stream_named({ name: stream.name })
          }
          className={`inline-flex min-w-[5.5rem] justify-center shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
            isThisStreamPlaying
              ? "bg-blue-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
              : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
          }`}
        >
          <span aria-hidden="true">{isThisStreamPlaying ? "■" : "►"}</span>
          <span>{isThisStreamPlaying ? m.stop() : m.play()}</span>
        </CompositeAction>
        <CompositeAction
          itemId={stream.id}
          segment="action-record"
          isFocused={isFocused}
          onClick={handleRecordToggle}
          label={
            isRecording
              ? m.stop_recording_named({ name: stream.name })
              : m.start_recording_named({ name: stream.name })
          }
          className={`inline-flex min-w-[7.5rem] justify-center shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
            isRecording
              ? "bg-red-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
              : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
          }`}
        >
          <span aria-hidden="true">{isRecording ? "⏹" : "⏺"}</span>
          <span>{isRecording ? m.stop_recording() : m.start_recording()}</span>
        </CompositeAction>
        <StreamContextMenu
          stream={stream}
          status={status}
          menuFocused={isFocused("action-menu")}
          onAddToWishlist={(track) => setPatternDialog({ listType: "wishlist", initialPattern: track })}
          onAddToIgnorelist={(track) => setPatternDialog({ listType: "ignorelist", initialPattern: track })}
          onDelete={onDelete}
        />
      </div>

      {patternDialog &&
        createPortal(
          <AddPatternDialog
            listType={patternDialog.listType}
            initialPattern={patternDialog.initialPattern}
            onSubmit={async (pattern) => {
              try {
                if (patternDialog.listType === "wishlist") await tauri.addToWishlist(pattern);
                else await tauri.addToIgnorelist(pattern);
                announce(m.announcement_pattern_added({ pattern }), "polite");
                setPatternDialog(null);
              } catch (err) {
                addToast(String(err), "error");
              }
            }}
            onClose={() => setPatternDialog(null)}
          />,
          document.body,
        )}
    </CompositeRow>
  );
}
