import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useState } from "react";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  /** "wishlist" or "ignorelist" */
  listType: "wishlist" | "ignorelist";
  /** Pre-filled pattern (e.g. from context menu current track) */
  initialPattern?: string;
  /** If set, we're editing an existing pattern */
  editingPattern?: string;
  onSubmit: (pattern: string) => void;
  onClose: () => void;
}

export function AddPatternDialog({ listType, initialPattern, editingPattern, onSubmit, onClose }: Props) {
  const [pattern, setPattern] = useState(editingPattern ?? initialPattern ?? "");
  const isEdit = !!editingPattern;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pattern.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const title = isEdit ? m.edit_pattern() : m.add_pattern();

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <Modal className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {title}
          </Heading>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.pattern_label()}
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                required
                autoFocus
                aria-describedby="pattern-hint"
                className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500"
              />
            </label>
            <p id="pattern-hint" className="text-xs text-slate-500">
              {m.pattern_hint()}
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                {m.cancel()}
              </button>
              <button
                type="submit"
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                {isEdit ? m.save() : m.add_pattern()}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
