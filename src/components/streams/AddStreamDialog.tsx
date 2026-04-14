import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useState } from "react";
import * as tauri from "../../lib/tauri";
import type { StreamInfo } from "../../lib/tauri";
import { $streams } from "../../stores/streams";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onClose: () => void;
  editStream?: StreamInfo; // if provided, edit mode
}

export function AddStreamDialog({ onClose, editStream }: Props) {
  const [url, setUrl] = useState(editStream?.url ?? "");
  const [name, setName] = useState(editStream?.name ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!editStream;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isEdit && editStream) {
        const updated = await tauri.updateStream(editStream.id, name);
        $streams.set($streams.get().map((s) => s.id === updated.id ? updated : s));
        addToast(m.stream_added({ name: updated.name }), "success");
      } else {
        const newStream = await tauri.addStream(url, name || undefined);
        $streams.set([...$streams.get(), newStream]);
        addToast(m.stream_added({ name: newStream.name }), "success");
      }
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <Modal className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {isEdit ? m.edit_stream() : m.add_stream()}
          </Heading>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {!isEdit && (
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                {m.stream_url()}
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  autoFocus
                  disabled={loading}
                  className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500"
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
                disabled={loading}
                className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500"
              />
            </label>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                {m.cancel()}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "..." : m.save()}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
