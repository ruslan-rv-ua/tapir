import { atom, map } from "nanostores";
import type { StreamInfo, StreamStatus, ImportCandidate } from "../lib/tauri";

export const $streams = atom<StreamInfo[]>([]);
export const $statuses = map<Record<string, StreamStatus>>({});
export const $showAddStreamDialog = atom<boolean>(false);
export const $editStream = atom<StreamInfo | null>(null);

export type StreamFilter = "all" | "recording" | "errors";
export const $streamFilter = atom<StreamFilter>("all");

export type StreamSort = "name" | "added";

// Import flow: non-null = the ImportStreamsDialog is open with these candidates.
export const $importCandidates = atom<ImportCandidate[] | null>(null);
// Export flow: true = the ExportFormatDialog is open.
export const $showExportStreamsDialog = atom<boolean>(false);

export function updateStreamStatus(streamId: string, status: Partial<StreamStatus>) {
  const current = $statuses.get()[streamId] ?? {
    streamId,
    state: "idle" as const,
    currentTrack: null,
    recordingStartedAt: null,
    bytesRecorded: 0,
    tracksRecorded: 0,
    error: null,
    reconnectAttempt: null,
    sessionId: 0,
  };
  $statuses.setKey(streamId, { ...current, ...status });
}
