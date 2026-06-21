import { useState } from "react";
import type React from "react";
import { Menu, MenuItem, MenuTrigger, Popover, Button, Separator } from "react-aria-components";
import { Copy, FolderInput } from "lucide-react";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  /** Roving-focus stop ref — the toolbar focuses this button programmatically. */
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  /** True when this is the active roving stop (the single tabbable toolbar element). */
  isActiveStop: boolean;
  selCount: number;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

/**
 * Toolbar overflow for the pure-selection actions (move / copy / delete).
 *
 * Consolidates the former three `aria-disabled` toolbar buttons into one menu
 * (mirrors the row ⋯ menu — StreamContextMenu). Honours the umbrella's
 * "stable, discoverable controls" rule: a single trigger that stays present and
 * focusable, `aria-disabled` (NOT native `disabled`, so roving never skips it)
 * while the selection is empty. Opening is gated so the disabled trigger does
 * nothing on activation. Counts ride the visible text AND every menu item label
 * (WCAG 2.5.3 — the accessible name must not lie about the target).
 */
export function SelectionActionsMenu({ buttonRef, isActiveStop, selCount, onMove, onCopy, onDelete }: Props) {
  const disabled = selCount === 0;
  const [open, setOpen] = useState(false);

  const handleAction = (key: React.Key) => {
    if (disabled) return;
    if (key === "move") onMove();
    else if (key === "copy") onCopy();
    else if (key === "delete") onDelete();
  };

  return (
    <MenuTrigger isOpen={open} onOpenChange={(next) => setOpen(next && !disabled)}>
      <Button
        ref={buttonRef}
        // Roving stop: tabbable only while it is the active toolbar index.
        excludeFromTabOrder={!isActiveStop}
        aria-disabled={disabled || undefined}
        className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] ${
          disabled ? "cursor-not-allowed text-slate-600" : "text-slate-400 hover:bg-slate-800"
        }`}
      >
        {m.selection_actions({ count: selCount })}
        <span aria-hidden="true">▾</span>
      </Button>
      <Popover>
        <Menu
          aria-label={m.selection_actions({ count: selCount })}
          onAction={handleAction}
          className="min-w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl outline-none"
        >
          <MenuItem
            id="move"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            <span aria-hidden="true" className="mr-2 inline-flex"><FolderInput size={14} /></span>
            {m.move_selected({ count: selCount })}
          </MenuItem>
          <MenuItem
            id="copy"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            <span aria-hidden="true" className="mr-2 inline-flex"><Copy size={14} /></span>
            {m.copy_selected({ count: selCount })}
          </MenuItem>
          <Separator className="my-1 border-t border-slate-700" />
          <MenuItem
            id="delete"
            className="cursor-pointer px-3 py-1.5 text-sm text-red-400 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText]"
          >
            <span aria-hidden="true">✕ </span>
            {m.delete_selected({ count: selCount })}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
