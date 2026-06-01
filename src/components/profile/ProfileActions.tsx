import { Button } from "react-aria-components";
import {
  ArrowRightLeft, Plus, Copy, Pencil, Trash2, Upload, Download,
} from "lucide-react";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  selected: string;
  activeProfile: string;
  busy?: boolean;
  onSwitch: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onImport: () => void;
  onNew: () => void;
}

export function ProfileActions({
  selected, activeProfile, busy,
  onSwitch, onRename, onDelete, onDuplicate, onExport, onImport, onNew,
}: Props) {
  const isActive = selected === activeProfile;
  const isDefault = selected === "Default";

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={m.profile_actions_label()}>
      <ActionButton onPress={onSwitch} isDisabled={isActive || busy} variant="primary" icon={ArrowRightLeft}>
        {m.profile_switch()}
      </ActionButton>

      <GroupCaption>{m.profile_group_profile()}</GroupCaption>
      <ActionButton onPress={onNew} isDisabled={busy} icon={Plus}>{m.profile_create()}</ActionButton>
      <ActionButton onPress={onDuplicate} isDisabled={busy} icon={Copy}>{m.profile_duplicate()}</ActionButton>
      <ActionButton onPress={onRename} isDisabled={isDefault || isActive || busy} icon={Pencil}>
        {m.profile_rename()}
      </ActionButton>
      <ActionButton onPress={onDelete} isDisabled={isDefault || isActive || busy} icon={Trash2}>
        {m.profile_delete()}
      </ActionButton>

      <GroupCaption>{m.profile_group_file()}</GroupCaption>
      <ActionButton onPress={onExport} isDisabled={busy} icon={Upload}>{m.profile_export()}</ActionButton>
      <ActionButton onPress={onImport} isDisabled={busy} icon={Download}>{m.profile_import()}</ActionButton>
    </div>
  );
}

function GroupCaption({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="mt-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </span>
  );
}

function ActionButton({
  children,
  onPress,
  isDisabled,
  icon: Icon,
  variant = "default",
}: {
  children: React.ReactNode;
  onPress: () => void;
  isDisabled?: boolean;
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  variant?: "default" | "primary";
}) {
  const base =
    "w-full px-3 py-1.5 text-sm text-left rounded flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight] transition-colors";
  const variantClass =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
      : "bg-white/[.04] text-slate-300 hover:bg-white/[.08] forced-colors:text-[ButtonText] forced-colors:disabled:text-[GrayText]";
  return (
    <Button onPress={onPress} isDisabled={isDisabled} className={`${base} ${variantClass}`}>
      <Icon size={14} aria-hidden className="opacity-70 shrink-0" />
      {children}
    </Button>
  );
}
