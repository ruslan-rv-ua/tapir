import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import * as tauri from "../../lib/tauri";
import type { ImportCandidate, ImportProgressPayload } from "../../lib/tauri";
import { $streams, $importCandidates } from "../../stores/streams";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

type RowStatus = "checking" | "ok" | "error" | "duplicate";

interface Row {
  url: string;
  name: string;
  status: RowStatus;
  checked: boolean;
  bitrate: number | null;
  format: string | null;
  error: string | null;
}

function seedRows(candidates: ImportCandidate[]): Row[] {
  return candidates.map((c) => ({
    url: c.url,
    name: c.name,
    status: c.alreadyInProfile ? "duplicate" : "checking",
    checked: !c.alreadyInProfile,
    bitrate: null,
    format: null,
    error: null,
  }));
}

function statusText(r: Row): string {
  if (r.status === "duplicate") return m.streams_import_status_duplicate();
  if (r.status === "checking") return m.streams_import_status_checking();
  if (r.status === "error") return m.streams_import_status_error({ error: r.error ?? "" });
  const details = [r.bitrate ? `${r.bitrate} kbps` : null, r.format ? r.format.toUpperCase() : null]
    .filter(Boolean)
    .join(" · ");
  return m.streams_import_status_ok({ details });
}

export function ImportStreamsDialog() {
  const candidates = useStore($importCandidates);
  const announce = useAnnounce();
  const [rows, setRows] = useState<Row[]>([]);
  const [committing, setCommitting] = useState(false);
  const isOpen = candidates !== null;

  // Seed rows and auto-start validation for non-duplicates when the dialog opens.
  useEffect(() => {
    if (!candidates) {
      setRows([]);
      return;
    }
    setRows(seedRows(candidates));
    const toCheck = candidates.filter((c) => !c.alreadyInProfile).map((c) => c.url);
    if (toCheck.length > 0) {
      tauri.validateImportCandidates(toCheck).catch((e) => addToast(String(e), "error"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  // Live updates from probe progress events.
  const onProgress = useCallback((p: ImportProgressPayload) => {
    setRows((prev) =>
      prev.map((r) =>
        r.url === p.url
          ? {
              ...r,
              status: p.status,
              // A stream that failed its probe defaults to unchecked (but stays
              // enabled — the user may still import an offline station).
              checked: p.status === "error" ? false : r.checked,
              name: p.status === "ok" && p.icyName ? p.icyName : r.name,
              bitrate: p.bitrate ?? r.bitrate,
              format: p.format ?? r.format,
              error: p.error ?? null,
            }
          : r,
      ),
    );
  }, []);
  useTauriEvent<ImportProgressPayload>("stream-import-progress", onProgress);

  const close = () => $importCandidates.set(null);

  const selectable = rows.filter((r) => r.status !== "duplicate");
  const allSelected = selectable.length > 0 && selectable.every((r) => r.checked);
  const selectedCount = selectable.filter((r) => r.checked).length;

  const toggle = (url: string) =>
    setRows((prev) => prev.map((r) => (r.url === url ? { ...r, checked: !r.checked } : r)));
  const toggleAll = () => {
    const next = !allSelected;
    setRows((prev) => prev.map((r) => (r.status === "duplicate" ? r : { ...r, checked: next })));
  };

  // aria-live progress / summary.
  const stillChecking = rows.filter((r) => r.status === "checking").length;
  const totalToCheck = selectable.length;
  const liveMessage =
    stillChecking > 0
      ? m.streams_import_progress({ done: totalToCheck - stillChecking, total: totalToCheck })
      : m.streams_import_summary({
          ok: rows.filter((r) => r.status === "ok").length,
          errors: rows.filter((r) => r.status === "error").length,
          duplicates: rows.filter((r) => r.status === "duplicate").length,
        });

  const handleImport = async () => {
    const selected = selectable.filter((r) => r.checked).map((r) => ({ url: r.url, name: r.name }));
    if (selected.length === 0) return;
    setCommitting(true);
    try {
      const result = await tauri.commitStreamImport(selected);
      $streams.set(await tauri.getStreams());
      const done = m.streams_import_done({ added: result.added, skipped: result.skipped });
      addToast(done, "success");
      announce(done);
      close();
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) close(); }}
    >
      <Modal className="flex max-h-[80vh] w-[32rem] flex-col rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="flex min-h-0 flex-col outline-none" aria-label={m.streams_import_title()}>
          <Heading slot="title" className="mb-3 text-lg font-semibold text-slate-100">
            {m.streams_import_title()}
          </Heading>

          <div aria-live="polite" className="sr-only">{liveMessage}</div>

          <button
            type="button"
            onClick={toggleAll}
            className="mb-2 self-start rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            {allSelected ? m.streams_import_deselect_all() : m.streams_import_select_all()}
          </button>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.url} className="flex items-center gap-2 border-b border-slate-700/50 py-1.5 forced-colors:border-[ButtonText]">
                <input
                  type="checkbox"
                  checked={r.checked}
                  disabled={r.status === "duplicate"}
                  onChange={() => toggle(r.url)}
                  aria-label={m.streams_import_select_row({ name: r.name })}
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">{r.name}</span>
                  <span className="block truncate text-xs text-slate-500">{r.url}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{statusText(r)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.cancel()}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedCount === 0 || committing}
              aria-busy={committing || undefined}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.streams_import_confirm({ count: selectedCount })}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
