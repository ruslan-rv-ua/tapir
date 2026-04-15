import { atom } from "nanostores";
import type { PlayerStatus } from "../lib/tauri";

export const $playerStatus = atom<PlayerStatus>({
  state: "stopped",
  source: null,
  volume: 0.75,
  positionMs: null,
  durationMs: null,
});
