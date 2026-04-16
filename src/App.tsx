import { useEffect, useCallback, useRef } from "react";
import { useStore } from "@nanostores/react";
import { ActivityBar } from "./components/layout/ActivityBar";
import { SectionHeader } from "./components/layout/SectionHeader";
import { StatusBar } from "./components/layout/StatusBar";
import { LiveAnnouncer } from "./components/common/LiveAnnouncer";
import { ToastContainer } from "./components/common/ToastContainer";
import { CommandPalette } from "./components/common/CommandPalette";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { StreamsPanel } from "./components/streams/StreamsPanel";
import { WishlistPanel } from "./components/wishlist/WishlistPanel";
import { PlayerPanel } from "./components/player/PlayerPanel";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useAnnounce } from "./hooks/useAnnounce";
import { $streams, updateStreamStatus } from "./stores/streams";
import { $settings } from "./stores/settings";
import { $settingsDialogOpen } from "./stores/settings";
import { $playerStatus } from "./stores/player";
import { $activeSection } from "./stores/navigation";
import { $commandPaletteOpen } from "./stores/navigation";
import { addToast } from "./stores/toasts";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as tauri from "./lib/tauri";
import type { RecordingStatusPayload, TrackChangedPayload, StreamErrorPayload, RecordingStartedPayload, RecordingCompletedPayload, StreamInfo, PlayerStatus, PlayerProgressPayload, WishlistMatchPayload, TrackIgnoredPayload } from "./lib/tauri";
import * as m from "./i18n/paraglide/messages";

function AppContent() {
  const announce = useAnnounce();
  const announceRef = useRef(announce);
  useEffect(() => { announceRef.current = announce; });
  const activeSection = useStore($activeSection);

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
        if (settings.theme !== "auto") {
          document.documentElement.setAttribute("data-theme", settings.theme);
        }
      }),
      tauri.getPlayerStatus().then((status) => {
        $playerStatus.set(status);
      }),
    ]).catch(console.error).finally(() => {
      getCurrentWindow().show();
    });
  }, []);

  // Ctrl+K and Ctrl+, keyboard handlers
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        $commandPaletteOpen.set(!$commandPaletteOpen.get());
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        $settingsDialogOpen.set(!$settingsDialogOpen.get());
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

  const handlePlayerStatus = useCallback((payload: PlayerStatus) => {
    $playerStatus.set(payload);
    if (payload.state === "playing") {
      const src = payload.source;
      if (src?.type === "stream") {
        const name = $streams.get().find(s => s.id === src.streamId)?.name ?? src.streamId;
        announceRef.current(m.playback_started({ name }), "assertive");
      } else if (src?.type === "file") {
        const name = src.path.split(/[\\/]/).pop() ?? src.path;
        announceRef.current(m.playback_started({ name }), "assertive");
      }
    } else if (payload.state === "stopped" && !payload.source) {
      // Unexpected stop (stream disconnected, file ended naturally).
      // User-initiated stop is also handled here; PlayerPanel may double-announce briefly.
      announceRef.current(m.playback_stopped(), "assertive");
    }
  }, []);

  const handlePlayerProgress = useCallback((payload: PlayerProgressPayload) => {
    $playerStatus.set({
      ...$playerStatus.get(),
      positionMs: payload.positionMs,
      durationMs: payload.durationMs,
    });
  }, []);

  const handleRecordingCompleted = useCallback((payload: RecordingCompletedPayload) => {
    const stream = $streams.get().find((s) => s.id === payload.streamId);
    const name = stream?.name ?? payload.streamId;
    announce(m.track_saved({ name, fileName: payload.fileName }), "polite");
  }, [announce]);

  const handleWishlistMatch = useCallback((payload: WishlistMatchPayload) => {
    announce(m.announcement_wishlist_match({ title: `${payload.artist} — ${payload.title}` }), "assertive");
  }, [announce]);

  const handleTrackIgnored = useCallback((payload: TrackIgnoredPayload) => {
    announce(m.announcement_track_ignored({ title: `${payload.artist} — ${payload.title}` }), "polite");
  }, [announce]);

  useTauriEvent<RecordingStatusPayload>("recording-status", handleRecordingStatus);
  useTauriEvent<TrackChangedPayload>("track-changed", handleTrackChanged);
  useTauriEvent<StreamErrorPayload>("stream-error", handleStreamError);
  useTauriEvent<StreamInfo>("stream-info-updated", handleStreamInfoUpdated);
  useTauriEvent<RecordingStartedPayload>("recording-started", () => {});
  useTauriEvent<RecordingCompletedPayload>("recording-completed", handleRecordingCompleted);
  useTauriEvent<PlayerStatus>("player-status", handlePlayerStatus);
  useTauriEvent<PlayerProgressPayload>("player-progress", handlePlayerProgress);
  useTauriEvent<WishlistMatchPayload>("wishlist-match", handleWishlistMatch);
  useTauriEvent<TrackIgnoredPayload>("track-ignored", handleTrackIgnored);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      <ActivityBar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <SectionHeader title={activeSection === "wishlist" ? m.wishlist_section() : m.streams_section()} />
        {activeSection === "streams" && <StreamsPanel />}
        {activeSection === "wishlist" && <WishlistPanel />}
        <PlayerPanel />
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
      <SettingsDialog />
      <LiveAnnouncer />
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
