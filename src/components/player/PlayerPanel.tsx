import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
} from "react";
import type { RefObject } from "react";
import { Button } from "react-aria-components";
import { Play, Pause, Square, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $playerStatus, $muteState } from "../../stores/player";
import { $streams, $statuses } from "../../stores/streams";
import { $filteredSongs } from "../../stores/songs";
import { $playbackNeighbors, computePlaybackNeighbors } from "../../stores/playbackNeighbors";
import { resolveTransportAction, type TransportAction, type TransportContext } from "../../lib/playbackTransport";
import { $settings } from "../../stores/settings";
import { PlaybackPosition } from "./PlaybackPosition";
import { VolumeSlider } from "./VolumeSlider";
import { useAnnounce } from "../../hooks/useAnnounce";
import { usePlayerZoneNav, type FocusStop } from "../../hooks/usePlayerZoneNav";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { formatBitrate } from "../../lib/formatters";
import { LiveBadge } from "./LiveBadge";
import { RecordingBadge } from "./RecordingBadge";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

type SkipTrigger = "prev" | "next";

/**
 * Will the just-pressed skip button resolve to "none" after `action` applies?
 * Used to pre-move focus to Play/Pause before the stops set collapses, so the
 * usePlayerZoneNav remap doesn't strand focus on Mute.
 */
function pressedBecomesDisabled(
  trigger: SkipTrigger,
  action: TransportAction,
  ctx: TransportContext,
): boolean {
  if (action.kind === "seek-start") {
    // seek-start is only ever produced for the "prev" trigger; re-check prev at position 0.
    return resolveTransportAction("prev", { ...ctx, positionMs: 0 }).kind === "none";
  }
  if (action.kind === "play-stream" || action.kind === "play-file") {
    const newSource =
      action.kind === "play-stream"
        ? ({ type: "stream", streamId: action.id } as const)
        : ({ type: "file", path: action.path } as const);
    const newNeighbors = computePlaybackNeighbors(newSource, $streams.get(), $filteredSongs.get());
    return resolveTransportAction(trigger, {
      source: newSource,
      positionMs: 0,
      neighbors: newNeighbors,
      prevRestartThresholdMs: ctx.prevRestartThresholdMs,
    }).kind === "none";
  }
  return false;
}

function useSourceLabel(): string {
  const { source } = useStore($playerStatus);
  const streams = useStore($streams);
  if (!source) return "";
  if (source.type === "stream") {
    const stream = streams.find((s) => s.id === source.streamId);
    return stream?.name ?? source.streamId;
  }
  if (source.type === "preview") return source.name;
  return source.path.split(/[\\/]/).pop() ?? source.path;
}

export const PlayerPanel = forwardRef<
  ZoneEntry,
  { exitZone: (forward: boolean) => void }
