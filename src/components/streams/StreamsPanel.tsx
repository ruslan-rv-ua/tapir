import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $streams, $statuses, $visibleStreams, $showAddStreamDialog, $streamFilter, $importCandidates, $exportStreamsRequest, $streamSelection, replaceSelection, type StreamFilter, type StreamSort } from "../../stores/streams";
import { $settings, $profileSettings } from "../../stores/settings";
import { $freeSpace } from "../../stores/system";
import { FreeSpaceMetric } from "./FreeSpaceMetric";
import { StreamList, type StreamListHandle } from "./StreamList";
import { SelectionActionsMenu } from "./SelectionActionsMenu";
import { AddStreamDialog } from "./AddStreamDialog";
import { ImportStreamsDialog } from "./ImportStreamsDialog";
import { ExportFormatDialog } from "./ExportFormatDialog";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { ListCard } from "../common/ListCard";
import { ScreenZone } from "../layout/ScreenZone";
import { ScreenHeader } from "../layout/ScreenHeader";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import { isRecordingLike } from "../../lib/streamState";
import { SHORTCUTS } from "../../lib/shortcuts";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

// Empty-state discoverability badge (ADR 2026-05-31 §6, S3). The combo is read
// from SHORTCUTS — the same source the F1 help renders — so the badge cannot
// drift from the real accelerator. The fallback keeps the empty state rendering
// if the entry is ever renamed.
const PALETTE_COMBO = SHORTCUTS.find((s) => s.id === "command-palette")?.combo ?? "Ctrl+K";

// Partial-success announcements: skipped = requested − done (R5). Pure of
// component state, so they live at module scope.
const composeRecordSummary = (sel: number, started: number): string => {
  const parts = [m.record_done({ count: started })];
  if (sel - started > 0) parts.push(m.record_skipped({ count: sel - started }));
  return parts.join(", ");
};
const composeStopSummary = (sel: number, stopped: number): string => {
  const parts = [m.stop_done({ count: stopped })];
  if (sel - stopped > 0) parts.push(m.stop_skipped({ count: sel - stopped }));
  return parts.join(", ");
};

const FILTER_CHIPS = [
  { id: "all",       labelFn: () => m.filter_all() },
  { id: "recording", labelFn: () => m.filter_recording() },
  { id: "errors",    labelFn: () => m.filter_errors() },
] as const satisfies ReadonlyArray<{ id: StreamFilter; labelFn: () => string }>;

const SORT_OPTIONS = [
  { id: "name",  labelFn: () => m.streams_sort_by_name() },
  { id: "added", labelFn: () => m.streams_sort_by_added() },
] as const satisfies ReadonlyArray<{ id: StreamSort; labelFn: () => string }>;

