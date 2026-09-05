import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $focusProfileList, $profileList, $profilesSelection, $showCreateProfileDialog } from "../../stores/profileManager";
import { replaceSelection } from "../../stores/selection";
import { $profileSettingsTarget, $settings } from "../../stores/settings";
import { ProfileList, type ProfileListHandle } from "./ProfileList";
import { SelectionToolbar } from "../common/SelectionToolbar";
import { ProfileNameDialog } from "./ProfileNameDialog";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { ListCard } from "../common/ListCard";
import { ScreenZone } from "../layout/ScreenZone";
import { ScreenHeader } from "../layout/ScreenHeader";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry, ZoneId } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import type { ActiveScheduled, ImportPreview } from "../../lib/tauri";
import { activeScheduledMessage } from "../../lib/scheduleFormat";
import { profileDeleteErrorMessage, profileDeleteRefusal } from "../../lib/profileDelete";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

type SubDialog =
  | null
  | { type: "create" }
  | { type: "rename" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "switch-confirm" }
  | { type: "switch-confirm-scheduled"; active: ActiveScheduled[] }
  | { type: "import"; preview: ImportPreview };

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: ZoneId, forward: boolean) => void;
}

export function ProfilesPanel({ onZonesChange, exitZone }: Props) {
  const profiles = useStore($profileList);
  const settings = useStore($settings);
  const activeProfile = settings?.activeProfile ?? "Default";
  const announce = useAnnounce();
  const showCreate = useStore($showCreateProfileDialog);

  // `target` is the profile a dialog currently operates on (rename/duplicate/delete/switch-confirm).
  const [target, setTarget] = useState(activeProfile);
  const [subDialog, setSubDialog] = useState<SubDialog>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const listRef = useRef<ProfileListHandle>(null);

  useEffect(() => {
    tauri.listProfiles()
      .then((list) => $profileList.set(list))
      .catch((e) => addToast(String(e), "error"));
  }, [activeProfile]);

  // Bridge: global Ctrl+N (profiles) → open the create dialog. The atom is the
  // signal; reset it synchronously so the next Ctrl+N (after close) fires again.
  // The guard prevents re-opening on unrelated re-renders.
  useEffect(() => {
    if (showCreate) {
      setNameInput("");
      setNameError(null);
      setSubDialog({ type: "create" });
      $showCreateProfileDialog.set(false);
    }
  }, [showCreate]);

  const refreshList = async () => {
    const list = await tauri.listProfiles();
    $profileList.set(list);
  };

  // The profile-settings dialog lives at `App` level, so it cannot reach the
  // list itself: after a force-close it bumps this counter and focus lands here.
  const focusListSignal = useStore($focusProfileList);
  const focusListSignalRef = useRef(focusListSignal);
  useEffect(() => {
    if (focusListSignal === focusListSignalRef.current) return;
    focusListSignalRef.current = focusListSignal;
    requestAnimationFrame(() => listRef.current?.focus("forward"));
  }, [focusListSignal]);

  // Focus helpers — rAF lets the list re-render with refreshed data (and the
  // updated focusProfile closure) before we move focus.
  const refocusProfile = (name: string) =>
    requestAnimationFrame(() => listRef.current?.focusProfile(name));
  const refocusList = () =>
    requestAnimationFrame(() => listRef.current?.focus("forward"));

  const handleError = (e: unknown) => {
    const msg = String(e);
    if (msg.startsWith("Conflict:") || msg.startsWith("InvalidName:")) {
      setNameError(msg.replace(/^(Conflict|InvalidName): /, ""));
    } else {
      addToast(msg, "error");
    }
  };

  // ── Switch (inline button / context menu / Enter on row summary) ──
  const handleSwitch = async (name: string) => {
    if (name === activeProfile) { announce(m.profile_already_active()); return; }
    setTarget(name);
    try {
      // §3.5: плановий запис — спеціальний confirm з назвою і часом кінця.
      const scheduled = await tauri.getActiveScheduled();
      if (scheduled.length > 0) {
        setSubDialog({ type: "switch-confirm-scheduled", active: scheduled });
        return;
      }
      const statuses = await tauri.getAllStatuses?.() ?? [];
      const hasRecordings = statuses.some((s) => s.state === "recording");
      if (hasRecordings) { setSubDialog({ type: "switch-confirm" }); return; }
      await doSwitch(name);
    } catch (e) { addToast(String(e), "error"); }
  };

  const doSwitch = async (name: string) => {
    setBusy(true);
    try {
      await tauri.switchProfile(name);
      await refreshList();
      announce(m.profile_switch() + ": " + name);
      setSubDialog(null);
      refocusProfile(name);
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleCreate = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.createProfile(nameInput.trim());
      await refreshList();
      announce(m.profile_create() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
      refocusProfile(meta.name);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleRename = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.renameProfile(target, nameInput.trim());
      await refreshList();
      announce(m.profile_rename() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
      refocusProfile(meta.name);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleDuplicate = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.duplicateProfile(target, nameInput.trim());
      await refreshList();
      announce(m.profile_duplicate() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
      refocusProfile(meta.name);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  // Every single-row delete request funnels here — the inline button, the menu
  // item and the `Delete` key alike. The first two are already hidden/disabled
  // for the two forbidden rows; the key is not, so the rule is enforced here,
  // BEFORE the confirm dialog. A confirm that ends in a refusal confirms nothing.
  const handleRequestDelete = (name: string) => {
    const refusal = profileDeleteRefusal(name, activeProfile);
    if (refusal) { addToast(refusal, "warning"); return; }
    setTarget(name);
    setSubDialog({ type: "delete" });
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await tauri.deleteProfile(target);
      await refreshList();
      announce(m.profile_delete() + ": " + target);
      setSubDialog(null);
      refocusList();
    } catch (e) {
      addToast(profileDeleteErrorMessage(e, target, activeProfile), "error");
    } finally { setBusy(false); }
  };

  const handleExport = async (name: string) => {
    setBusy(true);
    try {
      await tauri.exportProfile(name);
      announce(m.profile_exported_announcement({ name }));
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
      await refreshList();
      announce(m.profile_import() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
      refocusProfile(meta.name);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  // ── Selection state ──
  const selection = useStore($profilesSelection);
  const selCount = selection.size;
  const allVisibleSelected = profiles.length > 0 && profiles.every((p) => selection.has(p.name));
  const handleSelectAll = () => {
    if (profiles.length === 0) return;
    const next = new Set(selection);
    if (allVisibleSelected) profiles.forEach((p) => next.delete(p.name));
    else profiles.forEach((p) => next.add(p.name));
    replaceSelection($profilesSelection, next);
    announce(next.size === 0 ? m.selection_cleared() : m.selection_count({ count: next.size }), "polite");
  };
  // clear on UNMOUNT ONLY (profiles has no filter; a profile switch keeps membership → keeps selection)
  useEffect(() => () => { replaceSelection($profilesSelection, new Set()); }, []);

  // ── Toolbar zone (4 items) ──
  const newBtn = useRef<HTMLButtonElement | null>(null);
  const importBtn = useRef<HTMLButtonElement | null>(null);
  const selectAllBtn = useRef<HTMLButtonElement | null>(null);
  const deleteSelectedBtn = useRef<HTMLButtonElement | null>(null);
  const toolbarRefs = useMemo(() => [newBtn, importBtn, selectAllBtn, deleteSelectedBtn], []);
  const {
    onKeyDown: toolbarKeyDown,
    getTabIndex: toolbarTabIndex,
    restoreFocus: toolbarRestore,
  } = useRovingFocus(toolbarRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("profiles-toolbar", forward),
  });

  // ── Zone registration (toolbar + list) ──
  useEffect(() => {
    const toolbarZone: ZoneEntry = {
      id: "profiles-toolbar",
      focus: toolbarRestore,
    };
    const listZone: ZoneEntry = {
      id: "profiles-list",
      focus: (dir) => listRef.current?.focus(dir),
    };
    onZonesChange([toolbarZone, listZone]);
  // onZonesChange must be a stable reference from the caller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolbarRestore]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.profile_name()}>
      {/* ── Toolbar zone ── */}
      <ScreenZone
        id="profiles-toolbar"
        role="application"
        label={m.zone_profiles_toolbar()}
        onKeyDown={toolbarKeyDown}
      >
        <ScreenHeader title={m.profile_name()}>
          <button
            ref={newBtn}
            tabIndex={toolbarTabIndex(0)}
            onClick={() => { setNameInput(""); setNameError(null); setSubDialog({ type: "create" }); }}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]"
          >
            {m.profile_create()}
          </button>
          <button
            ref={importBtn}
            tabIndex={toolbarTabIndex(1)}
            onClick={handleImport}
            className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            {m.profile_import()}
          </button>
          <SelectionToolbar
            selCount={selCount}
            visibleCount={profiles.length}
            allVisibleSelected={allVisibleSelected}
            selectAllRef={selectAllBtn}
            actionRef={deleteSelectedBtn}
            selectAllTabIndex={toolbarTabIndex(2)}
            actionTabIndex={toolbarTabIndex(3)}
            actionLabel={m.delete_selected({ count: selCount })}
            onSelectAll={handleSelectAll}
            onAction={() => listRef.current?.requestBulkDelete()}
          />
        </ScreenHeader>
      </ScreenZone>

      {/* ── List ── */}
      <ListCard>
        <ProfileList
          ref={listRef}
          profiles={profiles}
          activeProfile={activeProfile}
          exitZone={(forward) => exitZone("profiles-list", forward)}
          onSwitch={handleSwitch}
          onDuplicate={(name) => { setTarget(name); setNameInput(""); setNameError(null); setSubDialog({ type: "duplicate" }); }}
          onRename={(name) => { setTarget(name); setNameInput(name); setNameError(null); setSubDialog({ type: "rename" }); }}
          onDelete={handleRequestDelete}
          onExport={handleExport}
          onSettings={(name) => { setTarget(name); $profileSettingsTarget.set(name); }}
        />
      </ListCard>

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
          message={m.profile_delete_confirm({ name: target })}
          confirmLabel={m.profile_delete()}
          onConfirm={handleDelete}
          onCancel={() => setSubDialog(null)}
        />,
        document.body,
      )}

      {subDialog?.type === "switch-confirm" && createPortal(
        <ConfirmDialog
          title={m.profile_switch()}
          message={m.profile_switch_confirm({ name: target })}
          confirmLabel={m.profile_switch()}
          onConfirm={() => doSwitch(target)}
          onCancel={() => setSubDialog(null)}
        />,
        document.body,
      )}

      {subDialog?.type === "switch-confirm-scheduled" && createPortal(
        <ConfirmDialog
          title={m.profile_switch()}
          message={activeScheduledMessage(subDialog.active)}
          confirmLabel={m.profile_switch()}
          onConfirm={() => doSwitch(target)}
          onCancel={() => setSubDialog(null)}
        />,
        document.body,
      )}
    </div>
  );
}
