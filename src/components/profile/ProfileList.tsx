import { forwardRef, useMemo } from "react";
import { CompositeList } from "../common/composite-list";
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

  return (
    <CompositeList<ProfileListHandle>
      ref={ref}
      zoneId="profiles-list"
      ariaLabel={m.zone_profiles_list()}
      items={items}
      className="flex-1 overflow-y-auto overflow-x-hidden pt-1"
      onTabOut={exitZone}
      imperativeExtra={({ focusItem }) => ({
        focusProfile: (name: string) => focusItem(name, "summary"),
      })}
      onAction={(type, itemId, segment) => {
        if (type === "delete") {
          onDelete(itemId);
          return;
        }
        if (type === "contextMenu") {
          const btn = document.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
          );
          btn?.click();
          return;
        }
        // Enter/Space on the whole-row summary switches to that profile.
        if ((type === "primary" || type === "toggle") && segment === "summary") {
          onSwitch(itemId);
        }
      }}
      renderRow={({ id, isActive, isFocused }) => {
        const profile = profiles.find((p) => p.name === id)!;
        return (
          <ProfileItem
            key={id}
            profile={profile}
            activeProfile={activeProfile}
            isActiveRow={isActive}
            isFocused={isFocused}
            onSwitch={onSwitch}
            onDuplicate={onDuplicate}
            onRename={onRename}
            onDelete={onDelete}
            onExport={onExport}
          />
        );
      }}
    />
  );
});
ProfileList.displayName = "ProfileList";
