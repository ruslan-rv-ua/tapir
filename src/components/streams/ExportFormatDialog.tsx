import { Dialog, Modal, ModalOverlay, Heading, RadioGroup, Radio } from "react-aria-components";
import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import * as tauri from "../../lib/tauri";
import { $showExportStreamsDialog } from "../../stores/streams";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

export function ExportFormatDialog() {
  const isOpen = useStore($showExportStreamsDialog);
  const announce = useAnnounce();
  const [format, setFormat] = useState<"m3u8" | "pls">("m3u8");
  const [busy, setBusy] = useState(false);

  // Reset to default each time the dialog opens.
  useEffect(() => {
    if (isOpen) setFormat("m3u8");
  }, [isOpen]);

  const close = () => $showExportStreamsDialog.set(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      await tauri.exportStreams(format);
      announce(m.streams_export_done());
      close();
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) close(); }}
    >
      <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none" aria-label={m.streams_export_title()}>
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {m.streams_export_title()}
          </Heading>
          <RadioGroup
            aria-label={m.streams_export_format_label()}
            value={format}
            onChange={(v) => setFormat(v as "m3u8" | "pls")}
            className="flex flex-col gap-2 text-sm text-slate-200"
          >
            <Radio value="m3u8" className="flex items-center gap-2 cursor-pointer">M3U8</Radio>
            <Radio value="pls" className="flex items-center gap-2 cursor-pointer">PLS</Radio>
          </RadioGroup>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.cancel()}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy}
              aria-busy={busy || undefined}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.streams_export_confirm()}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
