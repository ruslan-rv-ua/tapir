import { atom, map } from "nanostores";
import type { StreamInfo, StreamStatus, ImportCandidate } from "../lib/tauri";

export const $streams = atom<StreamInfo[]>([]);
export const $statuses = map<Record<string, StreamStatus>>({});

/**
 * Multi-select state for the streams list. The single source of truth — the
 * toolbar (StreamsPanel), the list (StreamList) and each row (StreamItem) read
 * it via useStore. Streams-specific for now; generalised to the other lists in
 * milestone D.
 */
export const $streamSelection = atom<Set<string>>(new Set());

/** Replace the whole selection with a fresh Set (new identity so useStore fires). */
export function replaceSelection(next: ReadonlySet<string>): void {
  $streamSelection.set(new Set(next));
}

/**
 * Drop selected ids that are no longer present in `existingIds`. No-op (keeps the
 * same Set identity) when nothing changed, so it can run in an effect on every
 * $streams change without spurious rerenders.
 */
export function pruneSelection(existingIds: ReadonlySet<string>): void {
  const current = $streamSelection.get();
  let changed = false;
  const next = new Set<string>();
  for (const id of current) {
    if (existingIds.has(id)) next.add(id);
    else changed = true;
  }
  if (changed) $streamSelection.set(next);
}
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
