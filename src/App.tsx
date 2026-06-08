import { useEffect, useCallback, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { ActivityBar } from "./components/layout/ActivityBar";
import { StatusBar } from "./components/layout/StatusBar";
import { LiveAnnouncer } from "./components/common/LiveAnnouncer";
import { ToastContainer } from "./components/common/ToastContainer";
import { CommandPalette } from "./components/common/CommandPalette";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { KeyboardShortcutsDialog } from "./components/common/KeyboardShortcutsDialog";
import { ProfilesPanel } from "./components/profile/ProfilesPanel";
import { StreamsPanel } from "./components/streams/StreamsPanel";
import { WishlistPanel } from "./components/wishlist/WishlistPanel";
import { BrowserPanel } from "./components/browser/BrowserPanel";
import { SongsPanel } from "./components/songs/SongsPanel";
import { PlayerPanel } from "./components/player/PlayerPanel";
import { useZoneNavigation, type ZoneEntry } from "./hooks/useZoneNavigation";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useDiskSpacePolling } from "./hooks/useDiskSpacePolling";
import { useProfileSync } from "./hooks/useProfileSync";
import { useAnnounce } from "./hooks/useAnnounce";
import { $streams, updateStreamStatus } from "./stores/streams";
import { $settings } from "./stores/settings";
import { $playerStatus, $muteState } from "./stores/player";
import { $activeSection } from "./stores/navigation";
import { addToast } from "./stores/toasts";
import * as tauri from "./lib/tauri";
import type { RecordingStatusPayload, TrackChangedPayload, StreamErrorPayload, RecordingStartedPayload, RecordingCompletedPayload, StreamInfo, PlayerStatus, PlayerProgressPayload, WishlistMatchPayload, TrackIgnoredPayload, PlayerEndedPayload } from "./lib/tauri";
import { $filteredSongs } from "./stores/songs";
import { computePlaybackNeighbors } from "./stores/playbackNeighbors";
import { resolveEndedAction } from "./lib/playbackTransport";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import * as m from "./i18n/paraglide/messages";

const PERMANENT_ZONE_IDS = new Set(["activity-bar", "player", "status-bar"]);

