import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import * as tauri from "../../lib/tauri";
import type { StreamMeta } from "../../lib/tauri";
import { $streams, $showAddStreamDialog, $editStream, $statuses } from "../../stores/streams";
import { addToast } from "../../stores/toasts";
import { isRecordingLike } from "../../lib/streamState";
import * as m from "../../i18n/paraglide/messages";

const NO_META: StreamMeta = { icyName: null, bitrate: null, format: null, unsupported: null };

/** Id of the explanation tied to a locked URL field. The dialog is a singleton,
 *  so a constant is unambiguous. */
const URL_LOCKED_HINT_ID = "add-stream-url-locked";

export function AddStreamDialog() {
  const showAddDialog = useStore($showAddStreamDialog);
  const editStream = useStore($editStream);
  const statuses = useStore($statuses);

  const isOpen = showAddDialog || editStream !== null;
  const isEdit = editStream !== null;

  // Editing the address of a stream that is mid-recording is pointless rather
  // than dangerous: `recording_task` copied the URL once at start, so the whole
  // reconnect cycle stays on the old address no matter what the profile says.
  // Lock the field and say so, instead of silently doing nothing.
  const urlLocked = isEdit && isRecordingLike(statuses[editStream.id]?.state);

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

  // One normalised address for the probe, the conflict check and the save
  // alike — deciding "changed?" on the trimmed value while storing the raw one
  // would let a stray space through every check.
  const trimmedUrl = url.trim();

  // Whether the pre-flight checks have an address to apply to. Adding always
  // does; editing only when the field differs from what is stored, so a plain
  // rename stays what it is today — one submit, no probe, no duplicate check.
  const urlIsNew = !isEdit || trimmedUrl !== editStream.url;

  // Locking the form disables whatever the user submitted from — the button, or
  // a field when they pressed Enter — and the browser drops that focus onto
  // <body>. A warning leaves the dialog open, so without this the screen reader
  // is left on nothing and says nothing. Land on the button that now carries
  // the way forward: its label has just become "…anyway".
  const submitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (warning && !busy) submitRef.current?.focus();
  }, [warning, busy]);

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

    // A new address gets checked for reachability first, once. A failed probe is
    // only a warning — the second submit goes through so a temporarily-down
    // stream can still be saved, and `meta` then stays blank on purpose: the
    // stored codec/bitrate/station name describe the address that just left.
    // `meta` is a local because a `setProbeMeta` in this closure would not be
    // visible to the `addStream` call further down the same submit.
    let meta = probeMeta;
    if (urlIsNew && !probed) {
      setProbing(true);
      let verdict: tauri.ProbeVerdict = { ok: false, error: null, ...NO_META };
      try {
        verdict = await tauri.probeStream(trimmedUrl);
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
      meta = {
        icyName: verdict.icyName,
        bitrate: verdict.bitrate,
        format: verdict.format,
        unsupported: verdict.unsupported,
      };
      setProbeMeta(meta);
      // The probe reached the station and read what it sends: Tapir will not
      // record it. A warning, never a ban — the address may be worth keeping,
      // and the label rides into the profile either way, so the row says so and
      // the scheduler refuses without connecting (ADR 2026-08-31 §6).
      if (verdict.unsupported) {
        setWarning(
          verdict.unsupported.family
            ? m.stream_unsupported_codec_warning({ codec: verdict.unsupported.family })
            : m.stream_unsupported_unknown_warning(),
        );
        return;
      }
    }

    // Then the profile-level conflicts, also once. A new address is checked
    // against the URLs the profile already holds; a name is checked against the
    // names that would send two streams into one recording folder. Neither
    // refuses — an explicit second submit is respected. The URL speaks first
    // when both do: it is the stream's identity.
    if (!conflictsChecked) {
      let conflicts: tauri.StreamConflicts = { duplicateUrlOf: null, nameCollidesWith: null };
      try {
        conflicts = await tauri.checkStreamConflicts({
          url: urlIsNew ? trimmedUrl : undefined,
          name: isEdit ? name : undefined,
          excludeId: isEdit ? editStream.id : undefined,
        });
      } catch {
        // A pre-flight that cannot run must not block the save.
      }
      setConflictsChecked(true);
      // Both, when both fire: the check stands down after this submit, so a
      // warning held back now is a warning never heard. URL first — it is the
      // stream's identity.
      const clashes: string[] = [];
      if (conflicts.duplicateUrlOf) {
        clashes.push(m.stream_duplicate_url_warning({ name: conflicts.duplicateUrlOf }));
      }
      if (conflicts.nameCollidesWith) {
        clashes.push(m.stream_name_collision_warning({ name: conflicts.nameCollidesWith }));
      }
      if (clashes.length > 0) {
        setWarning(clashes.join(" "));
        return;
      }
    }

    setLoading(true);
    try {
      if (isEdit && editStream) {
        // Two call shapes, not one with holes: passing `url` is what tells the
        // backend to re-resolve the address and replace the probe metadata.
        const updated = urlIsNew
          ? await tauri.updateStream(editStream.id, name, trimmedUrl, meta)
          : await tauri.updateStream(editStream.id, name);
        $streams.set($streams.get().map((s) => s.id === updated.id ? updated : s));
        addToast(m.stream_updated({ name: updated.name }), "success");
      } else {
        const newStream = await tauri.addStream(trimmedUrl, name || undefined, meta);
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
            {/* URL first in both modes — one layout to remember. The initial
                focus still lands on the name when editing: F2 is muscle memory
                for "rename", and moving it here would cost the commonest action
                a Tab and one extra field read out. */}
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.stream_url()}
              <input
                type="url"
                value={url}
                onChange={(e) => changeUrl(e.target.value)}
                required
                autoFocus={!isEdit}
                disabled={busy}
                readOnly={urlLocked}
                aria-disabled={urlLocked || undefined}
                aria-describedby={urlLocked ? URL_LOCKED_HINT_ID : undefined}
                className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500 disabled:opacity-60 aria-disabled:opacity-60 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
                placeholder="https://..."
              />
            </label>
            {/* `readOnly` + `aria-disabled`, never native `disabled` — the house
                pattern (SelectionToolbar, ActivityBar). A natively disabled field
                leaves the tab order, so the screen reader would never reach it,
                never read the description, and the address would simply seem to
                have vanished from the dialog. */}
            {urlLocked && (
              <p
                id={URL_LOCKED_HINT_ID}
                className="text-xs text-slate-400 forced-colors:text-[CanvasText]"
              >
                {m.stream_url_locked()}
              </p>
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
                ref={submitRef}
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
