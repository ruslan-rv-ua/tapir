import type React from "react";
import { CheckCircle, ArrowRightLeft, Copy, Pencil, Trash2, Upload } from "lucide-react";
import type { ProfileMeta } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { ProfileContextMenu } from "./ProfileContextMenu";
import { getLocale } from "../../i18n/paraglide/runtime";
import * as m from "../../i18n/paraglide/messages";

export type ProfileSegment =
  | "action-switch"
  | "action-duplicate"
  | "action-rename"
  | "action-delete"
  | "action-export"
  | "action-menu";

/**
 * Compute the Left/Right focus-stop order for a profile row. Disabled actions
 * are omitted entirely — a row never carries a focus stop the user cannot use.
 * 'summary' is implicit (handled by useCompositeList), so it is not listed here.
 */
export function getProfileSegments(profile: ProfileMeta, activeProfile: string): ProfileSegment[] {
  const isActive = profile.name === activeProfile;
  const isDefault = profile.name === "Default";
  const segs: ProfileSegment[] = [];
  if (!isActive) segs.push("action-switch");
  segs.push("action-duplicate");
  if (!isDefault && !isActive) { segs.push("action-rename"); segs.push("action-delete"); }
  segs.push("action-export");
  segs.push("action-menu");
  return segs;
}

function streamCountLabel(count: number): string {
  const category = new Intl.PluralRules(getLocale()).select(count);
  switch (category) {
    case "one": return m.profile_stream_count_one({ count });
    case "few": return m.profile_stream_count_few({ count });
    case "many": return m.profile_stream_count_many({ count });
    default: return m.profile_stream_count_other({ count });
  }
}

interface Props {
  profile: ProfileMeta;
  activeProfile: string;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  /** This row is the composite list's active item — subtle context highlight. */
  isActiveRow: boolean;
  onSwitch: (name: string) => void;
  onDuplicate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  onExport: (name: string) => void;
}

export function ProfileItem({
  profile, activeProfile, isFocused, isActiveRow,
  onSwitch, onDuplicate, onRename, onDelete, onExport,
}: Props) {
  const isActive = profile.name === activeProfile;
  const isDefault = profile.name === "Default";
  const countLabel = streamCountLabel(profile.streamCount);
  // The whole row's accessible name carries every piece of state; the check icon
  // and the count are decorative (aria-hidden) so NVDA reads one clean label.
  const rowLabel = isActive
    ? `${profile.name}, ${m.profile_active_badge()}, ${countLabel}`
    : `${profile.name}, ${countLabel}`;

  return (
    <li
      // Explicit role="listitem": the parent <ul> is role="application", which
      // drops the implicit listitem role and would leave NVDA with nothing to
      // announce on focus. Mirrors StreamItem.
      role="listitem"
      data-item-id={profile.name}
      data-segment="summary"
      tabIndex={isFocused("summary") ? 0 : -1}
      aria-label={rowLabel}
      aria-roledescription={m.item_role_profile()}
      className={`flex items-center gap-2 border-b border-slate-800 px-3 py-2 forced-colors:border-[ButtonText] ${isActiveRow ? "bg-slate-800/60" : ""}`}
    >
      <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isActive ? <CheckCircle size={14} className="text-sky-400 forced-colors:text-[Highlight]" /> : null}
      </span>
      <span className="truncate font-medium text-slate-200">{profile.name}</span>
      <span aria-hidden="true" className="ml-auto text-xs text-slate-500">{countLabel}</span>

      <div role="group" aria-label={m.profile_row_actions({ name: profile.name })} className="flex items-center gap-1">
        {!isActive && (
          <IconButton itemId={profile.name} segment="action-switch" focused={isFocused("action-switch")}
            onClick={() => onSwitch(profile.name)} label={m.profile_switch_named({ name: profile.name })} Icon={ArrowRightLeft} />
        )}
        <IconButton itemId={profile.name} segment="action-duplicate" focused={isFocused("action-duplicate")}
          onClick={() => onDuplicate(profile.name)} label={m.profile_duplicate_named({ name: profile.name })} Icon={Copy} />
        {!isDefault && !isActive && (
          <>
            <IconButton itemId={profile.name} segment="action-rename" focused={isFocused("action-rename")}
              onClick={() => onRename(profile.name)} label={m.profile_rename_named({ name: profile.name })} Icon={Pencil} />
            <IconButton itemId={profile.name} segment="action-delete" focused={isFocused("action-delete")}
              onClick={() => onDelete(profile.name)} label={m.profile_delete_named({ name: profile.name })} Icon={Trash2} />
          </>
        )}
        <IconButton itemId={profile.name} segment="action-export" focused={isFocused("action-export")}
          onClick={() => onExport(profile.name)} label={m.profile_export_named({ name: profile.name })} Icon={Upload} />
        <ProfileContextMenu
          profile={profile}
          isActive={isActive}
          isDefault={isDefault}
          menuFocused={isFocused("action-menu")}
          onSwitch={() => onSwitch(profile.name)}
          onDuplicate={() => onDuplicate(profile.name)}
          onRename={() => onRename(profile.name)}
          onDelete={() => onDelete(profile.name)}
          onExport={() => onExport(profile.name)}
        />
      </div>
    </li>
  );
}

function IconButton({
  itemId, segment, focused, onClick, label, Icon,
}: {
  itemId: string;
  segment: ProfileSegment;
  focused: boolean;
  onClick: () => void;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <button
      data-item-id={itemId}
      data-segment={segment}
      tabIndex={focused ? 0 : -1}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
    >
      <Icon size={14} aria-hidden className="opacity-80" />
    </button>
  );
}
