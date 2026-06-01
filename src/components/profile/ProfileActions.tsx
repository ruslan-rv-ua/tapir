import { Button } from "react-aria-components";
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
    <div className="flex flex-col gap-2" role="group" aria-label="Profile actions">
      <ActionButton onPress={onSwitch} isDisabled={isActive || busy}>
        {m.profile_switch()}
      </ActionButton>
      <ActionButton onPress={onRename} isDisabled={isDefault || isActive || busy}>
        {m.profile_rename()}
      </ActionButton>
      <ActionButton onPress={onDuplicate} isDisabled={busy}>{m.profile_duplicate()}</ActionButton>
      <ActionButton onPress={onDelete} isDisabled={isDefault || isActive || busy}>
        {m.profile_delete()}
      </ActionButton>
      <ActionButton onPress={onExport} isDisabled={busy}>{m.profile_export()}</ActionButton>
      <ActionButton onPress={onImport} isDisabled={busy}>{m.profile_import()}</ActionButton>
      <ActionButton onPress={onNew} isDisabled={busy}>{m.profile_create()}</ActionButton>
    </div>
  );
}

function ActionButton({
  children,
  onPress,
  isDisabled,
}: {
  children: React.ReactNode;
  onPress: () => void;
  isDisabled?: boolean;
}) {
  return (
    <Button
      onPress={onPress}
      isDisabled={isDisabled}
      className="w-full px-3 py-1.5 text-sm text-left rounded bg-white/[.04] text-slate-300 hover:bg-white/[.08] disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-blue-400 transition-colors forced-colors:text-[ButtonText] forced-colors:disabled:text-[GrayText]"
    >
      {children}
    </Button>
  );
}