function AppContent() {
  const announce = useAnnounce();
  const announceRef = useRef(announce);
  useEffect(() => { announceRef.current = announce; });
  const activeSection = useStore($activeSection);

  // ── Zone navigation ──────────────────────────────────────
  // Permanent zones: ActivityBar, Player, StatusBar — never unmount
  const activityBarZoneRef = useRef<ZoneEntry | null>(null);
  const playerZoneRef = useRef<ZoneEntry | null>(null);
  const statusBarZoneRef = useRef<ZoneEntry | null>(null);

  // Stable proxy ZoneEntry objects for permanent zones.
  // These are created once and always delegate to the CURRENT ref at call time,
  // preventing stale-closure bugs when a permanent zone recreates its ZoneEntry
  // (e.g. PlayerPanel recreates restoreFocusPlayer when playback state changes).
  const activityBarProxyRef = useRef<ZoneEntry>({
    id: "activity-bar",
    get el() { return activityBarZoneRef.current!.el; },
    focus: (dir) => activityBarZoneRef.current?.focus(dir),
  });
  const playerProxyRef = useRef<ZoneEntry>({
    id: "player",
    get el() { return playerZoneRef.current!.el; },
    focus: (dir) => playerZoneRef.current?.focus(dir),
  });
  const statusBarProxyRef = useRef<ZoneEntry>({
    id: "status-bar",
    get el() { return statusBarZoneRef.current!.el; },
    focus: (dir) => statusBarZoneRef.current?.focus(dir),
  });

  // Screen zones from the active panel — registered via onZonesChange
  const [screenZones, setScreenZones] = useState<ZoneEntry[]>([]);
  const orderedZonesRef = useRef<ZoneEntry[]>([]);

  // Keep orderedZonesRef in sync whenever screenZones changes.
  // Permanent zones use proxies (above) so they never go stale.
  useEffect(() => {
    orderedZonesRef.current = [
      activityBarProxyRef.current,
      ...screenZones,
      playerProxyRef.current,
      statusBarProxyRef.current,
    ];
  }, [screenZones]);

  const { exitZone } = useZoneNavigation(orderedZonesRef);

  // When the section changes, focus first screen zone after zones register
  const prevSectionRef = useRef(activeSection);
  useEffect(() => {
    if (prevSectionRef.current === activeSection) return;
    prevSectionRef.current = activeSection;
    const rafId = requestAnimationFrame(() => {
      const firstScreen = orderedZonesRef.current.find(
        (z) => !PERMANENT_ZONE_IDS.has(z.id)
      );
      firstScreen?.focus("forward");
    });
    return () => cancelAnimationFrame(rafId);
  }, [activeSection]);

  const onZonesChange = useCallback((zones: ZoneEntry[]) => {
    setScreenZones(zones);
  }, []);
  // ── End zone navigation ──────────────────────────────────

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
      // The window is already visible and OS-foreground (shown from Rust setup —
      // see src-tauri/src/lib.rs) so the webview initialized while foreground,
      // which is what lets NVDA attach to the document. Now that initial data has
      // loaded, move focus to the first nav item; NVDA announces it reliably.
      activityBarZoneRef.current?.focus("forward");
    });
  }, []);

  // Global Tier-2 webview shortcuts (Alt+digit, Ctrl+K, Ctrl+,, Ctrl+N, F1).
  // Capture-phase window listener extracted to a hook — see useGlobalShortcuts.
  useGlobalShortcuts();

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
    const prev = $playerStatus.get();
    $playerStatus.set(payload);

    const stateChangedToPlaying = prev.state === "stopped" && payload.state === "playing";
    const sourceChangedWhilePlaying =
      payload.state === "playing" &&
      (prev.source?.type !== payload.source?.type ||
        (payload.source?.type === "stream" &&
          prev.source?.type === "stream" &&
          prev.source.streamId !== payload.source.streamId) ||
        (payload.source?.type === "file" &&
          prev.source?.type === "file" &&
          prev.source.path !== payload.source.path));

    // ── Announce state transitions only ──────────────────────────────────────
    // Announce playback_started only on stopped→playing or source switch.
    // Volume-only events (set_volume IPC) and paused→playing are excluded.
    if (stateChangedToPlaying || sourceChangedWhilePlaying) {
      const src = payload.source;
      if (src?.type === "stream") {
        const name = $streams.get().find(s => s.id === src.streamId)?.name ?? src.streamId;
        announceRef.current(m.playback_started({ name }), "assertive");
      } else if (src?.type === "file") {
        const name = src.path.split(/[\\/]/).pop() ?? src.path;
        announceRef.current(m.playback_started({ name }), "assertive");
      }
    }
    // Note: paused→playing is announced by handlePlayPause, not here.
    if (prev.state !== "stopped" && payload.state === "stopped") {
      announceRef.current(m.playback_stopped(), "assertive");
    }

    // ── Mute state cleanup ───────────────────────────────────────────────────
    // Case 1: keyboard shortcut raised volume while muted — clear mute UI
    if ($muteState.get().muted && !$muteState.get().restoring && payload.volume > 0) {
      const { savedVolume } = $muteState.get();
      $muteState.set({ muted: false, savedVolume, restoring: false });
    }

    // Case 2: new source started (stopped→playing or source switch) while muted
    // Resume (paused→playing) intentionally excluded — user paused while muted, they
    // expect to stay muted on resume.
    if ((stateChangedToPlaying || sourceChangedWhilePlaying) && $muteState.get().muted) {
      const { savedVolume } = $muteState.get();
      tauri.setVolume(savedVolume)
        .then(() => $muteState.set({ muted: false, savedVolume, restoring: false }))
        .catch((e) => {
          console.error("mute restore failed on new source:", e);
          $muteState.set({ muted: true, savedVolume, restoring: false });
        });
    }

    // Unexpected stop while muted — restore volume.
    // restoring flag prevents re-entry if setVolume itself emits another stopped event.
    if (payload.state === "stopped" && $muteState.get().muted && !$muteState.get().restoring) {
      const { savedVolume } = $muteState.get();
      $muteState.set({ muted: true, savedVolume, restoring: true });
      tauri.setVolume(savedVolume)
        .then(() => {
          if ($muteState.get().restoring) {
            $muteState.set({ muted: false, savedVolume, restoring: false });
          }
        })
        .catch((e) => {
          if ($muteState.get().restoring) {
            console.error("mute restore failed:", e);
            $muteState.set({ muted: true, savedVolume, restoring: false });
          }
        });
    }
  }, []);

  const handlePlayerProgress = useCallback((payload: PlayerProgressPayload) => {
    $playerStatus.set({
      ...$playerStatus.get(),
      positionMs: payload.positionMs,
      durationMs: payload.durationMs,
    });
  }, []);

  const handlePlayerEnded = useCallback(async (payload: PlayerEndedPayload) => {
    const autoAdvance = $settings.get()?.autoAdvance ?? true;
    const neighbors = computePlaybackNeighbors(
      { type: "file", path: payload.path },
      $streams.get(),
      $filteredSongs.get(),
    );
    const action = resolveEndedAction(autoAdvance, neighbors);
    try {
      if (action.kind === "play-file") await tauri.playSavedSong(action.path);
      else await tauri.stopPlayback(); // end of list or autoAdvance off
    } catch (e) {
      console.error(e);
      // Skip-on-error guard: never loop through broken files — just stop.
      await tauri.stopPlayback().catch(() => {});
    }
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

  const handleStreamsChanged = useCallback(() => {
    tauri.getStreams().then((streams) => $streams.set(streams));
  }, []);

  useTauriEvent<RecordingStatusPayload>("recording-status", handleRecordingStatus);
  useTauriEvent<TrackChangedPayload>("track-changed", handleTrackChanged);
  useTauriEvent<StreamErrorPayload>("stream-error", handleStreamError);
  useTauriEvent<StreamInfo>("stream-info-updated", handleStreamInfoUpdated);
  const handleRecordingStarted = useCallback(() => {}, []);
  useTauriEvent<RecordingStartedPayload>("recording-started", handleRecordingStarted);
  useTauriEvent<RecordingCompletedPayload>("recording-completed", handleRecordingCompleted);
  useTauriEvent<PlayerStatus>("player-status", handlePlayerStatus);
  useTauriEvent<PlayerProgressPayload>("player-progress", handlePlayerProgress);
  useTauriEvent<PlayerEndedPayload>("player-ended", handlePlayerEnded);
  useTauriEvent<WishlistMatchPayload>("wishlist-match", handleWishlistMatch);
  useTauriEvent<TrackIgnoredPayload>("track-ignored", handleTrackIgnored);
  useTauriEvent("streams-changed", handleStreamsChanged);
  useDiskSpacePolling();
  useProfileSync();

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      <ActivityBar ref={activityBarZoneRef} exitZone={(forward: boolean) => exitZone("activity-bar", forward)} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {activeSection === "streams" && <StreamsPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
        {activeSection === "wishlist" && <WishlistPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
        {activeSection === "browser" && <BrowserPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
        {activeSection === "songs" && <SongsPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
        {activeSection === "profiles" && <ProfilesPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
        <PlayerPanel ref={playerZoneRef} exitZone={(forward: boolean) => exitZone("player", forward)} />
        <StatusBar ref={statusBarZoneRef} exitZone={(forward: boolean) => exitZone("status-bar", forward)} />
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
      <KeyboardShortcutsDialog />
      <LiveAnnouncer />
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