>(({ exitZone }, ref) => {
  const playerStatus = useStore($playerStatus);
  const { state } = playerStatus;
  const sourceLabel = useSourceLabel();
  const streams = useStore($streams);
  const statuses = useStore($statuses);
  const settings = useStore($settings);
  const announce = useAnnounce();
  const muteState = useStore($muteState);
  const isMuted = muteState.muted;
  const isPlaying = state === "playing";
  const isPaused = state === "paused";
  const isActive = isPlaying || isPaused;

  // Panel 1 data
  const source = playerStatus.source;
  const currentStream = source?.type === "stream"
    ? streams.find((s) => s.id === source.streamId)
    : null;
  const currentStreamStatus = source?.type === "stream"
    ? statuses[source.streamId]
    : null;
  const currentTrack = currentStreamStatus?.currentTrack;
  // For files: empty string — reserved for future ID3 metadata tags
  const trackDisplay = source?.type === "stream"
    ? (currentTrack ? `${currentTrack.artist} — ${currentTrack.title}` : "—")
    : "";
  const bitrateDisplay = currentStream ? formatBitrate(currentStream.bitrate) : "—";
  const durationMs = playerStatus.durationMs;
  const hasTrackName = source?.type === 'stream' && !!currentTrack;
  const isStream = source?.type === 'stream';
  const hasPositionSlider = source?.type === 'file' && (durationMs ?? 0) > 0;

  const neighbors = useStore($playbackNeighbors);
  const positionMs = playerStatus.positionMs;
  const prevRestartThresholdMs = settings?.prevRestartThresholdMs ?? 0;
  const transportCtx: TransportContext = { source, positionMs, neighbors, prevRestartThresholdMs };
  const canPrev = isActive && resolveTransportAction("prev", transportCtx).kind !== "none";
  const canNext = isActive && resolveTransportAction("next", transportCtx).kind !== "none";

  const mutePendingRef = useRef(false);
  const navPendingRef = useRef(false);
  const playerRootRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const playPauseRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const muteRef = useRef<HTMLButtonElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const sourceNameRef = useRef<HTMLDivElement>(null);
  const trackNameRef = useRef<HTMLDivElement>(null);
  const bitrateRowRef = useRef<HTMLDivElement>(null);
  const outputDeviceRef = useRef<HTMLDivElement>(null);
  const positionInputRef = useRef<HTMLInputElement>(null);
  const volumeInputRef = useRef<HTMLInputElement>(null);

  // isActive is the base guard: when stopped, ALL stops become disabled so the
  // stops-change effect in usePlayerZoneNav exits the zone automatically.
  const stops = useMemo((): FocusStop[] => [
    { ref: sourceNameRef,                                                enabled: isActive },
    { ref: trackNameRef,                                                 enabled: isActive && hasTrackName },
    { ref: bitrateRowRef,                                                enabled: isActive && isStream },
    { ref: prevRef      as RefObject<HTMLElement | null>,                enabled: canPrev },
    { ref: playPauseRef as RefObject<HTMLElement | null>,                enabled: isActive },
    { ref: stopRef      as RefObject<HTMLElement | null>,                enabled: isActive },
    { ref: nextRef      as RefObject<HTMLElement | null>,                enabled: canNext },
    { ref: muteRef      as RefObject<HTMLElement | null>,                enabled: isActive },
    { ref: positionInputRef as unknown as RefObject<HTMLElement | null>, enabled: isActive && hasPositionSlider },
    { ref: outputDeviceRef,                                              enabled: isActive },
    { ref: volumeInputRef   as unknown as RefObject<HTMLElement | null>, enabled: isActive },
  ], [isActive, hasTrackName, isStream, hasPositionSlider, canPrev, canNext]);

  const { onRootKeyDown, enterZone, navigate } = usePlayerZoneNav(appRef, stops, exitZone);

  const restoreFocusPlayer = useCallback(
    (direction: "forward" | "backward") => {
      // Skipped zone (nothing playing) must pass through silently — announce the
      // zone label only when focus actually lands here. Announcing before the skip
      // guard causes a double announcement ("Програвач" + the next zone's label).
      // See docs/accessibility.md §2.3.1: "Пропускає приховані зони (Player…)".
      if (state === "stopped" || !source) {
        exitZone(direction === "forward");
        return;
      }
      announce(m.zone_player(), "polite");
      enterZone(direction);
    },
    [announce, state, source, exitZone, enterZone],
  );

  useImperativeHandle(
    ref,
    () => ({
      id: "player",
      get el() {
        return playerRootRef.current!;
      },
      focus: restoreFocusPlayer,
    }),
    [restoreFocusPlayer]
  );

  const handleMute = async () => {
    if (mutePendingRef.current) return;
    mutePendingRef.current = true;
    try {
      if (!isMuted) {
        const vol = $playerStatus.get().volume;
        const savedVolume = vol > 0 ? vol : 0.75;
        await tauri.setVolume(0);
        $muteState.set({ muted: true, savedVolume, restoring: false });
        announce(m.player_mute_action(), "assertive");
      } else {
        const { savedVolume } = $muteState.get();
        await tauri.setVolume(savedVolume);
        $muteState.set({ muted: false, savedVolume, restoring: false });
        announce(m.player_unmute_action(), "assertive");
      }
    } catch (e) {
      console.error(e);
      announce(m.playback_error(), "assertive");
    } finally {
      mutePendingRef.current = false;
    }
  };

  const handleSkip = useCallback(
    async (trigger: SkipTrigger) => {
      if (navPendingRef.current) return;
      const status = $playerStatus.get();
      const ctx: TransportContext = {
        source: status.source,
        positionMs: status.positionMs,
        neighbors: $playbackNeighbors.get(),
        prevRestartThresholdMs: $settings.get()?.prevRestartThresholdMs ?? 0,
      };
      const action = resolveTransportAction(trigger, ctx);
      if (action.kind === "none") return;
      navPendingRef.current = true;
      try {
        if (pressedBecomesDisabled(trigger, action, ctx)) playPauseRef.current?.focus();
        switch (action.kind) {
          case "play-stream": await tauri.playStream(action.id); break;
          case "play-file":   await tauri.playSavedSong(action.path); break;
          case "seek-start":
            await tauri.seekPlayback(0);
            announce(m.player_restarted(), "assertive");
            break;
          // "stop" cannot occur for prev/next (only auto-advance) — no-op.
        }
        // play-* announce "Playing: {name}" via App.tsx player-status.
      } catch (e) {
        console.error(e);
        announce(m.playback_error(), "assertive");
      } finally {
        navPendingRef.current = false;
      }
    },
    [announce],
  );

  const handlePlayPause = async () => {
    try {
      if (isPlaying) {
        await tauri.pausePlayback();
        announce(m.playback_paused(), "assertive");
      } else if (isPaused) {
        await tauri.resumePlayback();
        announce(m.playback_resumed(), "assertive");
      }
    } catch (e) {
      console.error(e);
      announce(m.playback_error(), "assertive");
    }
  };

  const handleStop = async () => {
    const muteSnapshot = $muteState.get();
    try {
      if (muteSnapshot.muted) {
        // Block Case 1 from auto-clearing mute during the stop sequence
        $muteState.set({ muted: true, savedVolume: muteSnapshot.savedVolume, restoring: true });
        await tauri.setVolume(muteSnapshot.savedVolume);
      }
      await tauri.stopPlayback();
      if (muteSnapshot.muted) {
        $muteState.set({ muted: false, savedVolume: muteSnapshot.savedVolume, restoring: false });
      }
      // No announce — handlePlayerStatus in App.tsx announces playback_stopped
    } catch (e) {
      console.error(e);
      if (muteSnapshot.muted) {
        // Re-mute backend so state stays consistent with $muteState (still muted)
        tauri.setVolume(0).catch(console.error);
        $muteState.set({ muted: true, savedVolume: muteSnapshot.savedVolume, restoring: false });
      }
      announce(m.playback_error(), "assertive");
    }
  };

  return (
    <div
      ref={playerRootRef}
      role="complementary"
      aria-label={m.player_panel_label()}
      data-zone-id="player"
      className="grid grid-cols-[1.15fr_1.2fr_minmax(200px,0.85fr)] gap-4 px-6 py-4 bg-gradient-to-b from-white/[0.03] to-white/[0.01] border-t border-white/[0.08] shrink-0 forced-colors:border-[ButtonText]"
    >
      <div
        role="application"
        aria-label={m.player_panel_label()}
        ref={appRef}
        onKeyDown={onRootKeyDown}
        className="grid grid-cols-subgrid col-span-3"
      >
        {/* ── Panel 1: Зараз грає ── */}
        <div role="group" aria-label={m.player_now_playing()} className="rounded-[20px] bg-white/[0.04] border border-white/[0.06] p-4 flex flex-col gap-2 min-w-0 min-h-[130px]">
          <h3 aria-hidden="true" className="text-base font-bold text-slate-100">
            {m.player_now_playing()}
          </h3>
          {!source ? (
            <p className="text-sm text-slate-500 italic">{m.player_nothing_playing()}</p>
          ) : (
            <>
              {/* aria-live covers dynamically changing track info */}
              <div aria-live="polite">
                {source.type === "file" ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      ref={sourceNameRef}
                      tabIndex={-1}
                      className="text-base font-bold text-slate-100 truncate flex-1 min-w-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      {sourceLabel}
                    </div>
                    <RecordingBadge />
                  </div>
                ) : (
                  <div
                    ref={sourceNameRef}
                    tabIndex={-1}
                    className="text-base font-bold text-slate-100 truncate rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    {sourceLabel}
                  </div>
                )}
                {source.type === "stream" ? (
                  currentTrack ? (
                    <div
                      ref={trackNameRef}
                      tabIndex={-1}
                      className="text-sm text-slate-400 truncate rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      {trackDisplay}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 truncate">—</p>
                  )
                ) : null}
              </div>
              {source.type === "stream" && (
                <div
                  ref={bitrateRowRef}
                  tabIndex={-1}
                  className="flex items-center gap-2 text-sm text-slate-500 flex-wrap rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <span>{bitrateDisplay}</span>
                  <LiveBadge />
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Panel 2: Керування ── */}
        <div role="group" aria-label={m.player_controls()} className="rounded-[20px] bg-white/[0.04] border border-white/[0.06] p-4 flex flex-col gap-2 min-w-0">
          <h3 aria-hidden="true" className="text-base font-bold text-slate-100">
            {m.player_controls()}
          </h3>
          <div className="flex items-center justify-center gap-2">
            <Button
              ref={prevRef}
              aria-label={m.player_prev()}
              isDisabled={!canPrev}
              onPress={() => handleSkip("prev")}
              // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
              tabIndex={-1}
              className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
            >
              <SkipBack aria-hidden={true} size={18} />
            </Button>

            <Button
              ref={playPauseRef}
              aria-label={isPlaying ? m.pause() : m.play()}
              isDisabled={!isActive}
              onPress={handlePlayPause}
              // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
              tabIndex={-1}
              className="w-[52px] h-[52px] rounded-2xl bg-blue-700 border border-transparent flex items-center justify-center hover:bg-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:disabled:text-[GrayText]"
            >
              {isPlaying ? <Pause aria-hidden={true} size={20} /> : <Play aria-hidden={true} size={20} />}
            </Button>

            <Button
              ref={stopRef}
              aria-label={m.stop()}
              isDisabled={!isActive}
              onPress={handleStop}
              // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
              tabIndex={-1}
              className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
            >
              <Square aria-hidden={true} size={18} />
            </Button>

            <Button
              ref={nextRef}
              aria-label={m.player_next()}
              isDisabled={!canNext}
              onPress={() => handleSkip("next")}
              // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
              tabIndex={-1}
              className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
            >
              <SkipForward aria-hidden={true} size={18} />
            </Button>

            <Button
              ref={muteRef}
              aria-label={isMuted ? m.player_unmute_action() : m.player_mute_action()}
              aria-pressed={isMuted}
              isDisabled={!isActive}
              onPress={handleMute}
              // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
              tabIndex={-1}
              className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 aria-pressed:bg-amber-500/20 aria-pressed:border-amber-400/40 aria-pressed:text-amber-400 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText] forced-colors:aria-pressed:bg-[Highlight] forced-colors:aria-pressed:text-[HighlightText] forced-colors:aria-pressed:border-[Highlight]"
            >
              {isMuted ? <VolumeX aria-hidden={true} size={18} /> : <Volume2 aria-hidden={true} size={18} />}
            </Button>
          </div>

          <div className="mt-auto">
            <PlaybackPosition inputRef={positionInputRef} onNavigate={navigate} />
          </div>
        </div>

        {/* ── Panel 3: Вивід ── */}
        <div role="group" aria-label={m.player_output()} className="rounded-[20px] bg-white/[0.04] border border-white/[0.06] p-4 flex flex-col gap-2 min-w-0">
          <h3 aria-hidden="true" className="text-base font-bold text-slate-100">
            {m.player_output()}
          </h3>

          <div
            ref={outputDeviceRef}
            tabIndex={-1}
            aria-label={`${m.player_device()}: ${settings?.outputDevice ?? "—"}`}
            className="flex items-center justify-between text-sm rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <span className="text-slate-400" aria-hidden="true">{m.player_device()}</span>
            <strong className="text-slate-200 truncate ml-2" aria-hidden="true">
              {settings?.outputDevice ?? "—"}
            </strong>
          </div>

          <div className="mt-auto">
            <VolumeSlider inputRef={volumeInputRef} onNavigate={navigate} />
          </div>
        </div>
      </div>
    </div>
  );
});

PlayerPanel.displayName = "PlayerPanel";
