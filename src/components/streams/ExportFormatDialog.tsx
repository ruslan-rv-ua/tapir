import { Dialog, Modal, ModalOverlay, Heading, RadioGroup, Radio } from "react-aria-components";
import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import * as tauri from "../../lib/tauri";
import { $showExportStreamsDialog } from "../../stores/streams";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

type ExportFormat = "m3u8" | "pls";

const FORMATS: { value: ExportFormat; label: string; desc: () => string }[] = [
  { value: "m3u8", label: "M3U8", desc: () => m.streams_export_m3u8_desc() },
  { value: "pls", label: "PLS", desc: () => m.streams_export_pls_desc() },
];

export function ExportFormatDialog() {
  const isOpen = useStore($showExportStreamsDialog);
  const announce = useAnnounce();
  const [format, setFormat] = useState<ExportFormat>("m3u8");
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
      <Modal className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none" aria-label={m.streams_export_title()}>
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {m.streams_export_title()}
          </Heading>
          <RadioGroup
            aria-label={m.streams_export_format_label()}
            value={format}
            onChange={(v) => setFormat(v as ExportFormat)}
            className="flex flex-col gap-2"
          >
            {FORMATS.map((f) => (
              <Radio
                key={f.value}
                value={f.value}
                aria-label={f.label}
                aria-describedby={`export-format-desc-${f.value}`}
                className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[.06] bg-white/[.04] p-4 hover:bg-white/[.08] data-[selected]:border-blue-500/60 data-[selected]:bg-blue-600/10 data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-blue-400 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas] forced-colors:data-[selected]:bg-[Highlight] forced-colors:data-[selected]:text-[HighlightText]"
              >
                {/* Radio indicator — RAC renders no native input, draw our own */}
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-slate-500 group-data-[selected]:border-blue-500 forced-colors:border-[ButtonText]"
                >
                  <span className="h-2 w-2 rounded-full bg-blue-500 opacity-0 group-data-[selected]:opacity-100 forced-colors:bg-[Highlight]" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-slate-100 forced-colors:text-inherit">{f.label}</span>
                  <span id={`export-format-desc-${f.value}`} className="text-xs text-slate-400 forced-colors:text-inherit">
                    {f.desc()}
                  </span>
                </span>
              </Radio>
            ))}
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
