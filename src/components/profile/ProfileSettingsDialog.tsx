import { useId, useState } from "react";
import {
  Modal, ModalOverlay, Dialog, Heading, Checkbox, Label,
} from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  /** Profile the settings apply to (may be inactive). */
  name: string;
  /** Current per-profile autoplay policy. */
  initialEnabled: boolean;
  busy: boolean;
  onConfirm: (enabled: boolean) => void;
  onCancel: () => void;
}

/**
 * Per-profile settings dialog (resume-last-playback). A plain `role="dialog"`
 * (not `alertdialog`) — this is a settings surface, not a destructive prompt.
 * Rendered as a sibling of the profile collection (see ProfilesPanel) to avoid
 * the portal-inside-collection double-mount that aria-hides NVDA.
 */
export function ProfileSettingsDialog({ name, initialEnabled, busy, onConfirm, onCancel }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const hintId = useId();

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      isOpen
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <Modal className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog role="dialog" className="outline-none flex flex-col gap-4">
          <Heading slot="title" className="text-base font-semibold text-slate-100">
            {m.profile_settings_title({ name })}
          </Heading>

          <Checkbox
            isSelected={enabled}
            onChange={setEnabled}
            aria-describedby={hintId}
            className="group flex items-start gap-2 text-sm text-slate-200"
          >
            <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-500 group-data-[selected=true]:border-blue-400 group-data-[selected=true]:bg-blue-500 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-blue-400 forced-colors:border-[ButtonText]">
              {enabled && <span aria-hidden="true">✓</span>}
            </div>
            <Label className="cursor-pointer select-none">{m.profile_autoplay_label()}</Label>
          </Checkbox>
          <p id={hintId} className="text-xs text-slate-400 forced-colors:text-[GrayText]">
            {m.profile_autoplay_hint()}
          </p>

          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:text-[ButtonText]"
            >
              {m.cancel()}
            </button>
            <button
              onClick={() => onConfirm(enabled)}
              disabled={busy}
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
