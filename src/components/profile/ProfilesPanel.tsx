import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $profileList } from "../../stores/profileManager";
import { $settings } from "../../stores/settings";
import { $commandPaletteOpen } from "../../stores/navigation";
import { ProfileList, type ProfileListHandle } from "./ProfileList";
import { ProfileActions } from "./ProfileActions";
import { ProfileNameDialog } from "./ProfileNameDialog";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import type { ImportPreview } from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

type SubDialog =
  | null
  | { type: "create" }
  | { type: "rename" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "switch-confirm" }
  | { type: "import"; preview: ImportPreview };

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function ProfilesPanel({ onZonesChange, exitZone }: Props) {
  const profiles = useStore($profileList);
  const settings = useStore($settings);
  const activeProfile = settings?.activeProfile ?? "Default";
  const announce = useAnnounce();

  const [selected, setSelected] = useState(activeProfile);
  const [subDialog, setSubDialog] = useState<SubDialog>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const listRef = useRef<ProfileListHandle>(null);
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<ZoneEntry | null>(null);

  // ── Load profiles on mount / active-profile change ──
  useEffect(() => {
    setSelected(activeProfile);
    tauri.listProfiles()
      .then((list) => $profileList.set(list))
      .catch((e) => addToast(String(e), "error"));
  }, [activeProfile]);

  const refreshList = async () => {
    const list = await tauri.listProfiles();
    $profileList.set(list);
  };

  // After switch/delete the trigger button becomes disabled; return focus to the
  // list. rAF ensures the disabled state has committed before we move focus.
  const refocusList = () => {
    requestAnimationFrame(() => listRef.current?.focusSelected());
  };

  const handleError = (e: unknown) => {
    const msg = String(e);
    if (msg.startsWith("Conflict:") || msg.startsWith("InvalidName:")) {
      setNameError(msg.replace(/^(Conflict|InvalidName): /, ""));
    } else {
      addToast(msg, "error");
    }
  };

  const handleSwitch = async () => {
    try {
      const statuses = await tauri.getAllStatuses?.() ?? [];
      const hasRecordings = statuses.some((s) => s.state === "recording");
      if (hasRecordings) { setSubDialog({ type: "switch-confirm" }); return; }
      doSwitch();
    } catch (e) { addToast(String(e), "error"); }
  };

  const doSwitch = async () => {
    setBusy(true);
    try {
      await tauri.switchProfile(selected);
      await refreshList();
      announce(m.profile_switch() + ": " + selected);
      setSubDialog(null);
      refocusList();
    } catch (e) { addToast(String(e), "error"); }
    finally { setBusy(false); }
  };

  const handleCreate = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.createProfile(nameInput.trim());
      await refreshList(); setSelected(meta.name);
      announce(m.profile_create() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleRename = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.renameProfile(selected, nameInput.trim());
      await refreshList(); setSelected(meta.name);
      announce(m.profile_rename() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleDuplicate = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.duplicateProfile(selected, nameInput.trim());
      await refreshList(); setSelected(meta.name);
      announce(m.profile_duplicate() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await tauri.deleteProfile(selected);
      await refreshList(); setSelected("Default");
      announce(m.profile_delete() + ": " + selected);
      setSubDialog(null); refocusList();
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      await tauri.exportProfile(selected);
      announce(m.profile_exported_announcement({ name: selected }));
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const preview = await tauri.beginImport();
      if (!preview) return;
      setNameInput(preview.suggestedName);
      setNameError(preview.hasConflict ? m.profile_conflict_error() : null);
      setSubDialog({ type: "import", preview });
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleCommitImport = async () => {
    if (!subDialog || subDialog.type !== "import") return;
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.commitImport(subDialog.preview.profileJson, nameInput.trim());
      await refreshList(); setSelected(meta.name);
      announce(m.profile_import() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  // ── Toolbar zone (3 items) ──
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const cmdBtn = useRef<HTMLButtonElement | null>(null);
  const newBtn = useRef<HTMLButtonElement | null>(null);
  const importBtn = useRef<HTMLButtonElement | null>(null);
  const toolbarRefs = useMemo(() => [cmdBtn, newBtn, importBtn], []);
  const {
    onKeyDown: toolbarKeyDown,
    getTabIndex: toolbarTabIndex,
    restoreFocus: toolbarRestore,
  } = useRovingFocus(toolbarRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("profiles-toolbar", forward),
  });

  // ── Zone registration (static: toolbar / list / actions) ──
  useEffect(() => {
    const toolbarZone: ZoneEntry = {
      id: "profiles-toolbar",
      get el() { return toolbarZoneRef.current!; },
      focus: toolbarRestore,
    };
    const listZone: ZoneEntry = {
      id: "profiles-list",
      get el() { return listWrapperRef.current!; },
      focus: () => listRef.current?.focusSelected(),
    };
    const actionsZone: ZoneEntry = {
      id: "profiles-actions",
      get el() { return actionsRef.current!.el; },
      focus: (dir) => actionsRef.current?.focus(dir),
    };
    onZonesChange([toolbarZone, listZone, actionsZone]);
  // onZonesChange must be a stable reference from the caller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolbarRestore]);

  // List is a single tab-stop zone — any Tab exits to the next/prev zone.
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      exitZone("profiles-list", !e.shiftKey);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.profile_name()}>
      {/* ── Toolbar zone ── */}
      <div
        ref={toolbarZoneRef}
        data-zone-id="profiles-toolbar"
        role="application"
        aria-label={m.zone_profiles_toolbar()}
        className="border-b border-slate-700 forced-colors:border-[ButtonText]"
        onKeyDown={toolbarKeyDown}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-base font-semibold text-slate-100">{m.profile_name()}</h1>
          <div className="flex items-center gap-2">
            <button
              ref={cmdBtn}
              tabIndex={toolbarTabIndex(0)}
              aria-label={m.command_palette_label()}
              onClick={() => $commandPaletteOpen.set(true)}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.commands_label()}
            </button>
            <button
              ref={newBtn}
              tabIndex={toolbarTabIndex(1)}
              onClick={() => { setNameInput(""); setNameError(null); setSubDialog({ type: "create" }); }}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            >
              {m.profile_create()}
            </button>
            <button
              ref={importBtn}
              tabIndex={toolbarTabIndex(2)}
              onClick={handleImport}
              className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.profile_import()}
            </button>
          </div>
        </div>
      </div>

      {/* ── List + Actions ── */}
      <div className="flex flex-1 gap-4 overflow-hidden px-4 py-3">
        <div
          ref={listWrapperRef}
          data-zone-id="profiles-list"
          className="flex-1 overflow-y-auto"
          onKeyDown={handleListKeyDown}
        >
          <ProfileList
            ref={listRef}
            profiles={profiles}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <div className="w-56 flex-shrink-0 overflow-y-auto">
          <ProfileActions
            ref={actionsRef}
            selected={selected}
            activeProfile={activeProfile}
            busy={busy}
            onSwitch={handleSwitch}
            onRename={() => { setNameInput(selected); setNameError(null); setSubDialog({ type: "rename" }); }}
            onDelete={() => setSubDialog({ type: "delete" })}
            onDuplicate={() => { setNameInput(""); setNameError(null); setSubDialog({ type: "duplicate" }); }}
            onExport={handleExport}
            exitZone={(forward) => exitZone("profiles-actions", forward)}
          />
        </div>
      </div>

      {/* ── Sub-dialogs (single level, portalled) ── */}
      {(subDialog?.type === "create" || subDialog?.type === "rename" ||
        subDialog?.type === "duplicate" || subDialog?.type === "import") && createPortal(
        <ProfileNameDialog
          title={
            subDialog.type === "create" ? m.profile_create()
            : subDialog.type === "rename" ? m.profile_rename()
            : subDialog.type === "duplicate" ? m.profile_duplicate()
            : m.profile_import()
          }
          value={nameInput}
          error={nameError}
          busy={busy}
          onChange={(v) => { setNameInput(v); setNameError(null); }}
          onConfirm={() => {
            if (subDialog.type === "create") handleCreate();
            else if (subDialog.type === "rename") handleRename();
            else if (subDialog.type === "duplicate") handleDuplicate();
            else handleCommitImport();
          }}
          onCancel={() => { setSubDialog(null); setNameInput(""); }}
        />,
        document.body,
      )}

      {subDialog?.type === "delete" && createPortal(
        <ConfirmDialog
          title={m.profile_delete()}
          message={m.profile_delete_confirm({ name: selected })}
          confirmLabel={m.profile_delete()}
          onConfirm={handleDelete}
          onCancel={() => setSubDialog(null)}
        />,
        document.body,
      )}

      {subDialog?.type === "switch-confirm" && createPortal(
        <ConfirmDialog
          title={m.profile_switch()}
          message={m.profile_switch_confirm({ name: selected })}
          confirmLabel={m.profile_switch()}
          onConfirm={doSwitch}
          onCancel={() => setSubDialog(null)}
        />,
        document.body,
      )}
    </div>
  );
}
