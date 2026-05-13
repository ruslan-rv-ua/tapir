import { useEffect } from "react";
import type { RefObject } from "react";
import { ProgressBar, Slider, SliderThumb, SliderTrack } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface PlaybackPositionProps {
  inputRef?: RefObject<HTMLInputElement | null>;
  onNavigate?: (direction: 'prev' | 'next' | 'first' | 'last') => void;
}

export function PlaybackPosition({ inputRef, onNavigate }: PlaybackPositionProps) {
  const status = useStore($playerStatus);

  const { source, state, positionMs, durationMs } = status;

  const isLive = source?.type === "stream";
  const isPlaying = state === "playing";
  const isPaused = state === "paused";
  const isActive = isPlaying || isPaused;

  // Patch tabIndex after every render — slider conditionally mounts, so ref.current
  // becomes available at an unpredictable render. No dep array ensures we patch
  // whenever the input is present.
  useEffect(() => {
    const input = inputRef?.current;
    if (!input) return;
    input.tabIndex = -1;
  });

  if (!isActive) {
    return null;
  }

  if (isLive) {
    const pct = (positionMs ?? 0) / Math.max(durationMs ?? 1, 1);
    return (
      <ProgressBar
        aria-label={m.playback_position()}
        value={pct * 100}
        minValue={0}
        maxValue={100}
        className="flex items-center gap-2 w-full"
      >
        {() => (
          <div className="relative h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/40 pointer-events-none forced-colors:bg-[ButtonText]"
              style={{ width: `${pct * 100}%` }}
            />
          </div>
        )}
      </ProgressBar>
    );
  }

  const duration = durationMs ?? 0;
  const position = positionMs ?? 0;

  return (
    <Slider
      aria-label={m.playback_position()}
      minValue={0}
      maxValue={duration}
      value={position}
      step={1000}
      onChange={(v) => tauri.seekPlayback(v).catch(console.error)}
      className="flex items-center gap-2 w-full"
    >
      <SliderTrack className="relative h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/70 pointer-events-none forced-colors:bg-[ButtonText]"
          style={{ width: `${duration > 0 ? (position / duration) * 100 : 0}%` }}
          aria-hidden="true"
        />
        <SliderThumb
          inputRef={inputRef}
          aria-valuetext={formatTime(position)}
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
          className="w-3.5 h-3.5 rounded-full bg-white top-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
        />
      </SliderTrack>
    </Slider>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
