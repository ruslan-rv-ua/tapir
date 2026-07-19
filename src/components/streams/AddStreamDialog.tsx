import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import * as tauri from "../../lib/tauri";
import { $streams, $showAddStreamDialog, $editStream } from "../../stores/streams";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

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
  // Set once a probe has failed for the URL currently in the field: the warning
  // is shown and the next submit skips the probe and saves anyway.
  const [probeFailed, setProbeFailed] = useState(false);

  // Sync form fields when dialog opens
  useEffect(() => {
    if (isOpen) {
      setUrl(editStream?.url ?? "");
      setName(editStream?.name ?? "");
      setError(null);
      setProbeFailed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Probing and saving both lock the form; only the label distinguishes them.
  const busy = loading || probing;

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
    if (!isEdit && !probeFailed) {
      setProbing(true);
      let ok = true;
      try {
        ok = (await tauri.probeStream(url)).ok;
      } catch {
        ok = false; // treat an IPC failure like an unreachable stream
      } finally {
        setProbing(false);
      }
      if (!ok) {
        setProbeFailed(true);
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
        const newStream = await tauri.addStream(url, name || undefined);
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
                  onChange={(e) => { setUrl(e.target.value); setProbeFailed(false); }}
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
                onChange={(e) => setName(e.target.value)}
                autoFocus={isEdit}
                disabled={busy}
                className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
              />
            </label>
            {error && <p role="alert" className="text-sm text-red-400 forced-colors:text-[CanvasText]">{error}</p>}
            {/* Probe status: polite so it does not cut off the field the user
                is in; one region for both states so NVDA sees a text change. */}
            <p aria-live="polite" className="text-sm text-amber-300 empty:hidden forced-colors:text-[CanvasText]">
              {probing ? m.stream_probe_checking() : probeFailed ? m.stream_probe_failed() : ""}
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
                {probing ? m.stream_probe_checking() : loading ? m.saving() : probeFailed ? m.stream_probe_add_anyway() : m.save()}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
