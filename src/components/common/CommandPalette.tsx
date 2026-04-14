import { useStore } from "@nanostores/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { $streams, $statuses } from "../../stores/streams";
import { $commandPaletteOpen } from "../../stores/navigation";
import { addToast } from "../../stores/toasts";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  action: () => void;
}

export function CommandPalette() {
  const isOpen = useStore($commandPaletteOpen);
  const streams = useStore($streams);
  const statuses = useStore($statuses);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input after mount
      requestAnimationFrame(() => inputRef.current?.focus());
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
      action: () => { close(); /* TODO: open AddStreamDialog — emit a custom event or use a store flag */ },
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
      const state = statuses[stream.id]?.state ?? "idle";
      const isRecording = state === "recording";
      return [
        {
          id: `record-${stream.id}`,
          label: isRecording ? m.stop_recording() : m.start_recording(),
          sublabel: stream.name,
          action: async () => {
            close();
            try {
              if (isRecording) {
                await tauri.stopRecording(stream.id);
              } else {
                await tauri.startRecording(stream.id);
              }
            } catch (e) {
              addToast(String(e), "error");
            }
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[clampedIndex]) filtered[clampedIndex].action();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/50 pt-20"
      onClick={close}
      role="presentation"
    >
      <div
        className="h-fit w-[560px] overflow-hidden rounded-lg bg-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-controls="palette-listbox"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder={m.command_palette_placeholder()}
          aria-label={m.command_palette_placeholder()}
          aria-autocomplete="list"
          aria-controls="palette-listbox"
          aria-activedescendant={filtered[clampedIndex] ? `palette-item-${filtered[clampedIndex].id}` : undefined}
          className="w-full border-b border-slate-600 bg-transparent p-4 text-slate-200 outline-none placeholder:text-slate-500"
        />
        <ul
          id="palette-listbox"
          role="listbox"
          aria-label={m.command_palette_placeholder()}
          className="max-h-80 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500" role="option" aria-selected="false">
              No results
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
                  index === clampedIndex ? "bg-blue-600/30 text-slate-100" : "text-slate-300 hover:bg-slate-700/50"
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
