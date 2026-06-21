import type React from "react";
import { Menu, MenuItem, MenuTrigger, Popover, Button, Separator } from "react-aria-components";
import { ArrowRightLeft, Copy, Pencil, Trash2, Upload } from "lucide-react";
import type { ProfileMeta } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  profile: ProfileMeta;
  isActive: boolean;
  isDefault: boolean;
  /** True when the trigger is the active 'action-menu' focus stop. */
  menuFocused: boolean;
  selectionCount: number;
  onSwitch: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onExport: () => void;
}

export function ProfileContextMenu({
  profile, isActive, isDefault, menuFocused, selectionCount,
  onSwitch, onDuplicate, onRename, onDelete, onExport,
}: Props) {
  const handleAction = (key: React.Key) => {
    switch (key) {
      case "switch": onSwitch(); break;
      case "duplicate": onDuplicate(); break;
      case "rename": onRename(); break;
      case "delete": onDelete(); break;
      case "export": onExport(); break;
    }
  };

  const itemClass =
    "cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40";

  return (
    <MenuTrigger>
      <Button
        // Roving focus stop: tabbable only while it is the active 'action-menu' segment.
        excludeFromTabOrder={!menuFocused}
        data-item-id={profile.name}
        data-segment="action-menu"
        data-context-menu-trigger
        aria-label={m.profile_actions({ name: profile.name })}
        title={m.profile_actions({ name: profile.name })}
        className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
      >
        ⋯
      </Button>
      <Popover>
        <Menu
          aria-label={m.profile_context_menu()}
          onAction={handleAction}
          className="min-w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl outline-none"
        >
          <MenuItem id="switch" isDisabled={isActive} className={itemClass}>
            <span aria-hidden="true" className="mr-2 inline-flex"><ArrowRightLeft size={14} /></span>{m.profile_switch()}
          </MenuItem>
          <MenuItem id="duplicate" className={itemClass}>
            <span aria-hidden="true" className="mr-2 inline-flex"><Copy size={14} /></span>{m.profile_duplicate()}
          </MenuItem>
          <MenuItem id="rename" isDisabled={isDefault || isActive} className={itemClass}>
            <span aria-hidden="true" className="mr-2 inline-flex"><Pencil size={14} /></span>{m.profile_rename()}
          </MenuItem>
          <MenuItem id="delete" isDisabled={isDefault || isActive} className={`${itemClass} text-red-400 forced-colors:text-[CanvasText]`}>
            <span aria-hidden="true" className="mr-2 inline-flex"><Trash2 size={14} /></span>{selectionCount > 0 ? m.delete_selected({ count: selectionCount }) : m.profile_delete()}
          </MenuItem>
          <Separator className="my-1 border-t border-slate-700" />
          <MenuItem id="export" className={itemClass}>
            <span aria-hidden="true" className="mr-2 inline-flex"><Upload size={14} /></span>{m.profile_export()}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
