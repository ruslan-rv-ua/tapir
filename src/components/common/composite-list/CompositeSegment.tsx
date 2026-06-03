import type { CSSProperties, ReactNode } from "react";
import type { SegmentKind } from "../../../hooks/useCompositeList";

/** Shared roving focus ring for read-only segments and action buttons. */
export const COMPOSITE_FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]";

interface CompositeSegmentProps {
  itemId: string;
  segment: SegmentKind;
  isFocused: (segment: SegmentKind) => boolean;
  /** Value only — the segment *type* is announced via roleDescription. */
  label?: string;
  roleDescription?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * A read-only segment focus stop. role="group" is deliberate: a roleless named
 * <div> is exposed by Chromium as a "section" and read by NVDA as "розділ".
 * role="group" + aria-roledescription makes NVDA read e.g. "192 kbps, tech info".
 */
export function CompositeSegment({
  itemId,
  segment,
  isFocused,
  label,
  roleDescription,
  className,
  style,
  children,
}: CompositeSegmentProps) {
  return (
    <div
      role="group"
      data-item-id={itemId}
      data-segment={segment}
      tabIndex={isFocused(segment) ? 0 : -1}
      aria-label={label}
      aria-roledescription={roleDescription}
      className={[className, COMPOSITE_FOCUS_RING].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}
