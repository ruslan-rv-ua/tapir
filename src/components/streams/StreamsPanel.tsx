import { useStore } from "@nanostores/react";
import { useState, useEffect } from "react";
import { $streams } from "../../stores/streams";
import { StreamTable } from "./StreamTable";
import { AddStreamDialog } from "./AddStreamDialog";
import { addToast } from "../../stores/toasts";
import { useAnnounce } from "../../hooks/useAnnounce";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const announce = useAnnounce();
  useEffect(() => {
    announce(m.welcome_first_run(), "assertive");
  }, [announce]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-400">
      <p className="text-lg font-medium text-slate-300">{m.empty_state_title()}</p>
      <p className="text-sm">{m.empty_state_description()}</p>
      <button
        autoFocus
        onClick={onAdd}
        className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
      >
        {m.add_stream()}
      </button>
    </div>
  );
}

function Toolbar({ onAdd }: { onAdd: () => void }) {
  const handleStopAll = async () => {
    try {
      await tauri.stopAllRecordings();
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-2">
      <button
        onClick={onAdd}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
      >
        {m.add_stream()}
      </button>
      <button
        onClick={handleStopAll}
        className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
      >
        {m.stop_all()}
      </button>
    </div>
  );
}

export function StreamsPanel() {
  const streams = useStore($streams);
  const [showAddDialog, setShowAddDialog] = useState(false);

  if (streams.length === 0) {
    return (
      <>
        <EmptyState onAdd={() => setShowAddDialog(true)} />
        {showAddDialog && <AddStreamDialog onClose={() => setShowAddDialog(false)} />}
      </>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Toolbar onAdd={() => setShowAddDialog(true)} />
      <StreamTable />
      {showAddDialog && <AddStreamDialog onClose={() => setShowAddDialog(false)} />}
    </div>
  );
}
