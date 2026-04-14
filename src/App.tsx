import { useEffect, useCallback, useRef } from "react";
import { ActivityBar } from "./components/layout/ActivityBar";
import { SectionHeader } from "./components/layout/SectionHeader";
import { StatusBar } from "./components/layout/StatusBar";
import { LiveAnnouncer } from "./components/common/LiveAnnouncer";
import { ToastContainer } from "./components/common/ToastContainer";
import { CommandPalette } from "./components/common/CommandPalette";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { StreamsPanel } from "./components/streams/StreamsPanel";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useAnnounce } from "./hooks/useAnnounce";
import { $streams, updateStreamStatus } from "./stores/streams";
import { $settings } from "./stores/settings";
import { $commandPaletteOpen } from "./stores/navigation";
import { addToast } from "./stores/toasts";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as tauri from "./lib/tauri";
import type { RecordingStatusPayload, TrackChangedPayload, StreamErrorPayload, RecordingStartedPayload, RecordingCompletedPayload, StreamInfo } from "./lib/tauri";
import * as m from "./i18n/paraglide/messages";

function AppContent() {
  const announce = useAnnounce();
  const announceRef = useRef(announce);
  useEffect(() => { announceRef.current = announce; });

  // Load initial data
  useEffect(() => {
    Promise.all([
      tauri.getStreams().then((streams) => {
        $streams.set(streams);
        if (streams.length === 0) announceRef.current(m.welcome_first_run(), "assertive");
      }),
      tauri.getAllStatuses().then((statuses) => {
        statuses.forEach((s) => updateStreamStatus(s.streamId, s));
      }),
      tauri.getSettings().then((settings) => {
        $settings.set(settings);
        document.documentElement.lang = settings.language === "uk-UA" ? "uk" : "en";
      }),
    ]).catch(console.error).finally(() => {
      getCurrentWindow().show();
    });
  }, []);

  // Ctrl+K keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        $commandPaletteOpen.set(!$commandPaletteOpen.get());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Subscribe to Tauri events
  const handleRecordingStatus = useCallback((payload: RecordingStatusPayload) => {
    if (payload.status === "recording") {
      updateStreamStatus(payload.streamId, { state: payload.status, recordingStartedAt: new Date().toISOString() });
    } else {
      updateStreamStatus(payload.streamId, { state: payload.status, recordingStartedAt: null });
    }
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

  const handleStreamInfoUpdated = useCallback((updated: StreamInfo) => {
    $streams.set($streams.get().map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const handleRecordingCompleted = useCallback((payload: RecordingCompletedPayload) => {
    const stream = $streams.get().find((s) => s.id === payload.streamId);
    const name = stream?.name ?? payload.streamId;
    announce(m.track_saved({ name, fileName: payload.fileName }), "polite");
  }, [announce]);

  useTauriEvent<RecordingStatusPayload>("recording-status", handleRecordingStatus);
  useTauriEvent<TrackChangedPayload>("track-changed", handleTrackChanged);
  useTauriEvent<StreamErrorPayload>("stream-error", handleStreamError);
  useTauriEvent<StreamInfo>("stream-info-updated", handleStreamInfoUpdated);
  useTauriEvent<RecordingStartedPayload>("recording-started", () => {});
  useTauriEvent<RecordingCompletedPayload>("recording-completed", handleRecordingCompleted);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      <ActivityBar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <SectionHeader title={m.streams_section()} />
        <StreamsPanel />
        <StatusBar />
      </main>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      <CommandPalette />
      <LiveAnnouncer />
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
