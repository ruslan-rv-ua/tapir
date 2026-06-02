import { forwardRef, useImperativeHandle, useMemo } from "react";
import { useCompositeList } from "../../hooks/useCompositeList";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { ProfileMeta } from "../../lib/tauri";
import { ProfileItem, getProfileSegments } from "./ProfileItem";
import * as m from "../../i18n/paraglide/messages";

export interface ProfileListHandle extends ZoneEntry {
  /** Move focus to a specific profile row's summary (used after create/rename/switch). */
  focusProfile: (name: string) => void;
}

interface Props {
  profiles: ProfileMeta[];
  activeProfile: string;
  exitZone: (forward: boolean) => void;
  onSwitch: (name: string) => void;
  onDuplicate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  onExport: (name: string) => void;
}

export const ProfileList = forwardRef<ProfileListHandle, Props>(function ProfileList(
  { profiles, activeProfile, exitZone, onSwitch, onDuplicate, onRename, onDelete, onExport },
  ref,
) {
  const items = useMemo(
    () => profiles.map((p) => ({ id: p.name, segments: getProfileSegments(p, activeProfile) })),
    [profiles, activeProfile],
  );

  const { listRef, onKeyDownCapture, isFocused, restoreFocus, focusItem, activeItemId } =
    useCompositeList({
      zoneId: "profiles-list",
      items,
      onTabOut: exitZone,
      // No onEmpty: a profile list always contains at least "Default", so the
      // empty-while-focused recovery path (used by StreamList) cannot occur here.
      onAction: (type, itemId, segment) => {
        if (type === "delete") { onDelete(itemId); return; }
        if (type === "contextMenu") {
          const btn = listRef.current?.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
          );
          btn?.click();
          return;
        }
        // Enter/Space on the whole-row summary switches to that profile. The panel
        // decides whether it is already active and announces accordingly.
        if ((type === "primary" || type === "toggle") && segment === "summary") {
          onSwitch(itemId);
        }
      },
    });

  useImperativeHandle(ref, () => ({
    id: "profiles-list",
    get el() { return listRef.current!; },
    focus: restoreFocus,
    focusProfile: (name: string) => focusItem(name, "summary"),
  }), [restoreFocus, focusItem]);

  return (
    <ul
      ref={listRef}
      data-zone-id="profiles-list"
      aria-label={m.zone_profiles_list()}
      role="application"
      className="flex-1 overflow-y-auto overflow-x-hidden"
      onKeyDownCapture={onKeyDownCapture}
    >
      {profiles.map((p) => (
        <ProfileItem
          key={p.name}
          profile={p}
          activeProfile={activeProfile}
          isActiveRow={activeItemId === p.name}
          isFocused={(seg) => isFocused(p.name, seg)}
          onSwitch={onSwitch}
          onDuplicate={onDuplicate}
          onRename={onRename}
          onDelete={onDelete}
          onExport={onExport}
        />
      ))}
    </ul>
  );
});
ProfileList.displayName = "ProfileList";
