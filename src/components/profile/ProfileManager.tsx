import { useState, useEffect, useRef } from "react";
import { useStore } from "@nanostores/react";
import {
  Modal, ModalOverlay, Dialog, Heading, Button, TextField, Input, Label,
} from "react-aria-components";
import { X } from "lucide-react";
import { $profileManagerOpen, $profileList } from "../../stores/profileManager";
import { $settings } from "../../stores/settings";
import { ProfileList } from "./ProfileList";
import { ProfileActions } from "./ProfileActions";
import { addToast } from "../../stores/toasts";
import * as tauri from "../../lib/tauri";
import type { ImportPreview } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

type SubDialog =
  | null
  | { type: "create" }
  | { type: "rename" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "switch-confirm" }
  | { type: "import"; preview: ImportPreview };

export function ProfileManager() {
  const isOpen = useStore($profileManagerOpen);
  const profiles = useStore($profileList);
  const settings = useStore($settings);
  const activeProfile = settings?.activeProfile ?? "Default";

  const [selected, setSelected] = useState(activeProfile);
  const [subDialog, setSubDialog] = useState<SubDialog>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(activeProfile);
    tauri.listProfiles()
      .then((list) => $profileList.set(list))
      .catch((e) => addToast(String(e), "error"));
  }, [isOpen, activeProfile]);

  const close = () => {
    $profileManagerOpen.set(false);
    setSubDialog(null);
    setNameInput("");
    setNameError(null);
    setBusy(false);
  };

  const announce = (msg: string) => {
    if (liveRef.current) liveRef.current.textContent = msg;
  };

  const refreshList = async () => {
    const list = await tauri.listProfiles();
    $profileList.set(list);
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
      if (hasRecordings) {
        setSubDialog({ type: "switch-confirm" });
        return;
      }
      doSwitch();
    } catch (e) {
      addToast(String(e), "error");
    }
  };

  const doSwitch = async () => {
    setBusy(true);
    try {
      await tauri.switchProfile(selected);
      await refreshList();
      announce(m.profile_switch() + ": " + selected);
      setSubDialog(null);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    setNameError(null);
    setBusy(true);
    try {
      const meta = await tauri.createProfile(nameInput.trim());
      await refreshList();
      setSelected(meta.name);
      announce(m.profile_create() + ": " + meta.name);
      setSubDialog(null);
      setNameInput("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    setNameError(null);
    setBusy(true);
    try {
      const meta = await tauri.renameProfile(selected, nameInput.trim());
      await refreshList();
      setSelected(meta.name);
      announce(m.profile_rename() + ": " + meta.name);
      setSubDialog(null);
      setNameInput("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = async () => {
    setNameError(null);
    setBusy(true);
    try {
      const meta = await tauri.duplicateProfile(selected, nameInput.trim());
      await refreshList();
      setSelected(meta.name);
      announce(m.profile_duplicate() + ": " + meta.name);
      setSubDialog(null);
      setNameInput("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await tauri.deleteProfile(selected);
      await refreshList();
      setSelected("Default");
      announce(m.profile_delete() + ": " + selected);
      setSubDialog(null);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      await tauri.exportProfile(selected);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const preview = await tauri.beginImport();
      if (!preview) return;
      setNameInput(preview.suggestedName);
      setNameError(preview.hasConflict ? m.profile_conflict_error() : null);
      setSubDialog({ type: "import", preview });
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCommitImport = async () => {
    if (!subDialog || subDialog.type !== "import") return;
    setNameError(null);
    setBusy(true);
    try {
      const meta = await tauri.commitImport(subDialog.preview.profileJson, nameInput.trim());
      await refreshList();
      setSelected(meta.name);
      announce(m.profile_import() + ": " + meta.name);
      setSubDialog(null);
      setNameInput("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      <ModalOverlay
        className="fixed inset-0 z-40 flex items-start justify-center pt-16 bg-black/60"
        isOpen={isOpen}
        onOpenChange={(open) => { if (!open) close(); }}
      >
        <Modal className="w-[480px] max-h-[70vh] flex flex-col rounded-lg bg-slate-800 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
          <Dialog
            role="dialog"
            aria-label={m.profile_manager_title()}
            className="flex flex-col h-full outline-none p-6 gap-4"
          >
            <div className="flex items-center justify-between">
              <Heading slot="title" className="text-lg font-semibold text-slate-100">
                {m.profile_manager_title()}
              </Heading>
              <Button
                aria-label={m.profile_close()}
                onPress={close}
                className="text-slate-400 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
              >
                <X size={18} aria-hidden />
              </Button>
            </div>

            <div className="flex gap-4 flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                <ProfileList
                  profiles={profiles}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>
              <div className="overflow-y-auto flex-shrink-0">
                <ProfileActions
                  selected={selected}
                  activeProfile={activeProfile}
                  busy={busy}
                  onSwitch={handleSwitch}
                  onRename={() => { setNameInput(selected); setNameError(null); setSubDialog({ type: "rename" }); }}
                  onDelete={() => setSubDialog({ type: "delete" })}
                  onDuplicate={() => { setNameInput(""); setNameError(null); setSubDialog({ type: "duplicate" }); }}
                  onExport={handleExport}
                  onImport={handleImport}
                  onNew={() => { setNameInput(""); setNameError(null); setSubDialog({ type: "create" }); }}
                />
              </div>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Name input sub-dialog: create / rename / duplicate / import */}
      {(subDialog?.type === "create" || subDialog?.type === "rename" ||
        subDialog?.type === "duplicate" || subDialog?.type === "import") && (
        <ModalOverlay
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          isOpen
          onOpenChange={(open) => { if (!open) { setSubDialog(null); setNameInput(""); } }}
        >
          <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none">
            <Dialog role="alertdialog" className="outline-none flex flex-col gap-4">
              <Heading slot="title" className="text-base font-semibold text-slate-100">
                {subDialog.type === "create" && m.profile_create()}
                {subDialog.type === "rename" && m.profile_rename()}
                {subDialog.type === "duplicate" && m.profile_duplicate()}
                {subDialog.type === "import" && m.profile_import()}
              </Heading>
              <TextField
                autoFocus
                value={nameInput}
                onChange={(v) => { setNameInput(v); setNameError(null); }}
                isInvalid={!!nameError}
                className="flex flex-col gap-1"
              >
                <Label className="text-sm text-slate-300">{m.profile_new_name_label()}</Label>
                <Input className="rounded bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
                {nameError && (
                  <span role="alert" className="text-xs text-red-400">{nameError}</span>
                )}
              </TextField>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setSubDialog(null); setNameInput(""); }}
                  className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
                >
                  {m.cancel?.() ?? "Cancel"}
                </button>
                <button
                  onClick={() => {
                    if (subDialog.type === "create") handleCreate();
                    else if (subDialog.type === "rename") handleRename();
                    else if (subDialog.type === "duplicate") handleDuplicate();
                    else if (subDialog.type === "import") handleCommitImport();
                  }}
                  disabled={busy || !nameInput.trim()}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}

      {/* Delete confirm sub-dialog */}
      {subDialog?.type === "delete" && (
        <ModalOverlay
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          isOpen
          onOpenChange={(open) => { if (!open) setSubDialog(null); }}
        >
          <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none">
            <Dialog role="alertdialog" className="outline-none">
              <Heading slot="title" className="text-base font-semibold text-slate-100 mb-3">
                {m.profile_delete()}
              </Heading>
              <p className="text-sm text-slate-400 mb-6">
                {m.profile_delete_confirm({ name: selected })}
              </p>
              <div className="flex justify-end gap-2">
                <button autoFocus onClick={() => setSubDialog(null)}
                  className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">
                  {m.cancel?.() ?? "Cancel"}
                </button>
                <button onClick={handleDelete} disabled={busy}
                  className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50">
                  {m.profile_delete()}
                </button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}

      {/* Switch confirm sub-dialog (active recordings warning) */}
      {subDialog?.type === "switch-confirm" && (
        <ModalOverlay
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          isOpen
          onOpenChange={(open) => { if (!open) setSubDialog(null); }}
        >
          <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none">
            <Dialog role="alertdialog" className="outline-none">
              <Heading slot="title" className="text-base font-semibold text-slate-100 mb-3">
                {m.profile_switch()}
              </Heading>
              <p className="text-sm text-slate-400 mb-6">
                {m.profile_switch_confirm({ name: selected })}
              </p>
              <div className="flex justify-end gap-2">
                <button autoFocus onClick={() => setSubDialog(null)}
                  className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">
                  {m.cancel?.() ?? "Cancel"}
                </button>
                <button onClick={doSwitch} disabled={busy}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  {m.profile_switch()}
                </button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}
    </>
  );
}
