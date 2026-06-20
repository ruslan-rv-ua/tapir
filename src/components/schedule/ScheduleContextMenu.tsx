import { Button, Menu, MenuItem, MenuTrigger, Popover, Separator } from "react-aria-components";
import type { Key } from "react";
import type { ScheduleDto } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

export type ScheduleAction = "edit" | "toggle" | "delete";

interface Props {
  schedule: ScheduleDto;
  /** True when the menu trigger is the active 'action-menu' focus stop. */
  menuFocused: boolean;
  selectionCount: number;
  onAction: (action: ScheduleAction) => void;
}

const ITEM_CLS =
  "cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]";

export function ScheduleContextMenu({ schedule, menuFocused, selectionCount, onAction }: Props) {
  return (
    <MenuTrigger>
      <Button
        excludeFromTabOrder={!menuFocused}
        data-item-id={schedule.id}
        data-segment="action-menu"
        data-context-menu-trigger
        aria-label={m.schedule_action_menu()}
        className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
      >
        ⋯
      </Button>
      <Popover>
        <Menu
          aria-label={m.schedule_context_menu()}
          onAction={(key: Key) => onAction(key as ScheduleAction)}
          className="min-w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl outline-none forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]"
        >
          <MenuItem id="edit" className={ITEM_CLS}>{m.schedule_action_edit()}</MenuItem>
          <MenuItem id="toggle" className={ITEM_CLS}>
            {schedule.enabled ? m.schedule_action_disable() : m.schedule_action_enable()}
          </MenuItem>
          <Separator className="my-1 border-t border-slate-700" />
          <MenuItem id="delete" className={`${ITEM_CLS} text-red-400`}>
            {selectionCount > 0 ? m.delete_selected({ count: selectionCount }) : m.schedule_action_delete()}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
