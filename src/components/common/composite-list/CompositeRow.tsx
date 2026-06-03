import type { CSSProperties, ReactNode } from "react";
import type { SegmentKind } from "../../../hooks/useCompositeList";

interface CompositeRowProps {
  itemId: string;
  /** Row-bound focus predicate from CompositeList's renderRow. */
  isFocused: (segment: SegmentKind) => boolean;
  /** This row is the active item — applies activeClassName for a context highlight. */
  isActiveRow?: boolean;
  /** Whole-row accessible name. */
  label: string;
  /** Announced by NVDA via aria-roledescription (e.g. "stream", "profile"). */
  roleDescription?: string;
  className?: string;
  /** Appended when isActiveRow is true. */
  activeClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * The 'summary' (whole-row) focus stop. role="listitem" is EXPLICIT: under the
 * list's role="application" parent the <li>'s implicit listitem role is dropped,
 * leaving NVDA with nothing to announce. The whole-row focus ring comes from the
 * global [tabindex]:focus-visible rule in styles.css, so no ring class here.
 */
export function CompositeRow({
  itemId,
  isFocused,
  isActiveRow,
  label,
  roleDescription,
  className,
  activeClassName,
  style,
  children,
}: CompositeRowProps) {
  return (
    <li
      role="listitem"
      data-item-id={itemId}
      data-segment="summary"
      tabIndex={isFocused("summary") ? 0 : -1}
      aria-label={label}
      aria-roledescription={roleDescription}
      className={[className, isActiveRow ? activeClassName : ""].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </li>
  );
}
