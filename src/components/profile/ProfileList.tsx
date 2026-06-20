import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { CompositeList } from "../common/composite-list";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { useListSelection } from "../../hooks/useListSelection";
import { useAnnounce } from "../../hooks/useAnnounce";
import { computeBulkFocusTarget } from "../../lib/bulkFocus";
import { $profileList, $profilesSelection } from "../../stores/profileManager";
import { replaceSelection } from "../../stores/selection";
import type { ProfileMeta } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import { ProfileItem, getProfileSegments } from "./ProfileItem";
import * as m from "../../i18n/paraglide/messages";

export interface ProfileListHandle extends ZoneEntry {
  /** Move focus to a specific profile row's summary (used after create/rename/switch). */
  focusProfile: (name: string) => void;
  /** Open the bulk-delete confirm dialog (used by the header toolbar). */
  requestBulkDelete: () => void;
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
  const selectedSet = useStore($profilesSelection);
  const announce = useAnnounce();
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const pendingBulkFocusRef = useRef<string | null>(null);
  const [bulkSeq, setBulkSeq] = useState(0);
  const focusItemRef = useRef<((id: string, segment?: SegmentKind) => void) | null>(null);

  const resolveName = useCallback((name: string) => name, []);
  const { selectionAdapter, onSelectionChange } = useListSelection<ProfileMeta>({
    $selection: $profilesSelection,
    announce,
    resolveName,
    allItems: profiles, // membership stable on switch — prune only drops vanished
    getId: (p) => p.name,
  });

  const items = useMemo(
    () => profiles.map((p) => ({ id: p.name, segments: getProfileSegments(p, activeProfile) })),
    [profiles, activeProfile],
  );

  // Programmatic focus after a bulk delete (mirror SongsList).
  useLayoutEffect(() => {
    const targetId = pendingBulkFocusRef.current;
    if (!targetId) return;
    pendingBulkFocusRef.current = null;
    focusItemRef.current?.(targetId, "summary");
  }, [items, bulkSeq]);

  const handleConfirmBulkDelete = async () => {
    const names = [...$profilesSelection.get()];
    if (names.length === 0) { setBulkConfirmOpen(false); return; }
    const visible = profiles; // snapshot before await
    try {
      const res = await tauri.deleteProfiles(names);
      const removedIds = new Set(res.deleted);
      if (removedIds.size > 0) {
        $profileList.set($profileList.get().filter((p) => !removedIds.has(p.name)));
        replaceSelection($profilesSelection, new Set());
        const target = computeBulkFocusTarget(visible.map((p) => ({ id: p.name })), removedIds);
        if (target !== null) pendingBulkFocusRef.current = target; // active always survives
        setBulkSeq((n) => n + 1);
      }
      const parts = [m.profiles_removed_bulk({ count: res.deleted.length })];
      if (res.skippedActive) parts.push(m.bulk_skipped_active());
      announce(parts.join(", "), "polite");
    } catch (err) {
      addToast(String(err), "error");
    }
    setBulkConfirmOpen(false);
  };

  const imperativeExtra = useCallback(
    ({ focusItem }: { focusItem: (id: string, segment?: SegmentKind) => void }) => {
      // Stash the latest focusItem; the handle is rebuilt on items change, so this
      // ref always points at a focusItem that knows the post-delete item set.
      focusItemRef.current = focusItem;
      return {
        focusProfile: (name: string) => focusItem(name, "summary"),
        requestBulkDelete: () => setBulkConfirmOpen(true),
      };
    },
    [],
  );

  return (
    <>
      <CompositeList<ProfileListHandle>
        ref={ref}
        imperativeExtra={imperativeExtra}
        zoneId="profiles-list"
        ariaLabel={m.zone_profiles_list()}
        items={items}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onTabOut={exitZone}
        selection={selectionAdapter}
        onSelectionChange={onSelectionChange}
        onAction={(type, itemId, segment) => {
          if (type === "delete") {
            if ($profilesSelection.get().size > 0) setBulkConfirmOpen(true);
            else onDelete(itemId);
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
              isSelected={selectedSet.has(id)}
              selectionCount={selectedSet.has(id) ? selectedSet.size : 0}
              isFocused={isFocused}
              onSwitch={onSwitch}
              onDuplicate={onDuplicate}
              onRename={onRename}
              onDelete={(name) => {
                if ($profilesSelection.get().has(name)) setBulkConfirmOpen(true);
                else { replaceSelection($profilesSelection, new Set([name])); onDelete(name); }
              }}
              onExport={onExport}
            />
          );
        }}
      />
      {bulkConfirmOpen &&
        createPortal(
          <ConfirmDialog
            title={m.profile_delete()}
            message={m.confirm_delete_selected_profiles({ count: selectedSet.size })}
            confirmLabel={m.profile_delete()}
            onConfirm={handleConfirmBulkDelete}
            onCancel={() => setBulkConfirmOpen(false)}
          />,
          document.body,
        )}
    </>
  );
});
ProfileList.displayName = "ProfileList";
