import { useEffect, useCallback, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { ActivityBar } from "./components/layout/ActivityBar";
import { StatusBar } from "./components/layout/StatusBar";
import { LiveAnnouncer } from "./components/common/LiveAnnouncer";
import { ToastContainer } from "./components/common/ToastContainer";
import { CommandPalette } from "./components/common/CommandPalette";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { HelpDialog } from "./components/common/HelpDialog";
import { ProfilesPanel } from "./components/profile/ProfilesPanel";
import { ProfileSettingsDialogHost } from "./components/profile/ProfileSettingsDialog";
import { StreamsPanel } from "./components/streams/StreamsPanel";
import { WishlistPanel } from "./components/wishlist/WishlistPanel";
import { BrowserPanel } from "./components/browser/BrowserPanel";
import { SongsPanel } from "./components/songs/SongsPanel";
import { SchedulePanel } from "./components/schedule/SchedulePanel";
import { PlayerPanel } from "./components/player/PlayerPanel";
import { useZoneNavigation, type ZoneEntry } from "./hooks/useZoneNavigation";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useDiskSpacePolling } from "./hooks/useDiskSpacePolling";
import { useProfileSync } from "./hooks/useProfileSync";
import { useCliFeedback } from "./hooks/useCliFeedback";
import { useAutostartFeedback } from "./hooks/useAutostartFeedback";
import { useHotkeyBusyFeedback } from "./hooks/useHotkeyBusyFeedback";
import { useCrashResumeFeedback } from "./hooks/useCrashResumeFeedback";
import { useBrowserProbeFeedback } from "./hooks/useBrowserProbeFeedback";
import { useScheduleEvents } from "./hooks/useScheduleEvents";
import { useAnnounce } from "./hooks/useAnnounce";
import { $streams, $statuses, updateStreamStatus } from "./stores/streams";
import { $settings, $profileSettings } from "./stores/settings";
import { $muteState, $playerStatus } from "./stores/player";
import { $wishlist, $wishlistMatches, prependMatch } from "./stores/wishlist";
import { $activeSection } from "./stores/navigation";
import { SECTIONS } from "./lib/sections";
import { addToast } from "./stores/toasts";
import * as tauri from "./lib/tauri";
import type { RecordingStatusPayload, TrackChangedPayload, StreamErrorPayload, StreamUnsupportedPayload, RecordingStartedPayload, RecordingCompletedPayload, StreamInfo, PlayerStatus, PlayerProgressPayload, WishlistMatch, PlayerEndedPayload, PlaybackAnnounce } from "./lib/tauri";
import { $filteredSongs } from "./stores/songs";
import { computePlaybackNeighbors } from "./stores/playbackNeighbors";
import { resolveEndedAction } from "./lib/playbackTransport";
import { executeTransportSkip, parseSkipTrigger } from "./lib/transportControl";
import { applyMuteCleanup } from "./lib/muteCleanup";
import { rememberVolumeLevel, selectVolumeAnnouncement } from "./lib/muteControl";
import { selectPlaybackAnnouncement, sourceName, suppressesStarted, type PendingConnect } from "./lib/playbackAnnounce";
import { formatTimeParts } from "./lib/time";
import { windowTitleLabel } from "./lib/windowTitle";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useWebviewGuard } from "./hooks/useWebviewGuard";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as m from "./i18n/paraglide/messages";

const PERMANENT_ZONE_IDS = new Set(["activity-bar", "player", "status-bar"]);

