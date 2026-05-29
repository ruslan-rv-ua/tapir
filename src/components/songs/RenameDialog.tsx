import { useState } from "react";
import type { FormEvent } from "react";
import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import type { Song } from "../../types/song";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  song: Song;
  onClose: () => void;
  onSaved: (updated: Song, oldPath: string) => void;
}

export function RenameDialog({ song, onClose, onSaved }: Props) {
  const stem = song.fileName.replace(/\.[^.]+$/, "");
  const [name, setName] = useState(stem);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const updated = await tauri.renameSong(song.path, name.trim());
      addToast(m.songs_toast_renamed({ newName: updated.fileName }), "success");
      onSaved(updated, song.path);
      onClose();
    } catch (err) {
      addToast(m.songs_toast_failed({ error: String(err) }), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {m.rename_dialog_title()}
          </Heading>
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.rename_dialog_label()}
              <input
                autoFocus
                value={name}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setName(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50 forced-colors:text-[ButtonText]"
              >
                {m.cancel()}
              </button>
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
              >
                {m.rename_dialog_save()}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
