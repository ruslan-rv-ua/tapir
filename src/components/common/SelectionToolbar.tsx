import type React from "react";
import * as m from "../../i18n/paraglide/messages";

interface SelectionToolbarProps {
  selCount: number;
  visibleCount: number;
  allVisibleSelected: boolean;
  selectAllRef: React.RefObject<HTMLButtonElement | null>;
  actionRef: React.RefObject<HTMLButtonElement | null>;
  /** Controlled roving tabIndex; omit for a focus-boundary zone (natural tab order). */
  selectAllTabIndex?: 0 | -1;
  actionTabIndex?: 0 | -1;
  /** Full action label incl. count (visible text === accessible name, WCAG 2.5.3). */
  actionLabel: string;
  onSelectAll: () => void;
  onAction: () => void;
}

/**
 * Selection cluster for lists with exactly ONE bulk action: a select-all toggle
 * (mirror of Ctrl+A), one action button, and a non-live count span. Two roving
 * stops (select-all, action). aria-disabled (NOT native disabled) keeps both
 * buttons focusable/discoverable; activation is gated so a disabled action
 * no-ops. Streams keeps its 3-action SelectionActionsMenu — not this.
 */
export function SelectionToolbar({
  selCount,
  visibleCount,
  allVisibleSelected,
  selectAllRef,
  actionRef,
  selectAllTabIndex,
  actionTabIndex,
  actionLabel,
  onSelectAll,
  onAction,
}: SelectionToolbarProps) {
  const selectAllDisabled = visibleCount === 0;
  const actionDisabled = selCount === 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        ref={selectAllRef}
        tabIndex={selectAllTabIndex}
        aria-disabled={selectAllDisabled || undefined}
        onClick={() => { if (!selectAllDisabled) onSelectAll(); }}
        className={`shrink-0 whitespace-nowrap rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
          selectAllDisabled ? "cursor-not-allowed text-slate-600" : "text-slate-400 hover:bg-slate-800"
        }`}
      >
        {allVisibleSelected ? m.clear_selection() : m.select_all()}
      </button>

      <button
        ref={actionRef}
        tabIndex={actionTabIndex}
        aria-disabled={actionDisabled || undefined}
        aria-label={actionLabel}
        onClick={() => { if (!actionDisabled) onAction(); }}
        className={`shrink-0 whitespace-nowrap rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] ${
          actionDisabled ? "cursor-not-allowed text-slate-600" : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {actionLabel}
      </button>

      {/* Plain (NOT live) count — read in browse mode; the central announce() on
          each gesture is the only spoken update. */}
      {selCount > 0 && (
        <span className="text-xs text-slate-400">{m.selected_count_label({ count: selCount })}</span>
      )}
    </div>
  );
}
