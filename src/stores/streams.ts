import { atom, computed, map } from "nanostores";
import type { StreamInfo, StreamStatus, ImportCandidate } from "../lib/tauri";
import { replaceSelection as replaceSel, pruneSelection as pruneSel } from "./selection";
import { $settings, $profileSettings } from "./settings";

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

/**
 * Streams in the active sort order (profile `ui.streamSort` — the order is a
 * property of the profile's data set, ADR 2026-08-08; the collation locale stays
 * global). Depends only on $streams and the two settings stores, so its reference
 * stays stable across live $statuses updates — that's what lets $visibleStreams
 * pass it straight through under the default "all" filter without re-notifying
 * $playbackNeighbors (and re-rendering the player) on every recording tick.
 */
const $sortedStreams = computed(
  [$streams, $settings, $profileSettings],
  (streams, settings, profileSettings) => {
    const sortBy: StreamSort = profileSettings?.ui.streamSort ?? "name";
    if (sortBy === "added") {
      return [...streams].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    }
    const collator = new Intl.Collator(settings?.language || "uk", {
      numeric: true,
      sensitivity: "base",
    });
    return [...streams].sort((a, b) => collator.compare(a.name, b.name));
  },
);

/**
 * The exact list StreamsPanel renders: the active filter chip applied to the sort
 * order (filtering preserves order). The single source of truth for "visible
 * streams" — both StreamsPanel and $playbackNeighbors read it, so prev/next
 * navigation walks the same streams, in the same order, the user sees on screen.
 * Mirrors $filteredSongs on the songs side.
 */
export const $visibleStreams = computed(
  [$sortedStreams, $streamFilter, $statuses],
  (sorted, filter, statuses) => {
    if (filter === "all") return sorted;
    const want = filter === "recording" ? "recording" : "error";
    return sorted.filter((s) => statuses[s.id]?.state === want);
  },
);

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
