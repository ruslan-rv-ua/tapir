import { Table, TableHeader, TableBody, Column } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { useState } from "react";
import type { SortDescriptor } from "react-aria-components";
import { $streams, $statuses } from "../../stores/streams";
import { StreamRow } from "./StreamRow";
import * as m from "../../i18n/paraglide/messages";

export function StreamTable() {
  const streams = useStore($streams);
  const statuses = useStore($statuses);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "name",
    direction: "ascending",
  });

  const sortedStreams = [...streams].sort((a, b) => {
    const dir = sortDescriptor.direction === "ascending" ? 1 : -1;
    if (sortDescriptor.column === "name") return a.name.localeCompare(b.name) * dir;
    if (sortDescriptor.column === "bitrate") return ((a.bitrate ?? 0) - (b.bitrate ?? 0)) * dir;
    return 0;
  });

  return (
    <div className="flex-1 overflow-auto">
      <Table
        aria-label={m.streams_section()}
        selectionMode="multiple"
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
        className="w-full text-sm"
      >
        <TableHeader className="border-b border-slate-700 text-xs text-slate-500 uppercase">
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
    </div>
  );
}
