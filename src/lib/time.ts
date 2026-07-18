/**
 * Split a millisecond duration into whole minutes + leftover seconds for
 * `m.time_format_min_sec`. Kept Paraglide-free so it is unit-testable.
 */
export function formatTimeParts(ms: number): { min: number; sec: number } {
  const totalSec = Math.floor(ms / 1000);
  return { min: Math.floor(totalSec / 60), sec: totalSec % 60 };
}
