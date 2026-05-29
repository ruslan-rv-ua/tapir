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
  onSaved: (updated: Song) => void;
}

export function TagEditorDialog({ song, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [album, setAlbum] = useState(song.album);
  const [genre, setGenre] = useState(song.genre);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const updated = await tauri.updateSongTags(song.path, artist, title, album, genre);
      addToast(m.songs_toast_tags_saved(), "success");
      onSaved(updated);
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
      <Modal className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {m.tag_editor_title()}
          </Heading>
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.tag_editor_song_title()}
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.tag_editor_artist()}
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.tag_editor_album()}
              <input
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.tag_editor_genre()}
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
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
                disabled={submitting}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
              >
                {m.tag_editor_save()}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
