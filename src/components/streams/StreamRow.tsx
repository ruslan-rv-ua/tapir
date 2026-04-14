import { Row, Cell, Checkbox } from "react-aria-components";
import { createPortal } from "react-dom";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import { formatBitrate, formatDuration } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";
import * as tauri from "../../lib/tauri";
import { $streams } from "../../stores/streams";
import { $editStream } from "../../stores/streams";
import { addToast } from "../../stores/toasts";
import { useState, useEffect } from "react";
import { ConfirmDialog } from "../common/ConfirmDialog";

interface Props {
  stream: StreamInfo;
  status: StreamStatus | undefined;
}

function StatusIcon({ state }: { state: string }) {
  switch (state) {
    case "recording":
      return (
        <span aria-label={m.status_recording()} className="inline-flex items-center gap-1 text-xs font-bold text-red-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
          REC
        </span>
      );
    case "connecting":
      return <span aria-label={m.status_connecting()} className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />;
    case "reconnecting":
      return <span aria-label={m.status_reconnecting()} className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />;
    case "error":
      return <span aria-label={m.status_error()} className="h-2 w-2 rounded-full bg-red-600" />;
    default:
      return <span aria-label={m.status_idle()} className="h-2 w-2 rounded-full bg-slate-600" />;
  }
}

export function StreamRow({ stream, status }: Props) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [, setTick] = useState(0);
  const state = status?.state ?? "idle";
  const isRecording = state === "recording";

  // Tick every second while recording to update the elapsed time display
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
      if (isRecording) {
        await tauri.stopRecording(stream.id);
      } else {
        await tauri.startRecording(stream.id);
      }
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  const handleDelete = async () => {
    try {
      await tauri.removeStream(stream.id);
      $streams.set($streams.get().filter((s) => s.id !== stream.id));
      addToast(m.stream_removed({ name: stream.name }), "info");
    } catch (err) {
      addToast(String(err), "error");
    }
    setShowConfirmDelete(false);
  };

  return (
    <>
      <Row id={stream.id} className="border-b border-slate-800 hover:bg-slate-800/50">
        <Cell>
          <Checkbox slot="selection" aria-label={m.select_stream({ name: stream.name })} />
        </Cell>
        <Cell>
          <StatusIcon state={state} />
        </Cell>
        <Cell className="font-medium text-slate-200">{stream.name}</Cell>
        <Cell className="text-slate-400 text-sm">
          {status?.currentTrack
            ? `${status.currentTrack.artist} — ${status.currentTrack.title}`
            : "—"}
        </Cell>
        <Cell className="text-slate-400 text-sm">{formatBitrate(stream.bitrate)}</Cell>
        <Cell className="text-slate-400 text-sm">
          {elapsedMs > 0 ? formatDuration(elapsedMs) : "—"}
        </Cell>
        <Cell>
          <div className="flex gap-1">
            <button
              onClick={handleRecordToggle}
              aria-label={isRecording ? m.stop_recording() : m.start_recording()}
              className={`rounded px-2 py-0.5 text-xs ${
                isRecording
                  ? "bg-red-700 text-white hover:bg-red-600"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {isRecording ? m.stop_recording() : m.start_recording()}
            </button>
            <button
              onClick={() => $editStream.set(stream)}
              aria-label={m.edit_stream()}
              className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
            >
              ✎
            </button>
            <button
              onClick={() => setShowConfirmDelete(true)}
              aria-label={m.remove_stream()}
              className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
            >
              ✕
            </button>
          </div>
        </Cell>
      </Row>
      {showConfirmDelete && createPortal(
        <ConfirmDialog
          title={m.remove_stream()}
          message={m.confirm_delete_stream({ name: stream.name })}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirmDelete(false)}
        />,
        document.body
      )}
    </>
  );
}
