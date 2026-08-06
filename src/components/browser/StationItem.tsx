import type { ReactNode } from "react";
import { useStore } from "@nanostores/react";
import { Play, Square, Plus, Check, TriangleAlert, Globe, Languages, Music, Signal, Tag, Headphones } from "lucide-react";
import type { StationResult } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { CompositeRow, CompositeSegment, CompositeAction, COMPOSITE_FOCUS_RING } from "../common/composite-list";
import { $playerStatus } from "../../stores/player";
import { previewStation, stopPlayback } from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import { useAnnounce } from "../../hooks/useAnnounce";
import * as m from "../../i18n/paraglide/messages";

const SEGMENT_ICONS: Partial<Record<Exclude<SegmentKind, "summary">, ReactNode>> = {
  country: <Globe size={12} aria-hidden />,
  language: <Languages size={12} aria-hidden />,
  codec: <Music size={12} aria-hidden />,
  bitrate: <Signal size={12} aria-hidden />,
  genre: <Tag size={12} aria-hidden />,
  popularity: <Headphones size={12} aria-hidden />,
};

/**
 * Left/Right focus-stop order for a station row (Layout A: one stop per value).
 * Each metadata stop is included only when its value is present; the two action
 * stops are always present. Mirrors getStreamSegments.
 */
export function getStationSegments(station: StationResult): Exclude<SegmentKind, "summary">[] {
  const segments: Exclude<SegmentKind, "summary">[] = [];
  if (station.country) segments.push("country");
  if (station.language) segments.push("language");
  if (station.codec) segments.push("codec");
  if (station.bitrate) segments.push("bitrate"); // 0 = unknown from API
  if (station.tags) segments.push("genre");
  if (station.clickcount) segments.push("popularity"); // 0 = unknown from API
  segments.push("action-play", "action-add");
  return segments;
}

interface StationItemProps {
  station: StationResult;
  isFocused: (segment: SegmentKind) => boolean;
  isActiveRow: boolean;
  isAdded: boolean;
  /** lastcheckok === 0 OR a preview attempt has failed this session. */
  isUnavailable: boolean;
  isSelected: boolean;
  onAdd: () => void;
  onPreviewFailed: () => void;
}