export function StreamsPanel({ onZonesChange, exitZone }: Props) {
  const streams = useStore($streams);
  const statuses = useStore($statuses);
  const settings = useStore($settings);
  const profileSettings = useStore($profileSettings);
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

  // Streams whose recording task is NOT currently live (idle / error / stopped /
  // never-started) — these are what "Записати все" will start. Backend skips any
  // already-active stream, so this only drives the button's disabled state.
  const startableCount = useMemo(
    () => streams.filter((s) => !isRecordingLike(statuses[s.id]?.state)).length,
    [streams, statuses],
  );

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
  const [confirmStop, setConfirmStop] = useState<null | { scope: "all" | "selected" }>(null);
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

  // Visible order = active filter chip applied to the sort order. Lives in the
  // store ($visibleStreams) so $playbackNeighbors (Ctrl+Alt+Left/Right) walks the
  // exact same list the user sees — keeping the two in sync was the whole bug.
  const visibleStreams = useStore($visibleStreams);

  const sortBy: StreamSort = profileSettings?.ui.streamSort ?? "name";

  const selection = useStore($streamSelection);
  const selCount = selection.size;

  const selectedStartableCount = useMemo(
    () => [...selection].filter((id) => streamIds.has(id) && !isRecordingLike(statuses[id]?.state)).length,
    [selection, statuses, streamIds],
  );
  const selectedStoppableCount = useMemo(
    () => [...selection].filter((id) => streamIds.has(id) && isRecordingLike(statuses[id]?.state)).length,
    [selection, statuses, streamIds],
  );
  const stoppableCount = useMemo(
    () => streams.filter((s) => isRecordingLike(statuses[s.id]?.state)).length,
    [streams, statuses],
  );
  const recordDisabled = selCount > 0 ? selectedStartableCount === 0 : startableCount === 0;
  const stopDisabled = selCount > 0 ? selectedStoppableCount === 0 : stoppableCount === 0;

  const visibleIds = useMemo(() => visibleStreams.map((s) => s.id), [visibleStreams]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  const handleSelectAll = () => {
    if (visibleIds.length === 0) return;
    const next = new Set(selection);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    replaceSelection(next);
    // Toolbar acts beside the hook, so it announces itself on the same central
    // channel (A7) — otherwise Ctrl+A would announce but its mirror button wouldn't.
    announce(next.size === 0 ? m.selection_cleared() : m.selection_count({ count: next.size }), "polite");
  };

  const sortAnnouncement = useCallback(
    (id: StreamSort) => {
      const opt = SORT_OPTIONS.find((o) => o.id === id);
      return m.streams_sort_changed({ label: opt ? opt.labelFn() : "" });
    },
    [],
  );

  // Порядок сортування профільний (ADR 2026-08-08): пишемо секцію `ui` цілком —
  // у ній немає жодного бекендового поля.
  const handleSortChange = (id: StreamSort) => {
    if (id === sortBy) return;
    const current = $profileSettings.get();
    const activeProfile = $settings.get()?.activeProfile;
    if (!current || !activeProfile) return;
    const ui = { ...current.ui, streamSort: id };
    $profileSettings.set({ ...current, ui });
    tauri.updateProfileSettings(activeProfile, { ui })
      .catch((e) => addToast(String(e), "error"));
    announce(sortAnnouncement(id), "polite");
  };

  const filterHidesAll = !isEmpty && visibleStreams.length === 0;

  const handleChipClick = (chipId: StreamFilter) => {
    if (chipId === activeChip) return;
    $streamFilter.set(chipId);
    // The visible set changes under the new filter — selection is scoped to what's
    // visible, so clear it rather than leaving stale (now-hidden) ids selected.
    replaceSelection(new Set());
    const count = chipId === "all"
      ? streams.length
      : chipId === "recording"
      ? streams.filter(s => statuses[s.id]?.state === "recording").length
      : streams.filter(s => statuses[s.id]?.state === "error").length;
    announce(filterAnnouncement(chipId, count), "polite");
  };

  // ── Toolbar zone refs (12 items) ──────────────────────────
  // Move/Copy/Delete-selected collapsed into one menu stop (selectionMenuBtn),
  // so the roving array is fixed at 12 (was 14) — see SelectionActionsMenu.
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const addBtn            = useRef<HTMLButtonElement | null>(null);
  const importBtn         = useRef<HTMLButtonElement | null>(null);
  const exportBtn         = useRef<HTMLButtonElement | null>(null);
  const selectAllBtn      = useRef<HTMLButtonElement | null>(null);
  const selectionMenuBtn  = useRef<HTMLButtonElement | null>(null);
  const recordAllBtn      = useRef<HTMLButtonElement | null>(null);
  const stopAllBtn        = useRef<HTMLButtonElement | null>(null);
  const chip0Ref   = useRef<HTMLButtonElement | null>(null);
  const chip1Ref   = useRef<HTMLButtonElement | null>(null);
  const chip2Ref   = useRef<HTMLButtonElement | null>(null);
  const chipRefs = useMemo(() => [chip0Ref, chip1Ref, chip2Ref], []);
  const sort0Ref   = useRef<HTMLButtonElement | null>(null);
  const sort1Ref   = useRef<HTMLButtonElement | null>(null);
  const sortRefs = useMemo(() => [sort0Ref, sort1Ref], []);
  const toolbarRefs = useMemo(
    () => [addBtn, importBtn, exportBtn, selectAllBtn, selectionMenuBtn, recordAllBtn, stopAllBtn, chip0Ref, chip1Ref, chip2Ref, sort0Ref, sort1Ref],
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
  // Typed as the full StreamListHandle (ZoneEntry + requestBulkDelete) so the
  // toolbar's Видалити виділені button can drive the list's bulk-confirm dialog.
  const streamListRef = useRef<StreamListHandle | null>(null);
  const streamListCallbackRef = useCallback((zone: StreamListHandle | null) => {
    streamListRef.current = zone;
  }, []);
  // Stable zone proxy delegating to the CURRENT handle. The zone-registration
  // effect below doesn't depend on the handle, so it doesn't re-run when the list
  // re-sorts (e.g. the persisted "added" order arriving after $streams loaded) or
  // remounts — pushing the raw handle would freeze a stale ZoneEntry (with a stale
  // `items` closure) in App's zones array, so Tab-into-list would focus the old
  // first row. The proxy is created once and always routes focus() to the live
  // handle. See zone-navigation-stable-proxies; mirrors SongsPanel/SchedulePanel.
  const streamListProxyRef = useRef<ZoneEntry>({
    id: "streams-list",
    get el() { return streamListRef.current?.el as HTMLElement; },
    focus: (dir) => streamListRef.current?.focus(dir),
  });

  // ── Filter-empty zone (streams exist but filter hides them) ─────
  const filterEmptyZoneRef = useRef<HTMLDivElement | null>(null);
  const resetFilterBtnRef  = useRef<HTMLButtonElement | null>(null);

  // ── Empty-profile zone (no streams at all) ──────────────────────
  const emptyZoneRef = useRef<HTMLDivElement | null>(null);
  const addExamplesBtnRef = useRef<HTMLButtonElement | null>(null);
  const [loadingExamples, setLoadingExamples] = useState(false);
  const pendingFocusFirstRow = useRef(false);
  // Set by StreamList.onEmpty when a bulk delete clears the visible list — the
  // target button isn't mounted yet, so a deferred effect focuses it (see below).
  const pendingFocusEmptyZone = useRef(false);

  const handleResetFilter = () => {
    $streamFilter.set("all");
    replaceSelection(new Set());
    announce(filterAnnouncement("all", streams.length), "polite");
  };

  // Pluralized "Added N examples: <names>. List updated." — threads {names} in addition
  // to {count}, so it needs its own wrapper beyond what pluralize can handle alone.
  const addedAnnouncement = useCallback(
    (count: number, names: string) =>
      pluralize(
        count,
        () => m.streams_examples_added_zero(),
        ({ count }) => m.streams_examples_added_one({ count, names }),
        ({ count }) => m.streams_examples_added_few({ count, names }),
        ({ count }) => m.streams_examples_added_many({ count, names }),
      ),
    [pluralize],
  );

  const handleAddExamples = async () => {
    if (loadingExamples) return; // guard double-activation (button stays clickable via aria-disabled)
    setLoadingExamples(true);
    announce(m.streams_examples_loading(), "polite");
    try {
      const added = await tauri.addExampleStreams();
      // Backend already emitted streams-changed → App.tsx reloads $streams →
      // isEmpty flips false and the list mounts. Keep loadingExamples=true: this
      // empty-state node unmounts with it. Focus the first row once mounted.
      pendingFocusFirstRow.current = true;
      announce(addedAnnouncement(added.length, added.map((s) => s.name).join(", ")), "polite");
    } catch (err) {
      addToast(String(err), "error");
      announce(m.streams_examples_failed(), "polite");
      setLoadingExamples(false); // aria-disabled never moved focus, so it stays on the button
    }
  };

  // ── Zone registration ────────────────────────────────────
  // The toolbar zone exists in every state (incl. empty profile) so Додати/
  // Імпорт/Експорт are always discoverable in the same place; the list zone is
  // registered only when there are streams to show.
  useEffect(() => {
    const toolbarZone: ZoneEntry = {
      id: "streams-toolbar",
      get el() { return toolbarZoneRef.current!; },
      focus: toolbarRestore,
    };
    const zones: ZoneEntry[] = [toolbarZone];
    if (isEmpty) {
      zones.push({
        id: "streams-empty",
        get el() { return emptyZoneRef.current!; },
        focus: () => addExamplesBtnRef.current?.focus(),
      });
    } else if (filterHidesAll) {
      zones.push({
        id: "streams-filter-empty",
        get el() { return filterEmptyZoneRef.current!; },
        focus: () => resetFilterBtnRef.current?.focus(),
      });
    } else if (streamListRef.current) {
      zones.push(streamListProxyRef.current);
    }
    onZonesChange(zones);
  // onZonesChange intentionally omitted — callers must pass a stable reference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, filterHidesAll, toolbarRestore]);

  // Move focus to the first stream row after examples are added. The await in
  // handleAddExamples resolves before streams-changed + getStreams() repopulate
  // $streams, so the list isn't mounted yet at await-time; a single rAF wouldn't
  // cover that. Instead key off the isEmpty transition: streamListRef is set by
  // StreamList's callback ref during commit, so it's available here.
  useEffect(() => {
    if (!isEmpty && pendingFocusFirstRow.current) {
      pendingFocusFirstRow.current = false;
      // ZoneEntry.focus === CompositeList.restoreFocus: on a fresh list the memory
      // is empty, so focus lands on the first row (summary).
      streamListRef.current?.focus("forward");
    }
    // loadingExamples is intentionally left true after a successful add (avoids a
    // flash of the normal button label before the list mounts). But if all streams
    // are later deleted isEmpty flips back to true and the empty-state zone
    // re-mounts — reset here so the button is not stuck in the loading state.
    if (isEmpty) setLoadingExamples(false);
  }, [isEmpty]);

  // After a bulk delete empties the visible list, StreamList.onEmpty set a flag;
  // the target button isn't mounted until isEmpty / filterHidesAll flips true, so
  // focus it here (never let focus fall to <body>).
  useEffect(() => {
    if (!pendingFocusEmptyZone.current) return;
    if (isEmpty) {
      pendingFocusEmptyZone.current = false;
      addExamplesBtnRef.current?.focus();
    } else if (filterHidesAll) {
      pendingFocusEmptyZone.current = false;
      resetFilterBtnRef.current?.focus();
    }
  }, [isEmpty, filterHidesAll]);

  // Selection is section-scoped: clear it when the streams screen unmounts.
  useEffect(() => () => { replaceSelection(new Set()); }, []);

  const doStopAll = async () => {
    try { await tauri.stopAllRecordings(); }
    catch (err) { addToast(String(err), "error"); }
  };
  const doStopSelected = async (ids: string[]) => {
    try {
      const stopped = await tauri.stopAllRecordings(ids);
      announce(composeStopSummary(ids.length, stopped), "polite");
    } catch (err) { addToast(String(err), "error"); }
  };
  const handleStopAll = () => {
    if (selCount > 0) {
      if (selectedStoppableCount === 0) return;
      if (selectedStoppableCount > 1) { setConfirmStop({ scope: "selected" }); return; }
      doStopSelected([...selection]);
    } else {
      if (stoppableCount === 0) return;
      if (stoppableCount > 1) { setConfirmStop({ scope: "all" }); return; }
      doStopAll();
    }
  };

  const recordAllAnnouncement = useCallback(
    (count: number) =>
      pluralize(
        count,
        m.record_all_announce_zero,
        m.record_all_announce_one,
        m.record_all_announce_few,
        m.record_all_announce_many,
      ),
    [pluralize],
  );

  const handleRecordAll = async () => {
    if (selCount > 0) {
      if (selectedStartableCount === 0) return;
      const ids = [...selection];
      try {
        const started = await tauri.startAllRecordings(ids);
        announce(composeRecordSummary(ids.length, started), "polite");
      } catch (err) { addToast(String(err), "error"); }
    } else {
      if (startableCount === 0) return;
      try {
        const started = await tauri.startAllRecordings();
        announce(recordAllAnnouncement(started), "polite");
      } catch (err) { addToast(String(err), "error"); }
    }
  };

  const handleImport = async () => {
    try {
      const candidates = await tauri.beginStreamImport();
      if (candidates === null) return; // file picker cancelled — stay silent
      if (candidates.length === 0) { addToast(m.streams_import_none(), "info"); return; }
      $importCandidates.set(candidates);
    } catch (e) {
      addToast(String(e), "error");
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.streams_section()}>
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
          thresholdGb={profileSettings?.recording.diskSpaceThresholdGb ?? 0}
        />
      </div>

      {/* ── Workspace titlebar + Toolbar = streams-toolbar zone ── */}
      {/* IMPORTANT: Both rows must live inside ScreenZone so mixed-boundary-handoff
          sees all 14 interactive items (indices 0–13). The heading is structural, not focusable. */}
      <ScreenZone
        ref={toolbarZoneRef}
        id="streams-toolbar"
        role="application"
        label={m.zone_streams_actions()}
        onKeyDown={toolbarKeyDown}
      >
        {/* Row 1: Title + Додати (0) + Імпорт (1) + Експорт (2) */}
        <ScreenHeader title={m.streams_section()}>
          <button
            ref={addBtn}
            tabIndex={toolbarTabIndex(0)}
            onClick={() => $showAddStreamDialog.set(true)}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
          >
            {m.add_stream()}
          </button>
          <button
            ref={importBtn}
            tabIndex={toolbarTabIndex(1)}
            onClick={handleImport}
            className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            {m.streams_import_button()}
          </button>
          {/* aria-disabled (not native disabled) so the button stays
              focusable/discoverable when the profile has no streams */}
          <button
            ref={exportBtn}
            tabIndex={toolbarTabIndex(2)}
            aria-disabled={isEmpty || undefined}
            onClick={() => { if (!isEmpty) $exportStreamsRequest.set({ ids: selCount > 0 ? [...selection] : null }); }}
            className={`rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
              isEmpty
                ? "cursor-not-allowed text-slate-600"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            {selCount > 0 ? m.streams_export_selected({ count: selCount }) : m.streams_export_button()}
          </button>
        </ScreenHeader>

        {/* Row 2: Виділити все + Дії з виділеними (меню) + Записати все + Зупинити запис + Chips.
            flex-wrap + whitespace-nowrap/shrink-0 on buttons: at narrow widths the row
            reflows to a second line instead of crushing button labels (C). */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          {/* Index 3: Виділити все / Зняти */}
          <button
            ref={selectAllBtn}
            tabIndex={toolbarTabIndex(3)}
            aria-disabled={visibleIds.length === 0 || undefined}
            onClick={handleSelectAll}
            className={`shrink-0 whitespace-nowrap rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
              visibleIds.length === 0 ? "cursor-not-allowed text-slate-600" : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            {allVisibleSelected ? m.clear_selection() : m.select_all()}
          </button>

          {/* Index 4: Дії з виділеними (N) — overflow menu for move/copy/delete (F).
              Single roving stop; items live in a Popover, not the toolbar array. */}
          <SelectionActionsMenu
            buttonRef={selectionMenuBtn}
            isActiveStop={toolbarTabIndex(4) === 0}
            selCount={selCount}
            onMove={() => streamListRef.current?.requestBulkTransfer("move")}
            onCopy={() => streamListRef.current?.requestBulkTransfer("copy")}
            onDelete={() => streamListRef.current?.requestBulkDelete()}
          />

          {/* Plain (NOT live) count — read in browse mode, never double-announced
              (the central announce() on each gesture is the only spoken update). */}
          {selCount > 0 && (
            <span className="text-xs text-slate-400">{m.selected_count_label({ count: selCount })}</span>
          )}

          <div className="mx-1 h-4 w-px bg-slate-700 forced-colors:bg-[ButtonText]" aria-hidden="true" />

          {/* Index 5: Записати все / Записати виділені (N) — aria-disabled (R8) */}
          <button
            ref={recordAllBtn}
            tabIndex={toolbarTabIndex(5)}
            onClick={handleRecordAll}
            aria-disabled={recordDisabled || undefined}
            className={`shrink-0 whitespace-nowrap rounded bg-blue-600 px-3 py-1 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] ${
              recordDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-blue-700"
            }`}
          >
            {selCount > 0 ? m.record_selected({ count: selCount }) : m.record_all()}
          </button>

          {/* Index 6: Зупинити запис / Зупинити виділені (N) — aria-disabled (R8) */}
          <button
            ref={stopAllBtn}
            tabIndex={toolbarTabIndex(6)}
            onClick={handleStopAll}
            aria-disabled={stopDisabled || undefined}
            className={`shrink-0 whitespace-nowrap rounded px-3 py-1 text-xs text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] ${
              stopDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-slate-800"
            }`}
          >
            {selCount > 0 ? m.stop_selected({ count: selCount }) : m.stop_all()}
          </button>

          <div className="mx-1 h-4 w-px bg-slate-700 forced-colors:bg-[ButtonText]" aria-hidden="true" />

          {/* Indices 9–11: Filter chips — semantic group, toggle chips kept */}
          <div role="group" aria-label={m.streams_filter_group()} className="flex items-center gap-2">
            {FILTER_CHIPS.map((chip, i) => {
              const count = chip.id === "recording" ? activeCount
                          : chip.id === "errors"    ? errorCount
                          : streams.length;
              return (
                <button
                  key={chip.id}
                  ref={chipRefs[i]}
                  tabIndex={toolbarTabIndex(7 + i)}
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

          <div className="mx-1 h-4 w-px bg-slate-700 forced-colors:bg-[ButtonText]" aria-hidden="true" />

          {/* Indices 12–13: Sort toggle — segmented group mirroring the filter chips */}
          <div role="group" aria-label={m.streams_sort_group()} className="flex items-center gap-2">
            {SORT_OPTIONS.map((opt, i) => (
              <button
                key={opt.id}
                ref={sortRefs[i]}
                tabIndex={toolbarTabIndex(10 + i)}
                aria-pressed={sortBy === opt.id}
                onClick={() => handleSortChange(opt.id)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                  sortBy === opt.id
                    ? "border border-sky-300/[.22] bg-sky-400/[.14] text-slate-100 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                    : "border border-slate-700/50 text-slate-400 hover:bg-slate-800 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
                }`}
              >
                {opt.labelFn()}
              </button>
            ))}
          </div>
        </div>
      </ScreenZone>

      {/* Framed list container (shared ListCard) */}
      <ListCard>
          {!isEmpty && (
            /* ── Column headers (visual only) ── */
            <div
              aria-hidden="true"
              className="grid border-b border-slate-700 bg-white/[.04] px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]"
              style={{ gridTemplateColumns: "100px 1fr 1.5fr 130px 90px 240px" }}
            >
              <span style={{ gridColumn: 1 }}>{m.column_status()}</span>
              <span style={{ gridColumn: 2 }}>{m.column_station()}</span>
              <span style={{ gridColumn: 3 }}>{m.column_now_playing()}</span>
              <span style={{ gridColumn: 4 }}>{m.column_bitrate()}</span>
              <span style={{ gridColumn: 5 }}>{m.column_duration()}</span>
              <span style={{ gridColumn: 6 }}>{m.column_actions()}</span>
            </div>
          )}

          {/* ── Empty hint OR stream list zone OR filter-empty zone ── */}
          {isEmpty ? (
            <div
              ref={emptyZoneRef}
              data-zone-id="streams-empty"
              role="region"
              aria-label={m.streams_empty_hint()}
              className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center text-slate-400"
            >
              <p className="text-sm">{m.streams_empty_hint()}</p>
              <button
                ref={addExamplesBtnRef}
                aria-disabled={loadingExamples || undefined}
                aria-busy={loadingExamples || undefined}
                onClick={handleAddExamples}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
              >
                {loadingExamples ? m.streams_examples_loading() : m.streams_empty_add_examples()}
              </button>
              {/* Not a Tab stop by design (S3/S4): plain inline nodes, so NVDA
                  reads the hint in document order without adding a focus stop. */}
              <p className="text-xs text-slate-500 forced-colors:text-[ButtonText]">
                {m.streams_empty_palette_hint()}{" "}
                <kbd className="rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 font-mono text-slate-300 forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]">
                  {PALETTE_COMBO}
                </kbd>
              </p>
            </div>
          ) : filterHidesAll ? (
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
              streams={visibleStreams}
              exitZone={(forward) => exitZone("streams-list", forward)}
              onEmpty={() => { pendingFocusEmptyZone.current = true; }}
            />
          )}
      </ListCard>

      <AddStreamDialog />
      <ImportStreamsDialog />
      <ExportFormatDialog />
      {confirmStop && createPortal(
        <ConfirmDialog
          title={confirmStop.scope === "selected" ? m.confirm_stop_selected_title() : m.confirm_stop_all_title()}
          message={confirmStop.scope === "selected"
            ? m.confirm_stop_selected_message({ count: selectedStoppableCount })
            : m.confirm_stop_all_message({ count: stoppableCount })}
          /* Confirm button counts only the actionable (stoppable) subset, so it
             matches the dialog message; the toolbar button keeps selCount (R1). */
          confirmLabel={confirmStop.scope === "selected" ? m.stop_selected({ count: selectedStoppableCount }) : m.stop_all()}
          onConfirm={() => {
            const scope = confirmStop.scope;
            setConfirmStop(null);
            if (scope === "selected") doStopSelected([...$streamSelection.get()]);
            else doStopAll();
          }}
          onCancel={() => setConfirmStop(null)}
        />,
        document.body,
      )}
    </div>
  );
}
