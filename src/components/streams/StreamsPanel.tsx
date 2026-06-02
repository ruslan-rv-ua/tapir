import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $streams, $statuses, $showAddStreamDialog, $streamFilter, type StreamFilter } from "../../stores/streams";
import { $settings } from "../../stores/settings";
import { $freeSpace } from "../../stores/system";
import { FreeSpaceMetric } from "./FreeSpaceMetric";
import { StreamList } from "./StreamList";
import { AddStreamDialog } from "./AddStreamDialog";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { ScreenZone } from "../layout/ScreenZone";
import { ScreenHeader } from "../layout/ScreenHeader";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

const FILTER_CHIPS = [
  { id: "all",       labelFn: () => m.filter_all() },
  { id: "recording", labelFn: () => m.filter_recording() },
  { id: "errors",    labelFn: () => m.filter_errors() },
] as const satisfies ReadonlyArray<{ id: StreamFilter; labelFn: () => string }>;

export function StreamsPanel({ onZonesChange, exitZone }: Props) {
  const streams = useStore($streams);
  const statuses = useStore($statuses);
  const settings = useStore($settings);
  const freeSpace = useStore($freeSpace);
  const isEmpty = streams.length === 0;

  // ── Metrics ──────────────────────────────────────────────
  const streamIds = useMemo(() => new Set(streams.map(s => s.id)), [streams]);
  const visibleStatuses = useMemo(
    () => Object.entries(statuses)
      .filter(([id]) => streamIds.has(id))
      .map(([, s]) => s),
    [statuses, streamIds],
  );
  const activeCount = visibleStatuses.filter(s => s.state === "recording").length;
  const errorCount  = visibleStatuses.filter(s => s.state === "error").length;

  const pluralRules = useMemo(
    () => new Intl.PluralRules(settings?.language || document.documentElement.lang || "uk"),
    [settings?.language],
  );
  const pluralize = useCallback(
    (
      count: number,
      zero: () => string,
      one:  (p: { count: number }) => string,
      few:  (p: { count: number }) => string,
      many: (p: { count: number }) => string,
    ) => {
      if (count === 0) return zero();
      const form = pluralRules.select(count);
      if (form === "one") return one({ count });
      if (form === "few") return few({ count });
      return many({ count });
    },
    [pluralRules],
  );

  const streamCountText = pluralize(
    streams.length,
    m.streams_count_zero,
    m.streams_count_one,
    m.streams_count_few,
    m.streams_count_many,
  );
  const activeRecText = pluralize(
    activeCount,
    m.active_recordings_zero,
    m.active_recordings_one,
    m.active_recordings_few,
    m.active_recordings_many,
  );
  const errorText = pluralize(
    errorCount,
    m.errors_count_zero,
    m.errors_count_one,
    m.errors_count_few,
    m.errors_count_many,
  );

  // ── Filter chip state ─────────────────────────────────────
  const activeChip = useStore($streamFilter);
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const announce = useAnnounce();

  // Pluralized "Фільтр «X»: N потоків" used both for the live announcement
  // when a chip is activated and the empty-filter status line.
  const filterAnnouncement = useCallback(
    (chipId: StreamFilter, count: number) => {
      const chip = FILTER_CHIPS.find(c => c.id === chipId);
      const label = chip ? chip.labelFn() : "";
      return pluralize(
        count,
        () => m.streams_filter_changed_zero({ label }),
        ({ count }) => m.streams_filter_changed_one({ label, count }),
        ({ count }) => m.streams_filter_changed_few({ label, count }),
        ({ count }) => m.streams_filter_changed_many({ label, count }),
      );
    },
    [pluralize],
  );

  const filteredStreams = useMemo(() => {
    if (activeChip === "all") return streams;
    if (activeChip === "recording")
      return streams.filter(s => statuses[s.id]?.state === "recording");
    return streams.filter(s => statuses[s.id]?.state === "error");
  }, [streams, statuses, activeChip]);

  const filterHidesAll = !isEmpty && filteredStreams.length === 0;

  const handleChipClick = (chipId: StreamFilter) => {
    if (chipId === activeChip) return;
    $streamFilter.set(chipId);
    const count = chipId === "all"
      ? streams.length
      : chipId === "recording"
      ? streams.filter(s => statuses[s.id]?.state === "recording").length
      : streams.filter(s => statuses[s.id]?.state === "error").length;
    announce(filterAnnouncement(chipId, count), "polite");
  };

  // ── Toolbar zone refs (6 items) ──────────────────────────
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const addBtn     = useRef<HTMLButtonElement | null>(null);
  const stopAllBtn = useRef<HTMLButtonElement | null>(null);
  const chip0Ref   = useRef<HTMLButtonElement | null>(null);
  const chip1Ref   = useRef<HTMLButtonElement | null>(null);
  const chip2Ref   = useRef<HTMLButtonElement | null>(null);
  const chipRefs = useMemo(() => [chip0Ref, chip1Ref, chip2Ref], []);
  const toolbarRefs = useMemo(
    () => [addBtn, stopAllBtn, chip0Ref, chip1Ref, chip2Ref],
    [],
  );

  const {
    onKeyDown: toolbarKeyDown,
    getTabIndex: toolbarTabIndex,
    restoreFocus: toolbarRestore,
  } = useRovingFocus(toolbarRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("streams-toolbar", forward),
  });

  // ── List zone ────────────────────────────────────────────
  const streamListRef = useRef<ZoneEntry | null>(null);
  const streamListCallbackRef = useCallback((zone: ZoneEntry | null) => {
    streamListRef.current = zone;
  }, []);

  // ── Empty-state zone ─────────────────────────────────────
  const emptyZoneRef      = useRef<HTMLDivElement | null>(null);
  const emptyCtaRef       = useRef<HTMLButtonElement | null>(null);
  const emptyBtns = useMemo(() => [emptyCtaRef], []);
  const { onKeyDown: emptyKeyDown, getTabIndex: emptyTabIndex } =
    useRovingFocus(emptyBtns, "horizontal", {
      mode: "composite-exit",
      onTabOut: (forward) => exitZone("streams-empty", forward),
    });

  // ── Filter-empty zone (streams exist but filter hides them) ─────
  const filterEmptyZoneRef = useRef<HTMLDivElement | null>(null);
  const resetFilterBtnRef  = useRef<HTMLButtonElement | null>(null);

  const handleResetFilter = () => {
    $streamFilter.set("all");
    announce(filterAnnouncement("all", streams.length), "polite");
  };

  // ── Zone registration ────────────────────────────────────
  useEffect(() => {
    if (isEmpty) {
      const emptyZone: ZoneEntry = {
        id: "streams-empty",
        get el() { return emptyZoneRef.current!; },
        focus: () => emptyCtaRef.current?.focus(),
      };
      onZonesChange([emptyZone]);
    } else {
      const toolbarZone: ZoneEntry = {
        id: "streams-toolbar",
        get el() { return toolbarZoneRef.current!; },
        focus: toolbarRestore,
      };
      const zones: ZoneEntry[] = [toolbarZone];
      if (filterHidesAll) {
        zones.push({
          id: "streams-filter-empty",
          get el() { return filterEmptyZoneRef.current!; },
          focus: () => resetFilterBtnRef.current?.focus(),
        });
      } else if (streamListRef.current) {
        zones.push(streamListRef.current);
      }
      onZonesChange(zones);
    }
  // onZonesChange intentionally omitted — callers must pass a stable reference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, filterHidesAll, toolbarRestore]);

  const doStopAll = async () => {
    try { await tauri.stopAllRecordings(); }
    catch (err) { addToast(String(err), "error"); }
  };
  const handleStopAll = () => {
    if (activeCount === 0) return;
    if (activeCount > 1) setConfirmStopAll(true);
    else doStopAll();
  };

  const emptyDescId = "streams-empty-desc";

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.streams_section()}>
      {isEmpty ? (
        /* ── Empty state ── */
        <div
          ref={emptyZoneRef}
          data-zone-id="streams-empty"
          className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-400"
          onKeyDown={emptyKeyDown}
        >
          <span id={emptyDescId} className="sr-only">{m.streams_empty_description()}</span>
          <button
            ref={emptyCtaRef}
            tabIndex={emptyTabIndex(0)}
            aria-describedby={emptyDescId}
            onClick={() => $showAddStreamDialog.set(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
          >
            {m.add_stream()}
          </button>
        </div>
      ) : (
        <>
          {/* ── Metrics bar ── */}
          <div className="grid grid-cols-4 gap-3 border-b border-slate-700 px-4 py-4 forced-colors:border-[ButtonText]">
            <div
              role="status"
              aria-atomic="true"
              aria-label={`${m.metric_streams_in_profile()}: ${streamCountText}`}
              className="flex flex-col gap-1.5 rounded-2xl border border-white/[.06] bg-white/[.04] p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]"
            >
              <strong className="text-sm text-slate-100">{streamCountText}</strong>
              <span className="text-xs text-slate-400">{m.metric_streams_in_profile()}</span>
            </div>
            <div
              role="status"
              aria-atomic="true"
              aria-label={`${m.metric_active_recordings()}: ${activeRecText}`}
              className="flex flex-col gap-1.5 rounded-2xl border border-white/[.06] bg-white/[.04] p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]"
            >
              <strong className="text-sm text-slate-100">{activeRecText}</strong>
              <span className="text-xs text-slate-400">{m.metric_active_recordings()}</span>
            </div>
            <div
              role="status"
              aria-atomic="true"
              aria-label={`${m.metric_errors()}: ${errorText}`}
              className="flex flex-col gap-1.5 rounded-2xl border border-white/[.06] bg-white/[.04] p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]"
            >
              <strong className="text-sm text-slate-100">{errorText}</strong>
              <span className="text-xs text-slate-400">{m.metric_errors()}</span>
            </div>
            <FreeSpaceMetric
              freeBytes={freeSpace}
              thresholdGb={settings?.diskSpaceThresholdGb ?? 0}
            />
          </div>

          {/* ── Workspace titlebar + Toolbar = streams-toolbar zone ── */}
          {/* IMPORTANT: Both rows must live inside ScreenZone so mixed-boundary-handoff
              sees all 5 interactive items (indices 0–4). The heading is structural, not focusable. */}
          <ScreenZone
            ref={toolbarZoneRef}
            id="streams-toolbar"
            role="application"
            label={m.zone_streams_actions()}
            onKeyDown={toolbarKeyDown}
          >
            {/* Row 1: Title + Додати (Index 0) */}
            <ScreenHeader title={m.streams_section()}>
              <button
                ref={addBtn}
                tabIndex={toolbarTabIndex(0)}
                onClick={() => $showAddStreamDialog.set(true)}
                className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
              >
                {m.add_stream()}
              </button>
            </ScreenHeader>

            {/* Row 2: Зупинити все + Chips */}
            <div className="flex items-center gap-2 px-4 py-2">
              {/* Index 1: Зупинити все */}
              <button
                ref={stopAllBtn}
                tabIndex={toolbarTabIndex(1)}
                onClick={handleStopAll}
                disabled={activeCount === 0}
                className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                {m.stop_all()}
              </button>

              <div className="mx-1 h-4 w-px bg-slate-700 forced-colors:bg-[ButtonText]" aria-hidden="true" />

              {/* Indices 2–4: Filter chips — semantic group, toggle chips kept */}
              <div role="group" aria-label={m.streams_filter_group()} className="flex items-center gap-2">
                {FILTER_CHIPS.map((chip, i) => {
                  const count = chip.id === "recording" ? activeCount
                              : chip.id === "errors"    ? errorCount
                              : streams.length;
                  return (
                    <button
                      key={chip.id}
                      ref={chipRefs[i]}
                      tabIndex={toolbarTabIndex(2 + i)}
                      aria-pressed={activeChip === chip.id}
                      aria-label={m.streams_filter_chip_count({ label: chip.labelFn(), count })}
                      onClick={() => handleChipClick(chip.id)}
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                        activeChip === chip.id
                          ? "border border-sky-300/[.22] bg-sky-400/[.14] text-slate-100 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                          : "border border-slate-700/50 text-slate-400 hover:bg-slate-800 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
                      }`}
                    >
                      <span>{chip.labelFn()}</span>
                      <span
                        aria-hidden="true"
                        className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-slate-700/80 px-1 text-[10px] leading-4 text-slate-300 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[Canvas] forced-colors:text-[ButtonText]"
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </ScreenZone>

          {/* Content pad wrapper */}
          <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
            {/* Rounded card container */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-700/60 bg-white/[.02] forced-colors:border-[ButtonText]">
              {/* ── Column headers (visual only) ── */}
              <div
                aria-hidden="true"
                className="grid border-b border-slate-700 bg-white/[.04] px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]"
                style={{ gridTemplateColumns: "100px 1fr 1.5fr 90px 90px 240px" }}
              >
                <span style={{ gridColumn: 1 }}>{m.column_status()}</span>
                <span style={{ gridColumn: 2 }}>{m.column_station()}</span>
                <span style={{ gridColumn: 3 }}>{m.column_now_playing()}</span>
                <span style={{ gridColumn: 4 }}>{m.column_bitrate()}</span>
                <span style={{ gridColumn: 5 }}>{m.column_duration()}</span>
                <span style={{ gridColumn: 6 }}>{m.column_actions()}</span>
              </div>

              {/* ── Stream list zone OR filter-empty zone ── */}
              {filterHidesAll ? (
                <div
                  ref={filterEmptyZoneRef}
                  data-zone-id="streams-filter-empty"
                  role="region"
                  aria-label={m.streams_filter_empty()}
                  className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-slate-400"
                >
                  <p className="text-sm">{m.streams_filter_empty()}</p>
                  <button
                    ref={resetFilterBtnRef}
                    onClick={handleResetFilter}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
                  >
                    {m.streams_filter_reset()}
                  </button>
                </div>
              ) : (
                <StreamList
                  ref={streamListCallbackRef}
                  streams={filteredStreams}
                  exitZone={(forward) => exitZone("streams-list", forward)}
                  onEmpty={() => {/* handled by isEmpty effect */}}
                />
              )}
            </div>
          </div>
        </>
      )}

      <AddStreamDialog />
      {confirmStopAll && createPortal(
        <ConfirmDialog
          title={m.confirm_stop_all_title()}
          message={m.confirm_stop_all_message({ count: activeCount })}
          confirmLabel={m.stop_all()}
          onConfirm={() => { setConfirmStopAll(false); doStopAll(); }}
          onCancel={() => setConfirmStopAll(false)}
        />,
        document.body,
      )}
    </div>
  );
}
