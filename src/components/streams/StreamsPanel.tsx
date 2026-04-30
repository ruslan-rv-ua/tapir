import { useEffect, useRef, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $streams, $showAddStreamDialog, $editStream } from "../../stores/streams";
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

export function StreamsPanel({ onZonesChange, exitZone }: Props) {
  const streams = useStore($streams);
  const showAddDialog = useStore($showAddStreamDialog);
  const editStream = useStore($editStream);
  const isEmpty = streams.length === 0;

  const showDialog = showAddDialog || editStream !== null;

  const handleCloseDialog = () => {
    $showAddStreamDialog.set(false);
    $editStream.set(null);
  };

  // === Actions zone refs ===
  const actionsZoneRef = useRef<HTMLDivElement | null>(null);
  const paletteBtn = useRef<HTMLButtonElement | null>(null);
  const addBtn = useRef<HTMLButtonElement | null>(null);
  const stopAllBtn = useRef<HTMLButtonElement | null>(null);
  const actionsBtns = useMemo(() => [paletteBtn, addBtn, stopAllBtn], []);

  const { onKeyDown: actionsKeyDown, getTabIndex: actionsTabIndex, restoreFocus: actionsRestore } =
    useRovingFocus(actionsBtns, "horizontal", {
      mode: "composite-exit",
      onTabOut: (forward) => exitZone("streams-actions", forward),
    });

  // === List zone (forwardRef from StreamList) ===
  const streamListRef = useRef<ZoneEntry | null>(null);

  // === Empty-state zone ===
  const emptyZoneRef = useRef<HTMLDivElement | null>(null);
  const emptyPaletteBtnRef = useRef<HTMLButtonElement | null>(null);
  const emptyCtaRef = useRef<HTMLButtonElement | null>(null);
  const emptyBtns = useMemo(() => [emptyPaletteBtnRef, emptyCtaRef], []);
  const { onKeyDown: emptyKeyDown, getTabIndex: emptyTabIndex, restoreFocus: _emptyRestore } =
    useRovingFocus(emptyBtns, "horizontal", {
      mode: "composite-exit",
      onTabOut: (forward) => exitZone("streams-empty", forward),
    });

  // Register zones whenever empty state changes
  useEffect(() => {
    if (isEmpty) {
      const emptyZone: ZoneEntry = {
        id: "streams-empty",
        get el() { return emptyZoneRef.current!; },
        focus: (dir) => {
          if (dir === 'forward') emptyCtaRef.current?.focus();
          else (emptyPaletteBtnRef.current ?? emptyCtaRef.current)?.focus();
        },
      };
      onZonesChange([emptyZone]);
    } else {
      const actionsZone: ZoneEntry = {
        id: "streams-actions",
        get el() { return actionsZoneRef.current!; },
        focus: actionsRestore,
      };
      const zones: ZoneEntry[] = [actionsZone];
      if (streamListRef.current) zones.push(streamListRef.current);
      onZonesChange(zones);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, actionsRestore]);

  const handleStopAll = async () => {
    try { await tauri.stopAllRecordings(); }
    catch (err) { addToast(String(err), "error"); }
  };

  const emptyDescId = "streams-empty-desc";

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.streams_section()}>
      {isEmpty ? (
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
            autoFocus
            aria-describedby={emptyDescId}
            onClick={() => $showAddStreamDialog.set(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
          >
            {m.add_stream()}
          </button>
        </div>
      ) : (
        <>
          {/* Actions toolbar zone */}
          <div
            ref={actionsZoneRef}
            data-zone-id="streams-actions"
            role="toolbar"
            aria-label={m.zone_streams_actions()}
            className="flex items-center gap-2 border-b border-slate-700 px-4 py-2 forced-colors:border-[ButtonText]"
            onKeyDown={actionsKeyDown}
          >
            <button
              ref={paletteBtn}
              tabIndex={actionsTabIndex(0)}
              aria-label={m.command_palette_label()}
              onClick={() => $commandPaletteOpen.set(true)}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              &gt;_
            </button>
            <button
              ref={addBtn}
              tabIndex={actionsTabIndex(1)}
              onClick={() => $showAddStreamDialog.set(true)}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            >
              {m.add_stream()}
            </button>
            <button
              ref={stopAllBtn}
              tabIndex={actionsTabIndex(2)}
              onClick={handleStopAll}
              className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.stop_all()}
            </button>
          </div>

          {/* List zone */}
          <StreamList
            ref={(zone) => {
              streamListRef.current = zone;
              if (zone && !isEmpty) {
                const actionsZone: ZoneEntry = {
                  id: "streams-actions",
                  get el() { return actionsZoneRef.current!; },
                  focus: actionsRestore,
                };
                onZonesChange([actionsZone, zone]);
              }
            }}
            exitZone={(forward) => exitZone("streams-list", forward)}
            onEmpty={() => {/* handled by isEmpty effect */}}
          />
        </>
      )}

      {showDialog && (
        <AddStreamDialog
          onClose={handleCloseDialog}
          editStream={editStream ?? undefined}
        />
      )}
    </div>
  );
}
