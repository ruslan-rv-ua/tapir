import { Table, TableHeader, TableBody, Column } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { useState, useCallback } from "react";
import type { SortDescriptor } from "react-aria-components";
import { $streams, $statuses } from "../../stores/streams";
import { StreamRow } from "./StreamRow";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { addToast } from "../../stores/toasts";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import type { StreamInfo } from "../../lib/tauri";

export function StreamTable() {
  const streams = useStore($streams);
  const statuses = useStore($statuses);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "name",
    direction: "ascending",
  });
  const [pendingDelete, setPendingDelete] = useState<StreamInfo | null>(null);

  const sortedStreams = [...streams].sort((a, b) => {
    const dir = sortDescriptor.direction === "ascending" ? 1 : -1;
    if (sortDescriptor.column === "name") return a.name.localeCompare(b.name) * dir;
    if (sortDescriptor.column === "bitrate") return ((a.bitrate ?? 0) - (b.bitrate ?? 0)) * dir;
    return 0;
  });

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Delete") return;
    const row = (e.target as HTMLElement).closest("tr[data-key]");
    if (!row) return;
    const streamId = row.getAttribute("data-key");
    if (!streamId) return;
    const stream = streams.find((s) => s.id === streamId);
    if (!stream) return;
    e.preventDefault();
    setPendingDelete(stream);
  }, [streams]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await tauri.removeStream(pendingDelete.id);
      $streams.set($streams.get().filter((s) => s.id !== pendingDelete.id));
      addToast(m.stream_removed({ name: pendingDelete.name }), "info");
    } catch (err) {
      addToast(String(err), "error");
    }
    setPendingDelete(null);
  };

  return (
    <div className="flex-1 overflow-auto" onKeyDown={handleKeyDown}>
      <Table
        aria-label={m.streams_section()}
        selectionMode="multiple"
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
        className="w-full text-sm"
      >
        <TableHeader className="border-b border-slate-700 text-xs text-slate-500 uppercase forced-colors:border-[ButtonText]">
          <Column id="select" className="w-10 px-3 py-2" />
          <Column id="status" className="w-16 px-3 py-2">{m.column_status()}</Column>
          <Column id="name" isRowHeader allowsSorting className="px-3 py-2">{m.column_name()}</Column>
          <Column id="track" className="px-3 py-2">{m.column_track()}</Column>
          <Column id="bitrate" allowsSorting className="px-3 py-2">{m.column_bitrate()}</Column>
          <Column id="duration" className="px-3 py-2">{m.column_duration()}</Column>
          <Column id="actions" className="px-3 py-2" />
        </TableHeader>
        <TableBody>
          {sortedStreams.map((stream) => (
            <StreamRow
              key={stream.id}
              stream={stream}
              status={statuses[stream.id]}
            />
          ))}
        </TableBody>
      </Table>
      {pendingDelete && (
        <ConfirmDialog
          title={m.remove_stream()}
          message={m.confirm_delete_stream({ name: pendingDelete.name })}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
