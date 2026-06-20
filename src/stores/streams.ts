import { atom, map } from "nanostores";
import type { StreamInfo, StreamStatus, ImportCandidate } from "../lib/tauri";
import { replaceSelection as replaceSel, pruneSelection as pruneSel } from "./selection";

export const $streams = atom<StreamInfo[]>([]);
export const $statuses = map<Record<string, StreamStatus>>({});

/**
 * Multi-select state for the streams list. The single source of truth — the
 * toolbar (StreamsPanel), the list (StreamList) and each row (StreamItem) read
 * it via useStore. Streams-specific for now; generalised to the other lists in
 * milestone D.
 */
export const $streamSelection = atom<Set<string>>(new Set());

/** Replace the whole selection. Thin wrapper over the generic helper. */
export function replaceSelection(next: ReadonlySet<string>): void {
  replaceSel($streamSelection, next);
}

/** Prune vanished ids from the streams selection. Thin wrapper. */
export function pruneSelection(existingIds: ReadonlySet<string>): void {
  pruneSel($streamSelection, existingIds);
}

export const $showAddStreamDialog = atom<boolean>(false);
export const $editStream = atom<StreamInfo | null>(null);

export type StreamFilter = "all" | "recording" | "errors";
export const $streamFilter = atom<StreamFilter>("all");

export type StreamSort = "name" | "added";

// Import flow: non-null = the ImportStreamsDialog is open with these candidates.
export const $importCandidates = atom<ImportCandidate[] | null>(null);
// Export flow: non-null = the ExportFormatDialog is open. `ids: null` = whole
// profile; `ids: string[]` = the selected subset (snapshot taken at click).
export type ExportRequest = { ids: string[] | null };
export const $exportStreamsRequest = atom<ExportRequest | null>(null);

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
