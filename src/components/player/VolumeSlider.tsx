import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Slider, SliderThumb, SliderTrack } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import { $settings } from "../../stores/settings";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { useAnnounce } from "../../hooks/useAnnounce";

interface VolumeSliderProps {
  inputRef?: RefObject<HTMLInputElement | null>;
  onNavigate?: (direction: 'prev' | 'next' | 'first' | 'last') => void;
}

export function VolumeSlider({ inputRef, onNavigate }: VolumeSliderProps) {
  const { volume } = useStore($playerStatus);
  const step = useStore($settings)?.volumeStepPercent ?? 5;
  const announce = useAnnounce();
  const storePercent = Math.round(volume * 100);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const percent = dragPercent ?? storePercent;
  // RAC onChangeEnd only fires on pointer-up, not on keyboard. Track drag state so
  // onChange can commit immediately for keyboard while deferring to onChangeEnd for drag.
  const isDraggingRef = useRef(false);

  // RAC controls the input's tabIndex internally; patch it after every render so that
  // any RAC re-render cannot silently return the input to the Tab order.
  // No dep array: VolumeSlider always renders (no conditional mount), so the overhead
  // is a single synchronous DOM write per render — negligible and safe.
  useEffect(() => {
    const input = inputRef?.current;
    if (!input) return;
    input.tabIndex = -1;
  });

  return (
    <Slider
      aria-label={m.volume()}
      minValue={0}
      maxValue={100}
      value={percent}
      step={1}
      onChange={(v) => {
        setDragPercent(v);
        if (!isDraggingRef.current) {
          tauri.setVolume(v / 100).catch((e) => { console.error(e); announce(m.playback_error(), "assertive"); });
        }
      }}
      onChangeEnd={(v) => {
        isDraggingRef.current = false;
        setDragPercent(null);
        tauri.setVolume(v / 100).catch((e) => { console.error(e); announce(m.playback_error(), "assertive"); });
      }}
      className="flex items-center gap-2 w-full"
    >
      <SliderTrack className="relative h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/70 pointer-events-none forced-colors:bg-[ButtonText]"
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        />
        <SliderThumb
          inputRef={inputRef}
          aria-valuetext={`${percent}%`}
          onPointerDown={() => { isDraggingRef.current = true; }}
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
              // No-op: block browser/RAC default (spec §4 — PageUp/Down are no-ops on sliders).
              e.preventDefault(); e.stopPropagation();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault(); e.stopPropagation();
              const newVol = Math.min(1, (volume * 100 + step) / 100);
              tauri.setVolume(newVol).catch((e) => { console.error(e); announce(m.playback_error(), "assertive"); });
            } else if (e.key === 'ArrowDown') {
              e.preventDefault(); e.stopPropagation();
              const newVol = Math.max(0, (volume * 100 - step) / 100);
              tauri.setVolume(newVol).catch((e) => { console.error(e); announce(m.playback_error(), "assertive"); });
            }
          }}
          className="w-3.5 h-3.5 rounded-full bg-white top-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
        />
      </SliderTrack>
    </Slider>
  );
}
