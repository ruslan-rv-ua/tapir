import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Button } from "react-aria-components";
import { ArrowRightLeft, Copy, Pencil, Trash2, Upload } from "lucide-react";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
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
  exitZone: (forward: boolean) => void;
}

export const ProfileActions = forwardRef<ZoneEntry, Props>(function ProfileActions(
  { selected, activeProfile, busy, onSwitch, onRename, onDelete, onDuplicate, onExport, exitZone },
  ref,
) {
  const isActive = selected === activeProfile;
  const isDefault = selected === "Default";

  const containerRef = useRef<HTMLDivElement | null>(null);
  const switchRef = useRef<HTMLButtonElement | null>(null);
  const duplicateRef = useRef<HTMLButtonElement | null>(null);
  const renameRef = useRef<HTMLButtonElement | null>(null);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const exportRef = useRef<HTMLButtonElement | null>(null);
  const refs = useMemo(
    () => [switchRef, duplicateRef, renameRef, deleteRef, exportRef],
    [],
  );

  const { onKeyDown, getTabIndex, restoreFocus } = useRovingFocus(refs, "vertical", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: exitZone,
  });

  useImperativeHandle(ref, () => ({
    id: "profiles-actions",
    get el() { return containerRef.current!; },
    focus: restoreFocus,
  }), [restoreFocus]);

  return (
    <div
      ref={containerRef}
      data-zone-id="profiles-actions"
      role="application"
      aria-label={m.profile_actions_label()}
      className="flex flex-col gap-2"
      onKeyDown={onKeyDown}
    >
      <ActionButton btnRef={switchRef} excludeFromTabOrder={getTabIndex(0) === -1} onPress={onSwitch} isDisabled={isActive || busy} variant="primary" icon={ArrowRightLeft}>
        {m.profile_switch()}
      </ActionButton>

      <GroupCaption>{m.profile_group_profile()}</GroupCaption>
      <ActionButton btnRef={duplicateRef} excludeFromTabOrder={getTabIndex(1) === -1} onPress={onDuplicate} isDisabled={busy} icon={Copy}>
        {m.profile_duplicate()}
      </ActionButton>
      <ActionButton btnRef={renameRef} excludeFromTabOrder={getTabIndex(2) === -1} onPress={onRename} isDisabled={isDefault || isActive || busy} icon={Pencil}>
        {m.profile_rename()}
      </ActionButton>
      <ActionButton btnRef={deleteRef} excludeFromTabOrder={getTabIndex(3) === -1} onPress={onDelete} isDisabled={isDefault || isActive || busy} icon={Trash2}>
        {m.profile_delete()}
      </ActionButton>

      <GroupCaption>{m.profile_group_file()}</GroupCaption>
      <ActionButton btnRef={exportRef} excludeFromTabOrder={getTabIndex(4) === -1} onPress={onExport} isDisabled={busy} icon={Upload}>
        {m.profile_export()}
      </ActionButton>
    </div>
  );
});

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
  btnRef,
  excludeFromTabOrder,
}: {
  children: React.ReactNode;
  onPress: () => void;
  isDisabled?: boolean;
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  variant?: "default" | "primary";
  btnRef: React.RefObject<HTMLButtonElement | null>;
  excludeFromTabOrder: boolean;
}) {
  const base =
    "w-full px-3 py-1.5 text-sm text-left rounded flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight] transition-colors";
  const variantClass =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
      : "bg-white/[.04] text-slate-300 hover:bg-white/[.08] forced-colors:text-[ButtonText] forced-colors:disabled:text-[GrayText]";
  return (
    <Button ref={btnRef} onPress={onPress} isDisabled={isDisabled} excludeFromTabOrder={excludeFromTabOrder} className={`${base} ${variantClass}`}>
      <Icon size={14} aria-hidden className="opacity-70 shrink-0" />
      {children}
    </Button>
  );
}
