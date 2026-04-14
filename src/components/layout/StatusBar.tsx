import { useStore } from "@nanostores/react";
import { useState, useEffect } from "react";
import { $statuses } from "../../stores/streams";
import { formatDuration } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";

export function StatusBar() {
  const statuses = useStore($statuses);
  const [tick, setTick] = useState(0);

  const activeStatuses = Object.values(statuses).filter((s) => s.state === "recording");
  const recordingCount = activeStatuses.length;

  // Update every second when actively recording
  useEffect(() => {
    if (recordingCount === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [recordingCount]);

  const longestMs = activeStatuses.reduce((max, s) => {
    if (!s.recordingStartedAt) return max;
    const elapsed = Date.now() - new Date(s.recordingStartedAt).getTime();
    return Math.max(max, elapsed);
  }, 0);

  // suppress unused warning — tick is used to trigger re-render
  void tick;

  return (
    <footer
      role="status"
      aria-live="polite"
      className="flex items-center gap-4 border-t border-slate-700 px-4 py-1.5 text-xs text-slate-400"
    >
      <span>{m.recordings_count({ count: recordingCount })}</span>
      {longestMs > 0 && <span>{formatDuration(longestMs)}</span>}
    </footer>
  );
}
