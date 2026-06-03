import type { ReactNode } from "react";
import type { SegmentKind } from "../../../hooks/useCompositeList";
import { COMPOSITE_FOCUS_RING } from "./CompositeSegment";

interface CompositeActionProps {
  itemId: string;
  segment: SegmentKind;
  isFocused: (segment: SegmentKind) => boolean;
  label: string;
  onClick: () => void;
  className?: string;
  title?: string;
  ariaPressed?: boolean;
  ariaDisabled?: boolean;
  children: ReactNode;
}

/**
 * A per-button action focus stop. Native <button> so it self-activates on
 * Enter/Space/click; the hook stays out of the way for native controls.
 */
export function CompositeAction({
  itemId,
  segment,
  isFocused,
  label,
  onClick,
  className,
  title,
  ariaPressed,
  ariaDisabled,
  children,
}: CompositeActionProps) {
  return (
    <button
      type="button"
      data-item-id={itemId}
      data-segment={segment}
      tabIndex={isFocused(segment) ? 0 : -1}
      onClick={onClick}
      aria-label={label}
      aria-pressed={ariaPressed}
      aria-disabled={ariaDisabled}
      title={title}
      className={[className, COMPOSITE_FOCUS_RING].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
