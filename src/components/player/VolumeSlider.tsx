import { useState } from "react";
import { Slider, SliderThumb, SliderTrack } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

export function VolumeSlider() {
  const { volume } = useStore($playerStatus);
  const storePercent = Math.round(volume * 100);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const percent = dragPercent ?? storePercent;

  return (
    <Slider
      aria-label={m.volume()}
      minValue={0}
      maxValue={100}
      value={percent}
      step={1}
      onChange={(v) => setDragPercent(v)}
      onChangeEnd={(v) => {
        setDragPercent(null);
        tauri.setVolume(v / 100).catch(console.error);
      }}
      className="flex items-center gap-2 w-32"
    >
      <SliderTrack className="relative h-1 w-full rounded bg-slate-600">
        <SliderThumb
          aria-valuetext={`${percent}%`}
          className="w-3 h-3 rounded-full bg-white top-1/2 -translate-y-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
        />
      </SliderTrack>
    </Slider>
  );
}
