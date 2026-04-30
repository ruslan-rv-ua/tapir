import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { $statuses } from "../../stores/streams";
import { formatDuration } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
}

export const StatusBar = forwardRef<ZoneEntry, Props>(({ exitZone }, ref) => {
  const announce = useAnnounce();
  const statuses = useStore($statuses);
  const [tick, setTick] = useState(0);
  const footerRef = useRef<HTMLElement | null>(null);
  const seg0Ref = useRef<HTMLDivElement | null>(null);
  const seg1Ref = useRef<HTMLDivElement | null>(null);
  const segRefs = [seg0Ref, seg1Ref];

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

  const pluralRules = new Intl.PluralRules(document.documentElement.lang || "uk");
  const pluralForm = recordingCount === 0 ? "zero" : pluralRules.select(recordingCount);
  const recordingsText =
    pluralForm === "zero" ? m.recordings_count_zero() :
    pluralForm === "one" ? m.recordings_count_one({ count: recordingCount }) :
    pluralForm === "few" ? m.recordings_count_few({ count: recordingCount }) :
    m.recordings_count_many({ count: recordingCount });

  const { onKeyDown, getTabIndex, restoreFocus } = useRovingFocus(
    segRefs,
    "horizontal",
    { mode: "composite-exit", onTabOut: exitZone },
  );

  const restoreFocusWithAnnounce = useCallback(
    (direction: "forward" | "backward") => {
      announce(m.zone_status(), "polite");
      restoreFocus(direction);
    },
    [announce, restoreFocus],
  );

  useImperativeHandle(
    ref,
    () => ({
      id: "status-bar",
      get el() {
        return footerRef.current!;
      },
      focus: restoreFocusWithAnnounce,
    }),
    [restoreFocusWithAnnounce],
  );

  return (
    <footer
      ref={footerRef}
      data-zone-id="status-bar"
      className="flex items-center gap-4 border-t border-slate-700 px-4 py-1.5 text-xs text-slate-400 forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]"
      onKeyDown={onKeyDown}
    >
      <span role="status" aria-live="polite" className="sr-only" aria-atomic="true" />

      <div
        ref={seg0Ref}
        tabIndex={getTabIndex(0)}
        aria-label={`${m.segment_status_duration()}: ${recordingsText}`}
        className="cursor-default rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
      >
        {recordingsText}
      </div>

      {longestMs > 0 && (
        <div
          ref={seg1Ref}
          tabIndex={getTabIndex(1)}
          aria-label={`${m.segment_longest_recording()}: ${formatDuration(longestMs)}`}
          className="cursor-default rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          {formatDuration(longestMs)}
        </div>
      )}
    </footer>
  );
});
StatusBar.displayName = "StatusBar";
