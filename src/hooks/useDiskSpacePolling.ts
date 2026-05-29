import { useEffect } from "react";
import { getFreeSpace } from "../lib/tauri";
import { $freeSpace } from "../stores/system";

const POLL_INTERVAL_MS = 30_000;

/** Polls free disk space into the $freeSpace store on mount and every 30s. */
export function useDiskSpacePolling(): void {
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      getFreeSpace()
        .then((bytes) => {
          if (!cancelled) $freeSpace.set(bytes);
        })
        .catch(() => {
          if (!cancelled) $freeSpace.set(null);
        });
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
}
