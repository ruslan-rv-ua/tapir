import { useEffect, useCallback } from "react";
import { ActivityBar } from "./components/layout/ActivityBar";
import { SectionHeader } from "./components/layout/SectionHeader";
import { StatusBar } from "./components/layout/StatusBar";
import { LiveAnnouncer } from "./components/common/LiveAnnouncer";
import { ToastContainer } from "./components/common/ToastContainer";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useAnnounce } from "./hooks/useAnnounce";
import { $streams, $statuses, updateStreamStatus } from "./stores/streams";
import { addToast } from "./stores/toasts";
import * as tauri from "./lib/tauri";
import type { RecordingStatusPayload, TrackChangedPayload, StreamErrorPayload } from "./lib/tauri";
import * as m from "./i18n/paraglide/messages";

// StreamsPanel is created in Task 16 — use a placeholder for now
function StreamsPanelPlaceholder() {
  return <div className="flex flex-1 items-center justify-center text-slate-500">Streams panel (Task 16)</div>;
}

function AppContent() {
  const announce = useAnnounce();

  // Load initial data
  useEffect(() => {
    tauri.getStreams().then((streams) => $streams.set(streams)).catch(console.error);
    tauri.getAllStatuses().then((statuses) => {
      statuses.forEach((s) => updateStreamStatus(s.streamId, s));
    }).catch(console.error);
  }, []);

  // Subscribe to Tauri events
  const handleRecordingStatus = useCallback((payload: RecordingStatusPayload) => {
    updateStreamStatus(payload.streamId, { state: payload.status });
    const stream = $streams.get().find((s) => s.id === payload.streamId);
    const name = stream?.name ?? payload.streamId;
    if (payload.status === "recording") {
      announce(m.recording_started({ name }), "polite");
      addToast(m.recording_started({ name }), "success");
    } else if (payload.status === "stopped") {
      announce(m.recording_stopped({ name }), "polite");
    } else if (payload.status === "error") {
      announce(m.connection_error({ name }), "assertive");
      addToast(m.connection_error({ name }), "error");
    }
  }, [announce]);

  const handleTrackChanged = useCallback((payload: TrackChangedPayload) => {
    updateStreamStatus(payload.streamId, {
      currentTrack: { artist: payload.artist, title: payload.title, album: payload.album, startedAt: new Date().toISOString() },
    });
  }, []);

  const handleStreamError = useCallback((payload: StreamErrorPayload) => {
    const stream = $streams.get().find((s) => s.id === payload.streamId);
    const name = stream?.name ?? payload.streamId;
    addToast(`${name}: ${payload.message}`, "error");
  }, []);

  useTauriEvent<RecordingStatusPayload>("recording-status", handleRecordingStatus);
  useTauriEvent<TrackChangedPayload>("track-changed", handleTrackChanged);
  useTauriEvent<StreamErrorPayload>("stream-error", handleStreamError);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      <ActivityBar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <SectionHeader title={m.streams_section()} />
        <StreamsPanelPlaceholder />
        <StatusBar />
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      <LiveAnnouncer />
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
