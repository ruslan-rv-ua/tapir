import { atom, map } from "nanostores";
import type { StreamInfo, StreamStatus } from "../lib/tauri";

export const $streams = atom<StreamInfo[]>([]);
export const $statuses = map<Record<string, StreamStatus>>({});
export const $showAddStreamDialog = atom<boolean>(false);
export const $editStream = atom<StreamInfo | null>(null);

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
  };
  $statuses.setKey(streamId, { ...current, ...status });
}
