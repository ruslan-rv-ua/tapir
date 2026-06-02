import {
  Modal, ModalOverlay, Dialog, Heading, TextField, Input, Label,
} from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  title: string;
  value: string;
  error: string | null;
  busy: boolean;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ProfileNameDialog({ title, value, error, busy, onChange, onConfirm, onCancel }: Props) {
  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      isOpen
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog role="alertdialog" className="outline-none flex flex-col gap-4">
          <Heading slot="title" className="text-base font-semibold text-slate-100">{title}</Heading>
          <TextField
            autoFocus
            value={value}
            onChange={onChange}
            isInvalid={!!error}
            className="flex flex-col gap-1"
          >
            <Label className="text-sm text-slate-300">{m.profile_new_name_label()}</Label>
            <Input className="rounded bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
            {error && <span role="alert" className="text-xs text-red-400">{error}</span>}
          </TextField>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:text-[ButtonText]"
            >
              {m.cancel()}
            </button>
            <button
              onClick={onConfirm}
              disabled={busy || !value.trim()}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            >
              {m.ok()}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
