import type { ReactNode } from "react";

/**
 * Screen title row: a single source of truth for the per-screen <h1> and its
 * optional trailing action controls. Keeps title placement/typography identical
 * across screens. See docs/FRD-navigation.md §6.1.1 and §7.1.3.
 *
 * Invariant: every screen renders exactly one ScreenHeader as its <h1>.
 * Placement depends on whether the header carries actions (§7.1.3):
 *   - no actions  → render standalone at the top of the screen region; the <h1>
 *     is structural (not focusable) and not part of any zone (e.g. Browser, Songs);
 *   - has actions → render INSIDE the screen's first zone so the trailing controls
 *     join that zone's roving focus (e.g. Streams, Profiles toolbar).
 * The header is never a zone of its own.
 */
interface ScreenHeaderProps {
  /** Visible screen title, rendered as the screen's <h1>. */
  title: string;
  /** Optional action controls aligned to the trailing edge. */
  children?: ReactNode;
}

export function ScreenHeader({ title, children }: ScreenHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <h1 className="text-base font-semibold text-slate-100">{title}</h1>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
