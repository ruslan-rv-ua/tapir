import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import type { Song } from "../../types/song";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  song: Song;
  onClose: () => void;
}

const INVALID_CHARS = /[<>:"/\\|?*]/;

export function RenameDialog({ song, onClose }: Props) {
  const stem = song.fileName.replace(/\.[^.]+$/, "");
  const [name, setName] = useState(stem);
  const [submitting, setSubmitting] = useState(false);

  const cancelledRef = useRef(false);
  useEffect(() => () => { cancelledRef.current = true; }, []);

  const hasInvalidChars = INVALID_CHARS.test(name);
  const isValid = name.trim().length > 0 && !hasInvalidChars;
  const isDirty = name.trim() !== stem;

  const tryClose = () => {
    if (isDirty && !window.confirm(m.rename_dialog_unsaved_confirm())) return;
    onClose();
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    try {
      const updated = await tauri.renameSong(song.path, name.trim());
      if (cancelledRef.current) return;
      addToast(m.songs_toast_renamed({ newName: updated.fileName }), "success");
      onClose();
    } catch (err) {
      if (cancelledRef.current) return;
      addToast(m.songs_toast_failed({ error: String(err) }), "error");
    } finally {
      if (!cancelledRef.current) setSubmitting(false);
    }
  };

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) tryClose(); }}
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
            {hasInvalidChars && (
              <p className="text-xs text-amber-400 forced-colors:text-[Mark]" role="alert">
                {m.rename_dialog_invalid_chars()}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={tryClose}
                disabled={submitting}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50 forced-colors:text-[ButtonText]"
              >
                {m.cancel()}
              </button>
              <button
                type="submit"
                disabled={submitting || !isValid}
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
