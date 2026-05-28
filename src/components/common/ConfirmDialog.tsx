import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog role="alertdialog" className="outline-none">
          <Heading slot="title" className="mb-2 text-lg font-semibold text-slate-100">{title}</Heading>
          <p className="mb-6 text-sm text-slate-400">{message}</p>
          <div className="flex justify-end gap-2">
            <button
              autoFocus
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 forced-colors:text-[ButtonText]"
            >
              {m.cancel()}
            </button>
            <button
              onClick={onConfirm}
              className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            >
              {confirmLabel ?? m["delete"]()}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
