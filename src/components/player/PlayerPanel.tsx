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
import { executeTransportSkip, type SkipTrigger } from "../../lib/transportControl";
import { isSoundOff, toggleMute } from "../../lib/muteControl";
import { sourceName } from "../../lib/playbackAnnounce";
import { isLiveSource } from "../../lib/playbackSource";

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

export const PlayerPanel = forwardRef<
  ZoneEntry,
  { exitZone: (forward: boolean) => void }
>(({ exitZone }, ref) => {
  const playerStatus = useStore($playerStatus);
  const { state } = playerStatus;
  const streams = useStore($streams);
  const sourceLabel = playerStatus.source ? sourceName(playerStatus.source, streams) : "";
  const statuses = useStore($statuses);
  const settings = useStore($settings);
  const announce = useAnnounce();
  const muteState = useStore($muteState);
  // The predicate, not the field: a level brought down to zero is the same
  // "sound off" state to the user, and this button is where they see it.
  const isSilent = isSoundOff(muteState.muted, playerStatus.volume);
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
  // null, not "—": only a profile stream has a `StreamInfo` to read a bitrate
  // from, and the row below simply omits the number for anything else. (A dash
  // can still come out of `formatBitrate` itself — that one means "the stream
  // has not been checked yet", which is a value on its way.)
  const bitrateDisplay = currentStream
    ? formatBitrate(currentStream.bitrate, currentStream.format, currentStream.unsupportedCodec)
    : null;
  const durationMs = playerStatus.durationMs;
  const hasTrackName = source?.type === 'stream' && !!currentTrack;
  // The question the controls ask is "is this live sound?", never "is this a
  // stream of the profile?" — a station played from the catalogue answers yes
  // to the first and no to the second, and used to be offered a Pause that
  // silently worked. `source.type === "stream"` above stays where the question
  // really is about a profile stream: the ICY track, the bitrate, the
  // `StreamInfo` a catalogue station has none of. See lib/playbackSource.ts.
  const isLive = isLiveSource(source);
  const hasPositionSlider = source?.type === 'file' && (durationMs ?? 0) > 0;

  const neighbors = useStore($playbackNeighbors);
  const positionMs = playerStatus.positionMs;
  const prevRestartThresholdMs = settings?.prevRestartThresholdMs ?? 0;
  const transportCtx: TransportContext = { source, positionMs, neighbors, prevRestartThresholdMs };
  const canPrev = isActive && resolveTransportAction("prev", transportCtx).kind !== "none";
  const canNext = isActive && resolveTransportAction("next", transportCtx).kind !== "none";

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
    { ref: bitrateRowRef,                                                enabled: isActive && isLive },
    { ref: prevRef      as RefObject<HTMLElement | null>,                enabled: canPrev },
    { ref: playPauseRef as RefObject<HTMLElement | null>,                enabled: isActive },
    { ref: stopRef      as RefObject<HTMLElement | null>,                enabled: isActive && !isLive },
    { ref: nextRef      as RefObject<HTMLElement | null>,                enabled: canNext },
    { ref: muteRef      as RefObject<HTMLElement | null>,                enabled: isActive },
    { ref: positionInputRef as unknown as RefObject<HTMLElement | null>, enabled: isActive && hasPositionSlider },
    { ref: outputDeviceRef,                                              enabled: isActive },
    { ref: volumeInputRef   as unknown as RefObject<HTMLElement | null>, enabled: isActive },
  ], [isActive, hasTrackName, isLive, hasPositionSlider, canPrev, canNext]);

  const { onRootKeyDown, enterZone, navigate } = usePlayerZoneNav(appRef, stops, exitZone);

  const restoreFocusPlayer = useCallback(
    (direction: "forward" | "backward") => {
      // Nothing playing → take no focus and stay silent. The central zone cycler
      // (useZoneNavigation.cycleZone) sees that focus didn't move and advances to
      // the next zone on its own. Announcing here would double up with the zone
      // that actually receives focus. See docs/accessibility.md §2.3.1,
      // "Гарантія прогресу централізована".
      if (state === "stopped" || !source) return;
      announce(m.zone_player(), "polite");
      enterZone(direction);
    },
    [announce, state, source, enterZone],
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

  // The action, the in-flight guard and the wording all live in muteControl —
  // the button and Ctrl+M are the same gesture with two triggers.
  const handleMute = () => toggleMute(announce);

  // Feedback (seek-start announce, failure toast) lives in transportControl —
  // the panel only pre-moves focus, the one concern that is DOM of this panel.
  const handleSkip = useCallback(
    (trigger: SkipTrigger) =>
      executeTransportSkip(trigger, {
        beforeExecute: (action, ctx) => {
          if (pressedBecomesDisabled(trigger, action, ctx)) playPauseRef.current?.focus();
        },
      }),
    [],
  );

  const handlePlayPause = async () => {
    try {
      if (isLive) {
        // Live sound can't be meaningfully paused (the buffer goes stale and
        // you lag the broadcast), so the primary control stops it — same
        // semantics as Ctrl+Shift+K, the tray toggle and the SMTC keys.
        await tauri.stopPlayback();
      } else if (isPlaying) {
        await tauri.pausePlayback();
      } else if (isPaused) {
        await tauri.resumePlayback();
      }
      // Announce is driven by handlePlayerStatus (App.tsx) off the player-status
      // event, so a hotkey press and this button behave identically.
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
              {/* The row of the live source: the LIVE badge always, the bitrate
                  only when there is a `StreamInfo` to read it from. A catalogue
                  station gets no dash in its place — "—" says "not here yet",
                  and here it would never come (ADR 2026-08-31 §2). The same
                  `isLive` gates the row here and its focus stop above (under
                  the `isActive` all stops share), so the stop can no longer
                  point at an element the panel never drew. */}
              {isLive && (
                <div
                  ref={bitrateRowRef}
                  tabIndex={-1}
                  className="flex items-center gap-2 text-sm text-slate-500 flex-wrap rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {bitrateDisplay && <span>{bitrateDisplay}</span>}
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
              // For live sound the primary control is a Stop (pause is
              // meaningless); for a file it toggles Play/Pause.
              aria-label={isLive ? m.stop_stream_playback() : isPlaying ? m.pause() : m.play()}
              isDisabled={!isActive}
              onPress={handlePlayPause}
              // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
              tabIndex={-1}
              className="w-[52px] h-[52px] rounded-2xl bg-blue-700 border border-transparent flex items-center justify-center hover:bg-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:disabled:text-[GrayText]"
            >
              {isLive ? (
                <Square aria-hidden={true} size={20} />
              ) : isPlaying ? (
                <Pause aria-hidden={true} size={20} />
              ) : (
                <Play aria-hidden={true} size={20} />
              )}
            </Button>

            {/* Live sound stops via the primary control above; a second Stop
                would be a redundant, identically-labelled button. */}
            {!isLive && (
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
            )}

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
              aria-label={isSilent ? m.player_unmute_action() : m.player_mute_action()}
              aria-pressed={isSilent}
              isDisabled={!isActive}
              onPress={handleMute}
              // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
              tabIndex={-1}
              className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 aria-pressed:bg-amber-500/20 aria-pressed:border-amber-400/40 aria-pressed:text-amber-400 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText] forced-colors:aria-pressed:bg-[Highlight] forced-colors:aria-pressed:text-[HighlightText] forced-colors:aria-pressed:border-[Highlight]"
            >
              {isSilent ? <VolumeX aria-hidden={true} size={18} /> : <Volume2 aria-hidden={true} size={18} />}
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
