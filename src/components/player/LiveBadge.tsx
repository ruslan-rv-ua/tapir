import { RadioTower } from "lucide-react";
import * as m from "../../i18n/paraglide/messages";

/**
 * The badge that names the kind of source: a station on air, as opposed to the
 * neutral «Файл» / "File" of {@link RecordingBadge}. The two are one axis and
 * now look like it — a static pill each, differing in word, colour and icon.
 *
 * Deliberately not red, and deliberately not pulsing. `docs/accessibility.md`
 * assigns colour *plus* text *plus* pulsation to one fact — that a recording is
 * running — and `StreamItem` spends exactly that vocabulary on it: a pulsing
 * red dot while bytes reach the disk, a red row fill, a red record button. A
 * player badge built from the same three signals said "recording" to the eye
 * while nothing was being recorded. Emerald is free of that history (its only
 * other use marks a station already added), and the tower carries the meaning
 * the dot never did. `Radio` and `Signal` are taken too — by the Streams
 * section in the activity bar and by the bitrate in the catalogue.
 *
 * The icon is decoration: `aria-label` on the pill and the word inside it are
 * what a screen reader reads, and neither changed with the repaint.
 */
export function LiveBadge() {
  return (
    <span
      aria-label={m.live_stream()}
      className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-0.5
                 rounded-full bg-emerald-500/15 border border-emerald-500/30
                 text-emerald-300 text-xs font-bold tracking-widest uppercase
                 forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
    >
      <RadioTower
        size={12}
        aria-hidden
        className="shrink-0 forced-colors:text-[ButtonText]"
      />
      {m.live_stream_short()}
    </span>
  );
}
