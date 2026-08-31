import { useRef, useState } from "react";
import type { RefObject } from "react";
import { ProgressBar, Slider, SliderThumb, SliderTrack } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { useAnnounce } from "../../hooks/useAnnounce";
import { formatTimeParts } from "../../lib/time";
import { useSliderThumbInput } from "../../hooks/useSliderThumbInput";

interface PlaybackPositionProps {
  inputRef?: RefObject<HTMLInputElement | null>;
  onNavigate?: (direction: 'prev' | 'next' | 'first' | 'last') => void;
}

function formatTime(ms: number): string {
  return m.time_format_min_sec(formatTimeParts(ms));
}

export function PlaybackPosition({ inputRef, onNavigate }: PlaybackPositionProps) {
  const { state, source, positionMs, durationMs } = useStore($playerStatus);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const announce = useAnnounce();
  // Ref mirrors dragPos for synchronous access in event handlers (React state is stale in closures).
  const dragPosRef = useRef<number | null>(null);
  const pos = dragPos ?? positionMs ?? 0;
  // One variable, two carriers (ADR 2026-08-31 §6): the visible number below and
  // the one the screen reader reads off the thumb. Formatting twice would drift
  // apart silently.
  const positionText = formatTime(pos);
  const thumbInputRef = useSliderThumbInput(positionText, inputRef);

  if (state === "stopped" || !source) return null;

  if (source.type === "file") {
    const dur = durationMs ?? 0;

    // Duration unknown — no slider to draw (a track needs a maximum), but the
    // position itself still has to be on screen.
    if (dur === 0) {
      return <div className="text-sm text-slate-400 tabular-nums">{positionText}</div>;
    }

    return (
      <Slider
        aria-label={m.playback_position()}
        minValue={0}
        maxValue={dur}
        step={5000}
        value={pos}
        onChange={(v) => { dragPosRef.current = v; setDragPos(v); }}
        onChangeEnd={(v) => {
          // For mouse: dragPosRef is still set here (onKeyUp won't have cleared it).
          // For keyboard: onKeyUp clears dragPosRef first, so we skip to avoid double-seek.
          if (dragPosRef.current !== null) {
            dragPosRef.current = null;
            setDragPos(null);
            tauri.seekPlayback(v).catch((e) => { console.error(e); announce(m.playback_error(), "assertive"); });
          }
        }}
        className="flex items-center gap-2 flex-1"
      >
        <SliderTrack className="relative h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-400 pointer-events-none forced-colors:bg-[Highlight]"
            style={{ width: `${Math.min((pos / dur) * 100, 100)}%` }}
            aria-hidden="true"
          />
          <SliderThumb
            inputRef={thumbInputRef}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault(); e.stopPropagation();
                onNavigate?.('prev');
              } else if (e.key === 'ArrowRight') {
                e.preventDefault(); e.stopPropagation();
                onNavigate?.('next');
              } else if (e.key === 'Home') {
                e.preventDefault(); e.stopPropagation();
                onNavigate?.('first');
              } else if (e.key === 'End') {
                e.preventDefault(); e.stopPropagation();
                onNavigate?.('last');
              } else if (e.key === 'PageUp' || e.key === 'PageDown') {
                e.preventDefault(); e.stopPropagation();
              }
              // ArrowUp / ArrowDown: pass through to RAC for value adjustment.
            }}
            onKeyUp={(e) => {
              // onChangeEnd may not fire for keyboard in RAC — seek on key release instead.
              // Use dragPosRef (synchronous) rather than dragPos state (stale in closure).
              if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && dragPosRef.current !== null) {
                const target = dragPosRef.current;
                dragPosRef.current = null;
                tauri.seekPlayback(target).catch((e) => { console.error(e); announce(m.playback_error(), "assertive"); });
                // Pre-update store so slider doesn't snap to stale position while backend responds.
                $playerStatus.set({ ...$playerStatus.get(), positionMs: target });
                setDragPos(null);
              }
            }}
            className="w-3 h-3 rounded-full bg-white top-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
          />
        </SliderTrack>
        {/* aria-hidden: the thumb already speaks this exact string, so a second
            copy in the accessibility tree would only be read twice. */}
        <span aria-hidden="true" className="text-sm text-slate-400 tabular-nums shrink-0">
          {positionText}
        </span>
      </Slider>
    );
  }

  // Live stream — indeterminate progress bar (not interactive, no inputRef/onNavigate)
  return (
    <ProgressBar
      aria-label={m.live_stream()}
      isIndeterminate
      className="flex-1"
    >
      {() => (
        <div className="h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
          <div className="h-full w-8 rounded bg-blue-400 animate-pulse forced-colors:bg-[Highlight]" />
        </div>
      )}
    </ProgressBar>
  );
}
