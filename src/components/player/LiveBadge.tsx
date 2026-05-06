import * as m from "../../i18n/paraglide/messages";

export function LiveBadge() {
  return (
    <span
      aria-label={m.live_stream()}
      className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-0.5
                 rounded-full bg-red-500/15 border border-red-500/30
                 text-red-300 text-xs font-bold tracking-widest uppercase
                 forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
    >
      <span
        aria-hidden="true"
        className="w-2 h-2 rounded-full bg-red-500 shrink-0
                   motion-safe:animate-live-pulse
                   forced-colors:bg-[ButtonText]"
      />
      {m.live_stream_short()}
    </span>
  );
}
