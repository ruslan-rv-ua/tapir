import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import * as tauri from "../../lib/tauri";
import type { StreamMeta } from "../../lib/tauri";
import { $streams, $showAddStreamDialog, $editStream } from "../../stores/streams";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

const NO_META: StreamMeta = { icyName: null, bitrate: null, format: null };

export function AddStreamDialog() {
  const showAddDialog = useStore($showAddStreamDialog);
  const editStream = useStore($editStream);

  const isOpen = showAddDialog || editStream !== null;
  const isEdit = editStream !== null;

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  // The pre-flight checks each run once per URL/name and then stand down, so a
  // second submit ("…anyway") goes straight through. `warning` holds whichever
  // of them spoke — one message at a time, one live region.
  const [probed, setProbed] = useState(false);
  const [probeMeta, setProbeMeta] = useState<StreamMeta>(NO_META);
  const [conflictsChecked, setConflictsChecked] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  // Sync form fields when dialog opens
  useEffect(() => {
    if (isOpen) {
      setUrl(editStream?.url ?? "");
      setName(editStream?.name ?? "");
      setError(null);
      setWarning(null);
      setProbed(false);
      setProbeMeta(NO_META);
      setConflictsChecked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Probing and saving both lock the form; only the label distinguishes them.
  const busy = loading || probing;

  // A new URL invalidates the reachability verdict AND the duplicate check.
  const changeUrl = (next: string) => {
    setUrl(next);
    setProbed(false);
    setProbeMeta(NO_META);
    setConflictsChecked(false);
    setWarning(null);
  };

  // A new name invalidates only the collision check (edit mode).
  const changeName = (next: string) => {
    setName(next);
    setConflictsChecked(false);
    setWarning(null);
  };

  const handleClose = () => {
    $showAddStreamDialog.set(false);
    $editStream.set(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Adding: check reachability first, once per URL. A failed probe is only a
    // warning — the second submit goes through so a temporarily-down stream can
    // still be added. Edit never probes (the URL is not editable there).
    // `meta` is a local because a `setProbeMeta` in this closure would not be
    // visible to the `addStream` call further down the same submit.
    let meta = probeMeta;
    if (!isEdit && !probed) {
      setProbing(true);
      let verdict: tauri.ProbeVerdict = { ok: false, error: null, ...NO_META };
      try {
        verdict = await tauri.probeStream(url);
      } catch {
        // treat an IPC failure like an unreachable stream
      } finally {
        setProbing(false);
        setProbed(true);
      }
      if (!verdict.ok) {
        setWarning(m.stream_probe_failed());
        return;
      }
      // icyName rides along so the backend can name a stream the user left
      // unnamed, instead of parking a URL in the list until the first recording.
      meta = { icyName: verdict.icyName, bitrate: verdict.bitrate, format: verdict.format };
      setProbeMeta(meta);
    }

    // Then the profile-level conflicts, also once. Adding warns about a URL the
    // profile already holds; renaming warns about a name that would send two
    // streams into one recording folder. Neither refuses — an explicit second
    // submit is respected.
    if (!conflictsChecked) {
      let conflicts: tauri.StreamConflicts = { duplicateUrlOf: null, nameCollidesWith: null };
      try {
        conflicts = isEdit
          ? await tauri.checkStreamConflicts({ name, excludeId: editStream.id })
          : await tauri.checkStreamConflicts({ url });
      } catch {
        // A pre-flight that cannot run must not block the save.
      }
      setConflictsChecked(true);
      const clash = isEdit
        ? conflicts.nameCollidesWith && m.stream_name_collision_warning({ name: conflicts.nameCollidesWith })
        : conflicts.duplicateUrlOf && m.stream_duplicate_url_warning({ name: conflicts.duplicateUrlOf });
      if (clash) {
        setWarning(clash);
        return;
      }
    }

    setLoading(true);
    try {
      if (isEdit && editStream) {
        const updated = await tauri.updateStream(editStream.id, name);
        $streams.set($streams.get().map((s) => s.id === updated.id ? updated : s));
        addToast(m.stream_updated({ name: updated.name }), "success");
      } else {
        const newStream = await tauri.addStream(url, name || undefined, meta);
        $streams.set([...$streams.get(), newStream]);
        addToast(m.stream_added({ name: newStream.name }), "success");
      }
      handleClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // The station's own name, offered only while it differs from what the field
  // holds. Copying it is an explicit act: the stored name is a folder on disk,
  // so nothing rewrites it behind the user's back.
  const officialName = isEdit && editStream.icyName && editStream.icyName !== name.trim()
    ? editStream.icyName
    : null;

  const submitLabel = probing
    ? m.stream_probe_checking()
    : loading
      ? m.saving()
      : warning
        ? (isEdit ? m.stream_save_anyway() : m.stream_probe_add_anyway())
        : m.save();

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) handleClose(); }}
    >
      <Modal className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {isEdit ? m.edit_stream() : m.add_stream()}
          </Heading>
          <form onSubmit={handleSubmit} aria-busy={busy || undefined} className="flex flex-col gap-3">
            {!isEdit && (
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                {m.stream_url()}
                <input
                  type="url"
                  value={url}
                  onChange={(e) => changeUrl(e.target.value)}
                  required
                  autoFocus
                  disabled={busy}
                  className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
                  placeholder="https://..."
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.stream_name()}
              <input
                type="text"
                value={name}
                onChange={(e) => changeName(e.target.value)}
                autoFocus={isEdit}
                disabled={busy}
                className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
              />
            </label>
            {officialName && (
              <div className="flex flex-col items-start gap-1 rounded border border-slate-700 p-2 forced-colors:border-[ButtonText]">
                <p className="text-xs text-slate-400 forced-colors:text-[CanvasText]">
                  {m.stream_official_name({ name: officialName })}
                </p>
                <button
                  type="button"
                  onClick={() => changeName(officialName)}
                  disabled={busy}
                  className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
                >
                  {m.stream_use_official_name()}
                </button>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-red-400 forced-colors:text-[CanvasText]">{error}</p>}
            {/* Probe / conflict warnings: polite so they do not cut off the field
                the user is in; one region for every state so NVDA sees a text change. */}
            <p aria-live="polite" className="text-sm text-amber-300 empty:hidden forced-colors:text-[CanvasText]">
              {probing ? m.stream_probe_checking() : warning ?? ""}
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {m.cancel()}
              </button>
              <button
                type="submit"
                disabled={busy}
                aria-busy={busy || undefined}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {submitLabel}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
