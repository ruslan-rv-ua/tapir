import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams, $statuses, $showAddStreamDialog } from "../../stores/streams";
import { $commandPaletteOpen } from "../../stores/navigation";
import { StreamList } from "./StreamList";
import { AddStreamDialog } from "./AddStreamDialog";
import { useRovingFocus } from "../../hooks/useRovingFocus";
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
  { id: "selected",  labelFn: () => m.filter_selected() },
] as const;

export function StreamsPanel({ onZonesChange, exitZone }: Props) {
  const streams = useStore($streams);
  const statuses = useStore($statuses);
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
    () => new Intl.PluralRules(document.documentElement.lang || "uk"),
    [],
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

  // ── Filter chip stub state ────────────────────────────────
  const [activeChip, setActiveChip] = useState<string>("all");

  // ── Toolbar zone refs (8 items) ──────────────────────────
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const cmdBtn     = useRef<HTMLButtonElement | null>(null);
  const addBtn     = useRef<HTMLButtonElement | null>(null);
  const stopAllBtn = useRef<HTMLButtonElement | null>(null);
  const searchRef  = useRef<HTMLInputElement | null>(null);
  const chip0Ref   = useRef<HTMLButtonElement | null>(null);
  const chip1Ref   = useRef<HTMLButtonElement | null>(null);
  const chip2Ref   = useRef<HTMLButtonElement | null>(null);
  const chip3Ref   = useRef<HTMLButtonElement | null>(null);
  const chipRefs = useMemo(() => [chip0Ref, chip1Ref, chip2Ref, chip3Ref], []);
  const toolbarRefs = useMemo(
    () => [cmdBtn, addBtn, stopAllBtn, searchRef, chip0Ref, chip1Ref, chip2Ref, chip3Ref],
    [],
  );

  const {
    onKeyDown: toolbarKeyDown,
    getTabIndex: toolbarTabIndex,
    restoreFocus: toolbarRestore,
    moveTo: toolbarMoveTo,
  } = useRovingFocus(toolbarRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("streams-toolbar", forward),
  });

  // Ctrl+F: focus the search input via rovingFocus moveTo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        toolbarMoveTo(3); // index 3 = searchRef
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toolbarMoveTo]);

  // ── List zone ────────────────────────────────────────────
  const streamListRef = useRef<ZoneEntry | null>(null);
  const streamListCallbackRef = useCallback((zone: ZoneEntry | null) => {
    streamListRef.current = zone;
  }, []);

  // ── Empty-state zone ─────────────────────────────────────
  const emptyZoneRef      = useRef<HTMLDivElement | null>(null);
  const emptyPaletteBtnRef = useRef<HTMLButtonElement | null>(null);
  const emptyCtaRef       = useRef<HTMLButtonElement | null>(null);
  const emptyBtns = useMemo(() => [emptyPaletteBtnRef, emptyCtaRef], []);
  const { onKeyDown: emptyKeyDown, getTabIndex: emptyTabIndex } =
    useRovingFocus(emptyBtns, "horizontal", {
      mode: "composite-exit",
      onTabOut: (forward) => exitZone("streams-empty", forward),
    });

  // ── Zone registration ────────────────────────────────────
  useEffect(() => {
    if (isEmpty) {
      const emptyZone: ZoneEntry = {
        id: "streams-empty",
        get el() { return emptyZoneRef.current!; },
        focus: (dir) => {
          if (dir === "forward") emptyCtaRef.current?.focus();
          else (emptyPaletteBtnRef.current ?? emptyCtaRef.current)?.focus();
        },
      };
      onZonesChange([emptyZone]);
    } else {
      const toolbarZone: ZoneEntry = {
        id: "streams-toolbar",
        get el() { return toolbarZoneRef.current!; },
        focus: toolbarRestore,
      };
      const zones: ZoneEntry[] = [toolbarZone];
      if (streamListRef.current) zones.push(streamListRef.current);
      onZonesChange(zones);
    }
  // onZonesChange intentionally omitted — callers must pass a stable reference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, toolbarRestore]);

  const handleStopAll = async () => {
    try { await tauri.stopAllRecordings(); }
    catch (err) { addToast(String(err), "error"); }
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
            ref={emptyPaletteBtnRef}
            tabIndex={emptyTabIndex(0)}
            aria-label={m.command_palette_label()}
            onClick={() => $commandPaletteOpen.set(true)}
            className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            {m.command_palette_label()}
          </button>
          <button
            ref={emptyCtaRef}
            tabIndex={emptyTabIndex(1)}
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
            <div className="flex flex-col gap-1.5 rounded-2xl border border-white/[.06] bg-white/[.04] p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]">
              <strong className="text-sm text-slate-100">{streamCountText}</strong>
              <span className="text-xs text-slate-400">{m.metric_streams_in_profile()}</span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-2xl border border-white/[.06] bg-white/[.04] p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]">
              <strong className="text-sm text-slate-100">{activeRecText}</strong>
              <span className="text-xs text-slate-400">{m.metric_active_recordings()}</span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-2xl border border-white/[.06] bg-white/[.04] p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]">
              <strong className="text-sm text-slate-100">{errorText}</strong>
              <span className="text-xs text-slate-400">{m.metric_errors()}</span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-2xl border border-white/[.06] bg-white/[.04] p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]">
              <strong className="text-sm text-slate-100">—</strong>
              <span className="text-xs text-slate-400">{m.metric_free_space()}</span>
            </div>
          </div>

          {/* ── Workspace titlebar + Toolbar = streams-toolbar zone ── */}
          {/* IMPORTANT: Both rows must live inside the zone div so mixed-boundary-handoff
              sees all 8 interactive items (indices 0–7). h2 is structural, not focusable. */}
          <div
            ref={toolbarZoneRef}
            data-zone-id="streams-toolbar"
            role="toolbar"
            aria-label={m.zone_streams_toolbar()}
            className="border-b border-slate-700 forced-colors:border-[ButtonText]"
            onKeyDown={toolbarKeyDown}
          >
            {/* Row 1: Title + Команди + Додати */}
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-base font-semibold text-slate-100">{m.streams_section()}</h2>
              <div className="flex items-center gap-2">
                {/* Index 0: Команди */}
                <button
                  ref={cmdBtn}
                  tabIndex={toolbarTabIndex(0)}
                  aria-label={m.command_palette_label()}
                  onClick={() => $commandPaletteOpen.set(true)}
                  className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
                >
                  {m.commands_label()}
                </button>
                {/* Index 1: Додати потік */}
                <button
                  ref={addBtn}
                  tabIndex={toolbarTabIndex(1)}
                  onClick={() => $showAddStreamDialog.set(true)}
                  className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
                >
                  {m.add_stream()}
                </button>
              </div>
            </div>

            {/* Row 2: Зупинити все + Search + Chips */}
            <div className="flex items-center gap-2 px-4 py-2">
              {/* Index 2: Зупинити все */}
              <button
                ref={stopAllBtn}
                tabIndex={toolbarTabIndex(2)}
                onClick={handleStopAll}
                className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {m.stop_all()}
              </button>

              <div className="mx-1 h-4 w-px bg-slate-700 forced-colors:bg-[ButtonText]" aria-hidden="true" />

              {/* Index 3: Search */}
              <input
                ref={searchRef}
                type="text"
                tabIndex={toolbarTabIndex(3)}
                aria-label={m.streams_search_label()}
                placeholder={m.streams_search_label()}
                className="min-w-0 flex-1 rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:text-[CanvasText] forced-colors:border forced-colors:border-[ButtonText]"
                onKeyDown={(e) => {
                  // Prevent arrow keys from being consumed by the outer rovingFocus handler
                  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                    e.stopPropagation();
                  }
                }}
              />

              <div className="mx-1 h-4 w-px bg-slate-700 forced-colors:bg-[ButtonText]" aria-hidden="true" />

              {/* Indices 4–7: Filter chips */}
              {FILTER_CHIPS.map((chip, i) => (
                <button
                  key={chip.id}
                  ref={chipRefs[i]}
                  tabIndex={toolbarTabIndex(4 + i)}
                  aria-pressed={activeChip === chip.id}
                  onClick={() => setActiveChip(chip.id)}
                  className={`rounded px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                    activeChip === chip.id
                      ? "bg-blue-600 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                      : "text-slate-400 hover:bg-slate-800 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
                  }`}
                >
                  {chip.labelFn()}
                </button>
              ))}
            </div>
          </div>

          {/* ── Column headers (visual only) ── */}
          <div
            aria-hidden="true"
            className="grid border-b border-slate-700 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-500 forced-colors:border-[ButtonText]"
            style={{ gridTemplateColumns: "100px 1fr 1.5fr 90px 90px 160px" }}
          >
            <span style={{ gridColumn: 1 }}>{m.column_status()}</span>
            <span style={{ gridColumn: 2 }}>{m.column_station()}</span>
            <span style={{ gridColumn: 3 }}>{m.column_now_playing()}</span>
            <span style={{ gridColumn: 4 }}>{m.column_bitrate()}</span>
            <span style={{ gridColumn: 5 }}>{m.column_duration()}</span>
            <span style={{ gridColumn: 6 }}>{m.column_actions()}</span>
          </div>

          {/* ── Stream list zone ── */}
          <StreamList
            ref={streamListCallbackRef}
            exitZone={(forward) => exitZone("streams-list", forward)}
            onEmpty={() => {/* handled by isEmpty effect */}}
          />
        </>
      )}

      <AddStreamDialog />
    </div>
  );
}
