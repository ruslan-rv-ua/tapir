import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Button } from "react-aria-components";
import { Play, Pause, Square, SkipBack, SkipForward, VolumeX } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import { $streams, $statuses } from "../../stores/streams";
import { $settings } from "../../stores/settings";
import { PlaybackPosition } from "./PlaybackPosition";
import { VolumeSlider } from "./VolumeSlider";
import { useAnnounce } from "../../hooks/useAnnounce";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { formatBitrate } from "../../lib/formatters";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

function useSourceLabel(): string {
  const { source } = useStore($playerStatus);
  const streams = useStore($streams);
  if (!source) return "";
  if (source.type === "stream") {
    const stream = streams.find((s) => s.id === source.streamId);
    return stream?.name ?? source.streamId;
  }
  return source.path.split(/[\\/]/).pop() ?? source.path;
}

/** Focuses the first range input inside a container, or the container itself as fallback. */
function focusFirstIn(container: HTMLElement | null): void {
  if (!container) return;
  const slider = container.querySelector<HTMLElement>('input[type="range"]');
  (slider ?? container).focus();
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
  const isPlaying = state === "playing";
  const isPaused = state === "paused";
  const isActive = isPlaying || isPaused;

  // Panel 1 data
  const source = playerStatus.source;
  const currentStream = source?.type === "stream"
    ? streams.find(s => s.id === source.streamId)
    : null;
  const currentStreamStatus = source?.type === "stream"
    ? statuses[source.streamId]
    : null;
  const currentTrack = currentStreamStatus?.currentTrack;
  const trackDisplay = source?.type === "stream"
    ? (currentTrack ? `${currentTrack.artist} — ${currentTrack.title}` : "—")
    : source?.type === "file"
    ? (source.path.split(/[\\/]/).pop() ?? "—")
    : "—";
  const bitrateDisplay = currentStream ? formatBitrate(currentStream.bitrate) : "—";

  // Panel 3 data
  const activeRecordingName =
    streams.find(s => statuses[s.id]?.state === "recording")?.name ?? "—";

  const playerRootRef = useRef<HTMLDivElement>(null);
  const playPauseRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const muteRef = useRef<HTMLButtonElement>(null);
  const positionWrapperRef = useRef<HTMLDivElement>(null);
  const volumeWrapperRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<"transport" | "position" | "volume">(
    "transport"
  );

  const transportRefs = useMemo(
    () => [prevRef, playPauseRef, stopRef, nextRef, muteRef],
    [],
  );

  const onTabBoundary = useCallback(
    (forward: boolean) => {
      if (forward) {
        lastFocusedRef.current = "position";
        focusFirstIn(positionWrapperRef.current);
      } else {
        exitZone(false);
      }
    },
    [exitZone]
  );

  const {
    onKeyDown: transportKeyDown,
    getTabIndex,
    restoreFocus: restoreTransport,
  } = useRovingFocus(transportRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary,
  });

  const handlePositionKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          lastFocusedRef.current = "transport";
          restoreTransport("backward");
        } else {
          lastFocusedRef.current = "volume";
          focusFirstIn(volumeWrapperRef.current);
        }
      }
    },
    [restoreTransport]
  );

  const handleVolumeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          lastFocusedRef.current = "position";
          focusFirstIn(positionWrapperRef.current);
        } else {
          exitZone(true);
        }
      }
    },
    [exitZone]
  );

  const restoreFocusPlayer = useCallback(
    (direction: "forward" | "backward") => {
      announce(m.zone_player(), "polite");
      if (direction === "backward") {
        // Enter from the right → land on the rightmost stop (volume)
        lastFocusedRef.current = "volume";
        focusFirstIn(volumeWrapperRef.current);
      } else if (lastFocusedRef.current === "transport") {
        restoreTransport("forward");
      } else if (lastFocusedRef.current === "position") {
        focusFirstIn(positionWrapperRef.current);
      } else {
        focusFirstIn(volumeWrapperRef.current);
      }
    },
    [announce, restoreTransport]
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
    try {
      await tauri.stopPlayback();
      announce(m.playback_stopped(), "assertive");
    } catch (e) {
      console.error(e);
      announce(m.playback_error(), "assertive");
    }
  };

  return (
    <div
      ref={playerRootRef}
      role="complementary"
      aria-label={m.player_panel_label()}
      data-zone-id="player"
      className="grid grid-cols-3 gap-4 px-4 py-2 bg-slate-900 border-t border-slate-700 shrink-0 forced-colors:border-[ButtonText]"
    >
      {/* ── Panel 1: Зараз грає ── */}
      <article aria-label={m.player_now_playing()} className="flex flex-col gap-1 min-w-0">
        <h3 aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {m.player_now_playing()}
        </h3>
        <p className="text-sm text-slate-200 truncate">{sourceLabel}</p>
        <p className="text-xs text-slate-400 truncate">{trackDisplay}</p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{m.player_listening()}</span>
          <span>{bitrateDisplay}</span>
          {source?.type === "stream" && (
            <span className="rounded bg-slate-700 px-1 py-0.5 text-xs">Live</span>
          )}
        </div>
      </article>

      {/* ── Panel 2: Керування ── */}
      <article aria-label={m.player_controls()} className="flex flex-col gap-2 min-w-0">
        <h3 aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {m.player_controls()}
        </h3>
        <div role="toolbar" onKeyDown={transportKeyDown} className="flex items-center gap-1">
          {/* Index 0: Prev (stub) */}
          <Button
            ref={prevRef}
            aria-label={m.player_prev()}
            isDisabled={true}
            // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
            tabIndex={getTabIndex(0)}
            className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
          >
            <SkipBack aria-hidden={true} size={16} />
          </Button>

          {/* Index 1: Play/Pause */}
          <Button
            ref={playPauseRef}
            aria-label={isPlaying ? m.pause() : m.play()}
            isDisabled={!isActive}
            onPress={handlePlayPause}
            // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
            tabIndex={getTabIndex(1)}
            className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
          >
            {isPlaying ? <Pause aria-hidden={true} size={16} /> : <Play aria-hidden={true} size={16} />}
          </Button>

          {/* Index 2: Stop */}
          <Button
            ref={stopRef}
            aria-label={m.stop()}
            isDisabled={!isActive}
            onPress={handleStop}
            // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
            tabIndex={getTabIndex(2)}
            className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
          >
            <Square aria-hidden={true} size={16} />
          </Button>

          {/* Index 3: Next (stub) */}
          <Button
            ref={nextRef}
            aria-label={m.player_next()}
            isDisabled={true}
            // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
            tabIndex={getTabIndex(3)}
            className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
          >
            <SkipForward aria-hidden={true} size={16} />
          </Button>

          {/* Index 4: Mute (stub) */}
          <Button
            ref={muteRef}
            aria-label={m.player_mute()}
            isDisabled={true}
            // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
            tabIndex={getTabIndex(4)}
            className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
          >
            <VolumeX aria-hidden={true} size={16} />
          </Button>
        </div>

        <div ref={positionWrapperRef} tabIndex={-1} onKeyDown={handlePositionKeyDown}>
          <PlaybackPosition />
        </div>
      </article>

      {/* ── Panel 3: Вивід ── */}
      <article aria-label={m.player_output()} className="flex flex-col gap-1.5 min-w-0">
        <h3 aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {m.player_output()}
        </h3>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">{m.player_active_recording()}</span>
          <strong className="text-slate-200 truncate ml-2">{activeRecordingName}</strong>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">{m.player_device()}</span>
          <strong className="text-slate-200 truncate ml-2">{settings?.outputDevice ?? "—"}</strong>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">{m.player_volume()}</span>
          <strong className="text-slate-200">{`${Math.round(playerStatus.volume * 100)}%`}</strong>
        </div>
        <div ref={volumeWrapperRef} tabIndex={-1} onKeyDown={handleVolumeKeyDown}>
          <VolumeSlider />
        </div>
      </article>
    </div>
  );
});

PlayerPanel.displayName = "PlayerPanel";
