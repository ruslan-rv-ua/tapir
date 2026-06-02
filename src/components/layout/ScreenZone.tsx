import { forwardRef } from "react";
import type { ReactNode, KeyboardEventHandler } from "react";

/**
 * Container for a navigable screen zone. Enforces the invariant that every zone
 * carries a stable id (for F6 / Tab cycling) AND an accessible name (announced
 * on entry) — the gap that previously let zones ship unnamed.
 *
 * `role` selects the intra-zone navigation pattern (see docs/FRD-navigation.md §6.1.1):
 *   - "application" — composite/toolbar zone navigated with arrow keys (roving focus);
 *   - "search"      — search/filter form zone (native Tab between fields);
 *   - "group"       — other mixed/form-like zone (native Tab).
 *
 * The bottom divider is intrinsic so every zone shares the same separator.
 */
interface ScreenZoneProps {
  /** Unique; mirrored to data-zone-id and used by the zone cycler. */
  id: string;
  /** Accessible name announced when focus enters the zone. Required by design. */
  label: string;
  role: "application" | "search" | "group";
  /** Layout classes for the zone container (the divider is added automatically). */
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  children: ReactNode;
}

export const ScreenZone = forwardRef<HTMLDivElement, ScreenZoneProps>(
  function ScreenZone({ id, label, role, className, onKeyDown, children }, ref) {
    return (
      <div
        ref={ref}
        data-zone-id={id}
        role={role}
        aria-label={label}
        className={
          "border-b border-slate-700 forced-colors:border-[ButtonText]" +
          (className ? " " + className : "")
        }
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    );
  },
);
