import { useStore } from "@nanostores/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { $streams, $statuses, $showAddStreamDialog, $importCandidates, $exportStreamsRequest } from "../../stores/streams";
import { $commandPaletteOpen } from "../../stores/navigation";
import { $settings, $profileSettingsTarget } from "../../stores/settings";
import { addToast } from "../../stores/toasts";
import { useAnnounce } from "../../hooks/useAnnounce";
import * as tauri from "../../lib/tauri";
import { isRecordingLike } from "../../lib/streamState";
import { reportRecordRefusal, toggleRecording } from "../../lib/recordingToggle";
import * as m from "../../i18n/paraglide/messages";

// Number of options PageUp/PageDown jumps by.
const PAGE_STEP = 8;

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  action: () => void;
}

export function CommandPalette() {
  const isOpen = useStore($commandPaletteOpen);
  const settings = useStore($settings);
  const streams = useStore($streams);
  const statuses = useStore($statuses);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<Element | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const announce = useAnnounce();

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement;
      setQuery("");
      setSelectedIndex(0);
      // Focus input after mount
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      if (
        openerRef.current instanceof HTMLElement &&
        openerRef.current !== document.body
      ) {
        openerRef.current.focus();
      }
      openerRef.current = null;
    }
  }, [isOpen]);

  const close = useCallback(() => {
    $commandPaletteOpen.set(false);
  }, []);

  // Build items: static actions + stream-specific actions
  const allItems: PaletteItem[] = [
    {
      id: "add-stream",
      label: m.add_stream(),
      action: () => {
        close();
        $showAddStreamDialog.set(true);
      },
    },
    {
      id: "import-streams",
      label: m.streams_import_action(),
      action: async () => {
        close();
        try {
          const candidates = await tauri.beginStreamImport();
          if (candidates === null) return; // file picker cancelled — stay silent
          if (candidates.length === 0) { addToast(m.streams_import_none(), "info"); return; }
          $importCandidates.set(candidates);
        } catch (e) {
          addToast(String(e), "error");
        }
      },
    },
    // Nothing to export from an empty profile — mirror the toolbar's disabled state.
    ...(streams.length > 0
      ? [{
          id: "export-streams",
          label: m.streams_export_action(),
          action: () => {
            close();
            $exportStreamsRequest.set({ ids: null });
          },
        }]
      : []),
    // Діє на активний профіль — третій вхід у діалог, для тих, хто не тримає
    // в пам'яті Ctrl+Shift+, .
    ...(settings?.activeProfile
      ? [{
          id: "profile-settings",
          label: m.profile_settings(),
          sublabel: settings.activeProfile,
          action: () => {
            close();
            $profileSettingsTarget.set(settings.activeProfile);
          },
        }]
      : []),
    {
      id: "record-all",
      label: m.record_all(),
      action: async () => {
        close();
        try { await tauri.startAllRecordings(); } catch (e) { reportRecordRefusal(e, "startAllRecordings(palette)"); }
      },
    },
    {
      id: "stop-all",
      label: m.stop_all(),
      action: async () => {
        close();
        try { await tauri.stopAllRecordings(); } catch (e) { addToast(String(e), "error"); }
      },
    },
    ...streams.flatMap((stream) => {
      const state = statuses[stream.id]?.state;
      // A recording exists from the start command on — the palette says what
      // the row button says, through the same module.
      return [
        {
          id: `record-${stream.id}`,
          label: isRecordingLike(state) ? m.stop_recording() : m.start_recording(),
          sublabel: stream.name,
          action: async () => {
            close();
            await toggleRecording(stream.id, state);
          },
        },
      ];
    }),
  ];

  // Simple case-insensitive filter
  const filtered = query.trim()
    ? allItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.sublabel?.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  // Clamp selectedIndex
  const clampedIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));
  const activeItemId = filtered[clampedIndex]?.id;
  const resultCount = filtered.length;

  // Tell a screen-reader user how many commands remain after they filter — they
  // type blind and can't see the list shrink. Debounced so a fast typist doesn't
  // get an announcement per keystroke. Announced via the global LiveAnnouncer
  // (useAnnounce), whose regions carry data-live-announcer so react-aria's
  // ariaHideOutside doesn't mute them while this dialog is open
  // ([[live-region-inside-modals]]). Empty query = the full list is shown on
  // open and NVDA already reads the dialog, so we stay silent there.
  useEffect(() => {
    if (!isOpen || query.trim() === "") return;
    const id = setTimeout(() => {
      announce(m.palette_results_count({ count: resultCount }), "polite");
    }, 300);
    return () => clearTimeout(id);
  }, [isOpen, query, resultCount, announce]);

  // Keep the active option scrolled into view. With aria-activedescendant the
  // browser does not move DOM focus, so it won't auto-scroll — we do it here.
  useEffect(() => {
    if (!activeItemId) return;
    document
      .getElementById(`palette-item-${activeItemId}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeItemId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (!dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), details > summary:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (el) =>
          !el.closest('[aria-hidden="true"]') &&
          el.offsetParent !== null &&
          getComputedStyle(el).visibility !== 'hidden',
      );
      if (focusable.length === 0) return;
      const activeIdx = focusable.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey) {
        const prevIdx = activeIdx <= 0 ? focusable.length - 1 : activeIdx - 1;
        focusable[prevIdx]?.focus();
      } else {
        const nextIdx = activeIdx >= focusable.length - 1 ? 0 : activeIdx + 1;
        focusable[nextIdx]?.focus();
      }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === "Home") { e.preventDefault(); setSelectedIndex(0); }
    if (e.key === "End") { e.preventDefault(); setSelectedIndex(filtered.length - 1); }
    if (e.key === "PageDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + PAGE_STEP, filtered.length - 1)); }
    if (e.key === "PageUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - PAGE_STEP, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[clampedIndex]) filtered[clampedIndex].action();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={m.command_palette_label()}
        data-modal="true"
        className="h-fit w-[560px] overflow-hidden rounded-lg bg-slate-800 shadow-2xl forced-colors:border forced-colors:border-[ButtonText]"
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          placeholder={m.command_palette_placeholder()}
          aria-label={m.command_palette_placeholder()}
          role="combobox"
          aria-expanded="true"
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="palette-listbox"
          aria-activedescendant={filtered[clampedIndex] ? `palette-item-${filtered[clampedIndex].id}` : undefined}
          className="w-full border-b border-slate-600 bg-transparent p-4 text-slate-200 outline-none placeholder:text-slate-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]"
        />
        <ul
          id="palette-listbox"
          role="listbox"
          aria-label={m.command_palette_placeholder()}
          className="max-h-80 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">
              {m.palette_no_results()}
            </li>
          ) : (
            filtered.map((item, index) => (
              <li
                key={item.id}
                id={`palette-item-${item.id}`}
                role="option"
                aria-selected={index === clampedIndex}
                onClick={item.action}
                className={`flex cursor-pointer flex-col px-4 py-2.5 text-sm ${
                  index === clampedIndex ? "bg-blue-600/30 text-slate-100 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "text-slate-300 hover:bg-slate-700/50 forced-colors:text-[CanvasText]"
                }`}
              >
                <span>{item.label}</span>
                {item.sublabel && <span className="text-xs text-slate-500">{item.sublabel}</span>}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
