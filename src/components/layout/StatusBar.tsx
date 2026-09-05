import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { $statuses } from "../../stores/streams";
import { $freeSpace } from "../../stores/system";
import { $profileSettings } from "../../stores/settings";
import { formatBytes, formatDuration, isLowDiskSpace } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
}

export const StatusBar = forwardRef<ZoneEntry, Props>(({ exitZone }, ref) => {
  const announce = useAnnounce();
  const statuses = useStore($statuses);
  const freeSpace = useStore($freeSpace);
  const profileSettings = useStore($profileSettings);
  const freeLow = isLowDiskSpace(
    freeSpace,
    profileSettings?.recording.diskSpaceThresholdGb ?? 0,
  );
  const freeText = freeSpace === null ? "—" : formatBytes(freeSpace);
  const freeAria =
    freeSpace === null
      ? m.metric_free_space_unavailable()
      : freeLow
        ? m.metric_free_space_low({ space: freeText })
        : `${m.metric_free_space()}: ${freeText}`;
  const [tick, setTick] = useState(0);
  const seg0Ref = useRef<HTMLDivElement | null>(null);
  const seg1Ref = useRef<HTMLDivElement | null>(null);
  const seg2Ref = useRef<HTMLDivElement | null>(null);
  const segRefs = useMemo(() => [seg0Ref, seg1Ref, seg2Ref], []);

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

  const { onKeyDown, getTabIndex, restoreFocus, moveTo } = useRovingFocus(
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

  // Reset to seg0 when the conditional last segment (seg2) unmounts
  useEffect(() => {
    if (longestMs === 0) moveTo(0);
  }, [longestMs, moveTo]);

  useImperativeHandle(
    ref,
    (): ZoneEntry => ({
      id: "status-bar",
      focus: restoreFocusWithAnnounce,
    }),
    [restoreFocusWithAnnounce],
  );

  return (
    <footer
      data-zone-id="status-bar"
      className="flex items-center gap-4 border-t border-slate-700 px-4 py-1.5 text-sm text-slate-400 forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]"
      onKeyDown={onKeyDown}
    >
      <div role="application" aria-label={m.zone_status()} className="contents">
      <div
        ref={seg0Ref}
        tabIndex={getTabIndex(0)}
        aria-label={`${m.segment_status_duration()}: ${recordingsText}`}
        className="cursor-default rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
      >
        <strong className="text-slate-200">{recordingsText}</strong>
      </div>

      <div
        ref={seg1Ref}
        tabIndex={getTabIndex(1)}
        aria-label={freeAria}
        className={
          "cursor-default rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" +
          (freeLow ? " text-amber-300" : "")
        }
      >
        <strong className={freeLow ? "text-amber-300" : "text-slate-200"}>{freeText}</strong>
      </div>

      {longestMs > 0 && (
        <div
          ref={seg2Ref}
          tabIndex={getTabIndex(2)}
          aria-label={`${m.segment_longest_recording()}: ${formatDuration(longestMs)}`}
          className="cursor-default rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          <strong className="text-slate-200">{formatDuration(longestMs)}</strong>
        </div>
      )}
      </div>
    </footer>
  );
});
StatusBar.displayName = "StatusBar";
