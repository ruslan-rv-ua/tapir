import { atom, map } from "nanostores";
import type { StreamInfo, StreamStatus } from "../lib/tauri";

export const $streams = atom<StreamInfo[]>([]);
export const $statuses = map<Record<string, StreamStatus>>({});
export const $showAddStreamDialog = atom<boolean>(false);

export function updateStreamStatus(streamId: string, status: Partial<StreamStatus>) {
  const current = $statuses.get()[streamId];
  if (current) {
    $statuses.setKey(streamId, { ...current, ...status });
  } else {
    $statuses.setKey(streamId, status as StreamStatus);
  }
}
