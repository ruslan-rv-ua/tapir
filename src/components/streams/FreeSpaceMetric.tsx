import { formatBytes, isLowDiskSpace } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  freeBytes: number | null;
  thresholdGb: number;
}

export function FreeSpaceMetric({ freeBytes, thresholdGb }: Props) {
  const low = isLowDiskSpace(freeBytes, thresholdGb);
  const valueText = freeBytes === null ? "—" : formatBytes(freeBytes);

  const ariaLabel =
    freeBytes === null
      ? m.metric_free_space_unavailable()
      : low
        ? m.metric_free_space_low({ space: valueText })
        : `${m.metric_free_space()}: ${valueText}`;

  return (
    <div
      role="status"
      aria-atomic="true"
      aria-label={ariaLabel}
      className={
        "flex flex-col gap-1.5 rounded-2xl border p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas] " +
        (low
          ? "border-amber-500/40 bg-amber-500/[.06] forced-colors:text-[CanvasText]"
          : "border-white/[.06] bg-white/[.04]")
      }
    >
      <strong className={low ? "text-sm text-amber-300" : "text-sm text-slate-100"}>
        {valueText}
      </strong>
      <span className="text-xs text-slate-400">{m.metric_free_space()}</span>
    </div>
  );
}
