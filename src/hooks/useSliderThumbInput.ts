import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * The two attributes React Aria owns on a slider's hidden `<input type="range">`
 * and this app has to override, in one place. Returns the ref to hand to
 * `<SliderThumb inputRef={…}>`.
 *
 * - **`tabIndex`** — RAC keeps the input in the Tab order; the player zone uses
 *   roving focus (`usePlayerZoneNav`), so `Tab` must leave the zone instead of
 *   walking into a slider.
 * - **`aria-valuetext`** — `useSliderThumb` hard-sets it from
 *   `state.getThumbValueLabel(index)` and never forwards an `aria-valuetext`
 *   prop off `<SliderThumb>`, so the app's own wording could not reach a screen
 *   reader at all: the position was read as its raw millisecond count
 *   ("135,000") and the volume as a bare "45". `formatOptions` is not a way out
 *   either — `style: "percent"` on a 0–100 slider yields "4 500%", and no `Intl`
 *   option can produce «2 хв 14 с».
 *
 * `valueText` is the same variable the caller renders on screen, which is what
 * makes the two carriers unable to drift apart (ADR 2026-08-31 §6).
 *
 * Layout, not passive: the position ticks once a second off a backend event, and
 * a passive effect would leave RAC's own label exposed to a screen reader sitting
 * on the thumb until after the paint. No dep array — RAC rewrites both attributes
 * on every render of its own, so every render has to re-apply them.
 */
export function useSliderThumbInput(
  valueText: string,
  inputRef?: RefObject<HTMLInputElement | null>,
): RefObject<HTMLInputElement | null> {
  // The player panel passes its own ref (each slider is an F6 focus stop); the
  // fallback keeps the patch working for any caller that doesn't need one.
  const ownRef = useRef<HTMLInputElement | null>(null);
  const ref = inputRef ?? ownRef;

  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.tabIndex = -1;
    input.setAttribute("aria-valuetext", valueText);
  });

  return ref;
}