export function StationItem({
  station,
  isFocused,
  isActiveRow,
  isAdded,
  isUnavailable,
  isSelected,
  onAdd,
  onPreviewFailed,
}: StationItemProps) {
  const playerStatus = useStore($playerStatus);
  const announce = useAnnounce();
  const resolved = station.urlResolved || station.url;
  const isPreviewing =
    !!resolved &&
    playerStatus.state !== "stopped" &&
    playerStatus.source?.type === "preview" &&
    playerStatus.source.url === resolved;

  const handlePreviewToggle = async () => {
    if (isPreviewing) {
      try {
        await stopPlayback();
      } catch (err) {
        addToast(String(err), "error");
      }
      return;
    }
    try {
      await previewStation(resolved, station.name);
    } catch (err) {
      addToast(String(err), "error");
      announce(m.station_preview_failed({ name: station.name }), "polite");
      onPreviewFailed();
    }
  };

  // Down-scan summary: name + the metadata that tells same-named variants apart
  // (one station commonly appears once per mountpoint), with a state prefix when
  // relevant. Codec and bitrate are here on purpose — read aloud, the name alone
  // is identical across all six BBC 6 Music entries.
  const summaryMeta = [
    station.country,
    station.codec,
    station.bitrate ? `${station.bitrate} kbps` : "",
    station.tags,
  ]
    .filter(Boolean)
    .join(", ");
  const summaryName = summaryMeta ? `${station.name}, ${summaryMeta}` : station.name;
  const summaryLabel = isPreviewing
    ? m.station_summary_previewing({ name: summaryName })
    : isUnavailable
      ? m.station_summary_offline({ name: summaryName })
      : summaryName;
  const labelWithSelection = isSelected ? `${summaryLabel}, ${m.selection_suffix()}` : summaryLabel;

  const previewLabel = isPreviewing
    ? m.station_preview_stop({ name: station.name })
    : m.station_preview_play({ name: station.name });
  const addLabel = isAdded ? m.browser_added() : m.browser_add_station({ name: station.name });

  const metaCells: {
    kind: Exclude<SegmentKind, "summary">;
    show: boolean;
    role: string;
    value: string;
  }[] = [
    { kind: "country",    show: !!station.country,    role: m.segment_country(),    value: station.country },
    { kind: "language",   show: !!station.language,   role: m.segment_language(),   value: station.language },
    { kind: "codec",      show: !!station.codec,      role: m.segment_codec(),      value: station.codec },
    { kind: "bitrate",    show: !!station.bitrate,    role: m.segment_bitrate(),    value: `${station.bitrate} kbps` },
    { kind: "genre",      show: !!station.tags,       role: m.segment_genre(),      value: station.tags },
    { kind: "popularity", show: !!station.clickcount, role: m.segment_popularity(), value: String(station.clickcount) },
  ];

  return (
    <CompositeRow
      itemId={station.stationuuid}
      isFocused={isFocused}
      isActiveRow={isActiveRow}
      label={labelWithSelection}
      selected={isSelected}
      roleDescription={m.item_role_station()}
      keyshortcuts="Shift+Enter"
      className="border-b border-slate-800 px-3 py-2 data-[selected=true]:bg-sky-900/40 data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-sky-400/40 forced-colors:border-[ButtonText] forced-colors:data-[selected=true]:bg-[Highlight] forced-colors:data-[selected=true]:text-[HighlightText]"
      activeClassName="bg-slate-800/60"
    >
      {/* Line 1: name + action buttons */}
      <div className="flex items-center gap-2">
        {isUnavailable && (
          <TriangleAlert size={14} aria-hidden className="shrink-0 text-amber-500 forced-colors:text-[Highlight]" />
        )}
        <span
          className={`truncate font-medium ${
            isUnavailable ? "text-slate-400 line-through decoration-slate-600" : "text-slate-100"
          }`}
        >
          {station.name}
        </span>
        <div className="ml-auto flex shrink-0 gap-1">
          <CompositeAction
            itemId={station.stationuuid}
            segment="action-play"
            isFocused={isFocused}
            ariaPressed={isPreviewing}
            onClick={handlePreviewToggle}
            label={previewLabel}
            title={previewLabel}
            className={`inline-flex items-center justify-center rounded-md p-1.5 ${
              isPreviewing
                ? "bg-blue-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                : "bg-slate-700 text-slate-200 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
            }`}
          >
            {isPreviewing ? <Square size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </CompositeAction>
          <button
            type="button"
            data-item-id={station.stationuuid}
            data-segment="action-add"
            tabIndex={isFocused("action-add") ? 0 : -1}
            aria-disabled={isAdded || undefined}
            aria-label={addLabel}
            title={addLabel}
            onClick={() => {
              if (!isAdded) onAdd();
            }}
            className={`inline-flex items-center justify-center rounded-md p-1.5 ${COMPOSITE_FOCUS_RING} ${
              isAdded
                ? "cursor-not-allowed text-emerald-400"
                : "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            }`}
          >
            {isAdded ? <Check size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
          </button>
        </div>
      </div>

      {/* Line 2: per-value metadata stops */}
      <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-slate-400">
        {metaCells
          .filter((c) => c.show)
          .map((c) => (
            <CompositeSegment
              key={c.kind}
              itemId={station.stationuuid}
              segment={c.kind}
              isFocused={isFocused}
              label={c.value}
              roleDescription={c.role}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
            >
              <span className="text-slate-500">{SEGMENT_ICONS[c.kind]}</span>
              <span>{c.value}</span>
            </CompositeSegment>
          ))}
      </div>
    </CompositeRow>
  );
}
