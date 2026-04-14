import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, onConfirm, onCancel }: Props) {
  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none">
        <Dialog role="alertdialog" className="outline-none">
          <Heading slot="title" className="mb-2 text-lg font-semibold text-slate-100">{title}</Heading>
          <p className="mb-6 text-sm text-slate-400">{message}</p>
          <div className="flex justify-end gap-2">
            <button
              autoFocus
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            >
              {m.cancel()}
            </button>
            <button
              onClick={onConfirm}
              className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
            >
              {m["delete"]()}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
