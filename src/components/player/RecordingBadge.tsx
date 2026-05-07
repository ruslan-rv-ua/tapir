import * as m from "../../i18n/paraglide/messages";

export function RecordingBadge() {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5
                 rounded-full bg-slate-500/15 border border-slate-500/25
                 text-slate-400 text-xs font-semibold
                 forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]
                 shrink-0"
    >
      {m.player_recording_badge()}
    </span>
  );
}
