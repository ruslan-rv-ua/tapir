import { CheckCircle, ArrowRightLeft, Copy, Pencil, Trash2, Upload } from "lucide-react";
import type React from "react";
import type { ProfileMeta } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { CompositeRow, CompositeAction } from "../common/composite-list";
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
  if (!isDefault && !isActive) {
    segs.push("action-rename");
    segs.push("action-delete");
  }
  segs.push("action-export");
  segs.push("action-menu");
  return segs;
}

function streamCountLabel(count: number): string {
  const category = new Intl.PluralRules(getLocale()).select(count);
  switch (category) {
    case "one":
      return m.profile_stream_count_one({ count });
    case "few":
      return m.profile_stream_count_few({ count });
    case "many":
      return m.profile_stream_count_many({ count });
    default:
      return m.profile_stream_count_other({ count });
  }
}

interface Props {
  profile: ProfileMeta;
  activeProfile: string;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  /** This row is the composite list's active item — subtle context highlight. */
  isActiveRow: boolean;
  isSelected?: boolean;
  selectionCount?: number;
  onSwitch: (name: string) => void;
  onDuplicate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  onExport: (name: string) => void;
}

export function ProfileItem({
  profile,
  activeProfile,
  isFocused,
  isActiveRow,
  isSelected = false,
  selectionCount = 0,
  onSwitch,
  onDuplicate,
  onRename,
  onDelete,
  onExport,
}: Props) {
  const isActive = profile.name === activeProfile;
  const isDefault = profile.name === "Default";
  const countLabel = streamCountLabel(profile.streamCount);
  // The whole row's accessible name carries every piece of state; the check icon
  // and the count are decorative (aria-hidden) so NVDA reads one clean label.
  const rowLabel = isActive
    ? `${profile.name}, ${m.profile_active_badge()}, ${countLabel}`
    : `${profile.name}, ${countLabel}`;
  const labelWithSelection = isSelected ? `${rowLabel}, ${m.selection_suffix()}` : rowLabel;

  return (
    <CompositeRow
      itemId={profile.name}
      isFocused={isFocused}
      isActiveRow={isActiveRow}
      label={labelWithSelection}
      selected={isSelected}
      roleDescription={m.item_role_profile()}
      className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 forced-colors:border-[ButtonText] data-[selected=true]:bg-sky-900/40 data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-sky-400/40 forced-colors:data-[selected=true]:bg-[Highlight] forced-colors:data-[selected=true]:text-[HighlightText]"
      activeClassName="bg-slate-800/60"
    >
      <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isActive ? <CheckCircle size={14} className="text-sky-400 forced-colors:text-[Highlight]" /> : null}
      </span>
      <span className="truncate font-medium text-slate-200">{profile.name}</span>
      <span aria-hidden="true" className="ml-auto text-xs text-slate-500">
        {countLabel}
      </span>

      <div
        role="group"
        aria-label={m.profile_row_actions({ name: profile.name })}
        className="flex items-center gap-1"
      >
        {!isActive && (
          <IconButton
            name={profile.name}
            segment="action-switch"
            isFocused={isFocused}
            onClick={() => onSwitch(profile.name)}
            label={m.profile_switch_named({ name: profile.name })}
            Icon={ArrowRightLeft}
          />
        )}
        <IconButton
          name={profile.name}
          segment="action-duplicate"
          isFocused={isFocused}
          onClick={() => onDuplicate(profile.name)}
          label={m.profile_duplicate_named({ name: profile.name })}
          Icon={Copy}
        />
        {!isDefault && !isActive && (
          <>
            <IconButton
              name={profile.name}
              segment="action-rename"
              isFocused={isFocused}
              onClick={() => onRename(profile.name)}
              label={m.profile_rename_named({ name: profile.name })}
              Icon={Pencil}
            />
            <IconButton
              name={profile.name}
              segment="action-delete"
              isFocused={isFocused}
              onClick={() => onDelete(profile.name)}
              label={m.profile_delete_named({ name: profile.name })}
              Icon={Trash2}
            />
          </>
        )}
        <IconButton
          name={profile.name}
          segment="action-export"
          isFocused={isFocused}
          onClick={() => onExport(profile.name)}
          label={m.profile_export_named({ name: profile.name })}
          Icon={Upload}
        />
        <ProfileContextMenu
          profile={profile}
          isActive={isActive}
          isDefault={isDefault}
          menuFocused={isFocused("action-menu")}
          selectionCount={selectionCount}
          onSwitch={() => onSwitch(profile.name)}
          onDuplicate={() => onDuplicate(profile.name)}
          onRename={() => onRename(profile.name)}
          onDelete={() => onDelete(profile.name)}
          onExport={() => onExport(profile.name)}
        />
      </div>
    </CompositeRow>
  );
}

function IconButton({
  name,
  segment,
  isFocused,
  onClick,
  label,
  Icon,
}: {
  name: string;
  segment: ProfileSegment;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  onClick: () => void;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <CompositeAction
      itemId={name}
      segment={segment}
      isFocused={isFocused}
      onClick={onClick}
      label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]"
    >
      <Icon size={14} aria-hidden className="opacity-80" />
    </CompositeAction>
  );
}