function AppContent() {
  const announce = useAnnounce();
  const announceRef = useRef(announce);
  useEffect(() => { announceRef.current = announce; });
  const activeSection = useStore($activeSection);
  const settings = useStore($settings);
  const playerStatus = useStore($playerStatus);
  const statuses = useStore($statuses);

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
    focus: (dir) => activityBarZoneRef.current?.focus(dir),
  });
  const playerProxyRef = useRef<ZoneEntry>({
    id: "player",
    focus: (dir) => playerZoneRef.current?.focus(dir),
  });
  const statusBarProxyRef = useRef<ZoneEntry>({
    id: "status-bar",
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
    // Announce the section name so screen-reader users get the section identity
    // regardless of where focus subsequently lands. Polite + bare label, sourced
    // from the shared SECTIONS registry (locale-aware getter).
    const sectionLabel = SECTIONS.find((s) => s.id === activeSection)?.label();
    if (sectionLabel) announceRef.current(sectionLabel, "polite");
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
      // Журнал сіється тут, а не на монтуванні екрана: збіги йдуть, поки
      // застосунок згорнутий, і вкладку могли жодного разу не відкрити.
      tauri.getWishlistMatches().then((matches) => $wishlistMatches.set(matches)),
      tauri.getSettings().then(async (settings) => {
        $settings.set(settings);
        document.documentElement.lang = settings.language === "uk-UA" ? "uk" : "en";
        if (settings.theme !== "auto") {
          document.documentElement.setAttribute("data-theme", settings.theme);
        }
        // Профільні налаштування потрібні вже в першому кадрі: з них читають
        // StatusBar (поріг диску) і stores/streams (сортування). Наповнити їх
        // лише при відкритті діалогу означало б показати дефолти й смикнутися.
        $profileSettings.set(await tauri.getProfileSettings(settings.activeProfile));
      }),
      tauri.getPlayerStatus().then((status) => {
        $playerStatus.set(status);
        // Seed the level memory from the profile's own level; a profile that
        // starts at zero leaves it at FALLBACK_VOLUME, which is what that
        // constant is for.
        rememberVolumeLevel(status.volume);
      }),
    ]).catch(console.error).finally(() => {
      // The window is already visible and OS-foreground (shown from Rust setup —
      // see src-tauri/src/lib.rs) so the webview initialized while foreground,
      // which is what lets NVDA attach to the document. Now that initial data has
      // loaded, move focus to the first nav item; NVDA announces it reliably.
      activityBarZoneRef.current?.focus("forward");
      // Scheduler (Phase 3D §3.5): тік-цикл стартує лише після ready-сигналу,
      // щоб catch-up першого тіка не емітив події до підписки webview.
      tauri.frontendReady().catch(console.error);
    });
  }, []);

  // Window title: show the current track/file when showTrackInTitle is enabled.
  // Covers all playback sources (stream / file / preview) \u2014 see windowTitleLabel.
  useEffect(() => {
    const win = getCurrentWindow();
    const appTitle = "Tapir";
    const label = settings?.showTrackInTitle
      ? windowTitleLabel(playerStatus.source, statuses)
      : null;
    win.setTitle(label ? `${label} \u00b7 ${appTitle}` : appTitle);
  }, [settings?.showTrackInTitle, playerStatus.source, statuses]);

  // Global Tier-2 webview shortcuts (Alt+digit, Ctrl+K, Ctrl+,, Ctrl+N, Ctrl+F, F1).
  // Capture-phase window listener extracted to a hook — see useGlobalShortcuts.
  // The zone list goes in for Ctrl+F: it is already section-scoped, so the
  // "search field of this screen" needs no separate registry.
  useGlobalShortcuts(orderedZonesRef);

  // Neutralises WebView2's own accelerators (F5/Ctrl+R reload, F3/F7/F11) and the
  // native context menu outside text fields — see useWebviewGuard.
  useWebviewGuard();

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
      currentTrack: {
        artist: payload.artist,
        title: payload.title,
        album: payload.album,
        startedAt: new Date().toISOString(),
        ignored: payload.ignored,
      },
    });
  }, []);

  const handleStreamError = useCallback((payload: StreamErrorPayload) => {
    const stream = $streams.get().find((s) => s.id === payload.streamId);
    const name = stream?.name ?? payload.streamId;
    addToast(`${name}: ${payload.message}`, "error");
  }, []);

  // Відмова записувати, а не збій: стан потоку лишається чистим, і текст не
  // радить повторити спробу — вердикт про ефір той самий (ADR 2026-08-31).
  const handleStreamUnsupported = useCallback((payload: StreamUnsupportedPayload) => {
    const stream = $streams.get().find((s) => s.id === payload.streamId);
    const name = stream?.name ?? payload.streamId;
    addToast(
      payload.family
        ? m.stream_unsupported_codec({ name, codec: payload.family })
        : m.stream_unsupported_unknown({ name }),
      "error",
    );
  }, []);

  const handleStreamInfoUpdated = useCallback((updated: StreamInfo) => {
    $streams.set($streams.get().map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  // Set by a Rust "connecting" announce (cold-start stream resume); the matching
  // stopped→playing "started" would duplicate it for the same key press.
  const pendingConnectRef = useRef<PendingConnect | null>(null);

  const handlePlayerStatus = useCallback((payload: PlayerStatus) => {
    const prev = $playerStatus.get();
    $playerStatus.set(payload);

    // Store read stays here so selectPlaybackAnnouncement itself keeps taking
    // the name by injection; the naming rule itself lives in playbackAnnounce.
    const a = selectPlaybackAnnouncement(prev, payload, (s) => sourceName(s, $streams.get()));
    if (suppressesStarted(pendingConnectRef.current, a, Date.now())) {
      // "Connecting — X" already covered this gesture; don't double up.
      pendingConnectRef.current = null;
    } else if (a) {
      switch (a.kind) {
        case "started":
          announceRef.current(m.playback_started({ name: a.name }), "assertive");
          break;
        case "paused":
          announceRef.current(m.playback_paused_named({ name: a.name }), "assertive");
          break;
        case "resumed":
          announceRef.current(m.playback_resumed_named({ name: a.name }), "assertive");
          break;
        case "stopped":
          announceRef.current(
            a.name ? m.playback_stopped_named({ name: a.name }) : m.playback_stopped(),
            "assertive",
          );
          break;
      }
    }

    // ── Level memory ─────────────────────────────────────────────────────────
    // Every volume change lands here, including the global Ctrl+Alt+Up/Down that
    // Rust handles without the webview — so this is the only place that can see
    // the level the user was at just before it reached zero.
    rememberVolumeLevel(payload.volume);

    // ── Mute state cleanup ───────────────────────────────────────────────────
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
    applyMuteCleanup(payload, { stateChangedToPlaying, sourceChangedWhilePlaying });
  }, []);

  const handlePlayerProgress = useCallback((payload: PlayerProgressPayload) => {
    $playerStatus.set({
      ...$playerStatus.get(),
      positionMs: payload.positionMs,
      durationMs: payload.durationMs,
    });
  }, []);

  const handlePlayerEnded = useCallback(async (payload: PlayerEndedPayload) => {
    const autoAdvance = $profileSettings.get()?.autoAdvance ?? true;
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
      addToast(m.playback_error(), "error");
      // Skip-on-error guard: never loop through broken files — just stop.
      await tauri.stopPlayback().catch(() => {});
    }
  }, []);

  const handleRecordingCompleted = useCallback((payload: RecordingCompletedPayload) => {
    const stream = $streams.get().find((s) => s.id === payload.streamId);
    const name = stream?.name ?? payload.streamId;
    announce(m.track_saved({ name, fileName: payload.fileName }), "polite");
  }, [announce]);

  // Подія несе готовий рядок журналу — дзеркало приймає його як є, і той самий
  // набір фактів (станція + трек) іде в оголошення. `assertive` лишається:
  // трек грає просто зараз, і повідомлення, що відстоїть чергу за довгим
  // списком, приїде вже після того, як він скінчився.
  const handleWishlistMatch = useCallback((payload: WishlistMatch) => {
    $wishlistMatches.set(prependMatch($wishlistMatches.get(), payload));
    announce(
      m.announcement_wishlist_match({
        title: `${payload.artist} — ${payload.title}`,
        station: payload.stationName,
      }),
      "assertive",
    );
  }, [announce]);

  const handleStreamsChanged = useCallback(() => {
    tauri.getStreams().then((streams) => $streams.set(streams));
  }, []);

  const handleWishlistChanged = useCallback(() => {
    tauri.getWishlist().then((wl) => $wishlist.set(wl)).catch(console.error);
  }, []);

  const handlePlayerAnnounce = useCallback((payload: PlaybackAnnounce) => {
    switch (payload.kind) {
      case "connecting":
        announceRef.current(m.playback_connecting({ name: payload.name ?? "" }), "assertive");
        // The eventual stopped→playing "started" for this source would be a
        // duplicate — arm a one-shot suppression. TTL covers the ≤15 s probe.
        pendingConnectRef.current = { name: payload.name ?? "", until: Date.now() + 20_000 };
        break;
      case "resuming":
        announceRef.current(
          m.playback_resuming({
            name: payload.name ?? "",
            position: m.time_format_min_sec(formatTimeParts(payload.positionMs ?? 0)),
          }),
          "assertive",
        );
        // The eventual stopped→playing "started" for this file would duplicate
        // this announce — arm the same one-shot suppression as "connecting".
        pendingConnectRef.current = { name: payload.name ?? "", until: Date.now() + 20_000 };
        break;
      case "volume": {
        // Ctrl+Alt+Up/Down are handled entirely in Rust; this event only asks
        // for the number, which is read off the store the slider draws from —
        // `player-status` for the same change always lands first (set_volume
        // emits it before returning), muteCleanup included. Assertive: it is
        // the reply to a keypress, and the only feedback the key has.
        const status = $playerStatus.get();
        const sound = selectVolumeAnnouncement(status.volume, $muteState.get().muted);
        announceRef.current(
          sound.kind === "silent"
            ? m.player_muted()
            : m.volume_level({ percent: sound.percent }),
          "assertive",
        );
        break;
      }
      case "unavailable":
        announceRef.current(m.playback_unavailable(), "assertive");
        pendingConnectRef.current = null;
        break;
      case "error":
        announceRef.current(m.playback_error(), "assertive");
        pendingConnectRef.current = null;
        break;
    }
  }, []);

  useTauriEvent<RecordingStatusPayload>("recording-status", handleRecordingStatus);
  useTauriEvent<TrackChangedPayload>("track-changed", handleTrackChanged);
  useTauriEvent<StreamErrorPayload>("stream-error", handleStreamError);
  useTauriEvent<StreamUnsupportedPayload>("stream-unsupported", handleStreamUnsupported);
  useTauriEvent<StreamInfo>("stream-info-updated", handleStreamInfoUpdated);
  const handleRecordingStarted = useCallback(() => {}, []);
  useTauriEvent<RecordingStartedPayload>("recording-started", handleRecordingStarted);
  useTauriEvent<RecordingCompletedPayload>("recording-completed", handleRecordingCompleted);
  useTauriEvent<PlayerStatus>("player-status", handlePlayerStatus);
  useTauriEvent<PlayerProgressPayload>("player-progress", handlePlayerProgress);
  useTauriEvent<PlayerEndedPayload>("player-ended", handlePlayerEnded);
  useTauriEvent<PlaybackAnnounce>("player-announce", handlePlayerAnnounce);
  useTauriEvent<WishlistMatch>("wishlist-match", handleWishlistMatch);
  useTauriEvent("streams-changed", handleStreamsChanged);
  useTauriEvent("wishlist-changed", handleWishlistChanged);
  // OS-global prev/next hotkeys: Rust only bridges the keypress; the queue
  // decision and IPC call happen here, sharing the buttons' pending guard.
  const handleTransportSkip = useCallback((payload: string) => {
    const trigger = parseSkipTrigger(payload);
    if (trigger) void executeTransportSkip(trigger);
  }, []);
  useTauriEvent<string>("transport-skip", handleTransportSkip);
  useDiskSpacePolling();
  useProfileSync();
  useScheduleEvents();
  useCliFeedback();
  useAutostartFeedback();
  useHotkeyBusyFeedback();
  useCrashResumeFeedback();
  useBrowserProbeFeedback();

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      <ActivityBar ref={activityBarZoneRef} exitZone={(forward: boolean) => exitZone("activity-bar", forward)} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {activeSection === "streams" && <StreamsPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
        {activeSection === "wishlist" && <WishlistPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
        {activeSection === "browser" && <BrowserPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
        {activeSection === "songs" && <SongsPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
        {activeSection === "schedule" && <SchedulePanel onZonesChange={onZonesChange} exitZone={exitZone} />}
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
      <ProfileSettingsDialogHost />
      <HelpDialog />
      <LiveAnnouncer />
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
