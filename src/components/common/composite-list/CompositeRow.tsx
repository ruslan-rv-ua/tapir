import type { CSSProperties, ReactNode } from "react";
import type { ActionModifiers, SegmentKind } from "../../../hooks/useCompositeList";

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
  /**
   * Primary action for a mouse double-click anywhere on the row except its own
   * interactive controls (buttons/links/inputs), which keep their native click
   * behaviour. Mirrors the keyboard "primary" action (Enter on the summary),
   * including the held Shift/Ctrl modifiers.
   */
  onActivate?: (modifiers: ActionModifiers) => void;
  /**
   * aria-keyshortcuts advertised on the summary stop (e.g. "F5 Shift+F5 Alt+Enter").
   *
   * Token ORDER is not semantic — assistive tech reads the set, not the sequence.
   * The rule exists only so the string stays stable from edit to edit:
   *   1. keys specific to THIS list first, then the app-wide fixed Enter combos;
   *   2. inside a group, the bare key before its modified variants.
   * Modifier tokens follow ARIA ("Control", not "Ctrl").
   */
  keyshortcuts?: string;
  /** Marks the row as selected — sets data-selected for CSS + assistive parity. */
  selected?: boolean;
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
  onActivate,
  keyshortcuts,
  selected,
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
      aria-keyshortcuts={keyshortcuts}
      data-selected={selected ? "true" : undefined}
      className={[className, isActiveRow ? activeClassName : ""].filter(Boolean).join(" ")}
      style={style}
      onDoubleClick={
        onActivate &&
        ((e) => {
          // Let the row's own controls handle their own activation.
          if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
          onActivate({ shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
        })
      }
    >
      {children}
    </li>
  );
}
