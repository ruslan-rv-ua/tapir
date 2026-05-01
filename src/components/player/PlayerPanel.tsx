import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Button } from "react-aria-components";
import { Play, Pause, Square } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import { $streams } from "../../stores/streams";
import { PlaybackPosition } from "./PlaybackPosition";
import { VolumeSlider } from "./VolumeSlider";
import { useAnnounce } from "../../hooks/useAnnounce";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
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
  const { state } = useStore($playerStatus);
  const sourceLabel = useSourceLabel();
  const announce = useAnnounce();
  const isPlaying = state === "playing";
  const isPaused = state === "paused";
  const isActive = isPlaying || isPaused;

  const playerRootRef = useRef<HTMLDivElement>(null);
  const playPauseRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const positionWrapperRef = useRef<HTMLDivElement>(null);
  const volumeWrapperRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<"transport" | "position" | "volume">(
    "transport"
  );

  const transportRefs = useMemo(() => [playPauseRef, stopRef], []);

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
      className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-t border-slate-700 shrink-0"
    >
      <div role="toolbar" onKeyDown={transportKeyDown}>
        <Button
          ref={playPauseRef}
          aria-label={isPlaying ? m.pause() : m.play()}
          isDisabled={!isActive}
          onPress={handlePlayPause}
          // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
          tabIndex={getTabIndex(0)}
          className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText] forced-colors:disabled:border-[GrayText]"
        >
          {isPlaying ? (
            <Pause aria-hidden={true} size={16} />
          ) : (
            <Play aria-hidden={true} size={16} />
          )}
        </Button>

        <Button
          ref={stopRef}
          aria-label={m.stop()}
          isDisabled={!isActive}
          onPress={handleStop}
          // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
          tabIndex={getTabIndex(1)}
          className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText] forced-colors:disabled:border-[GrayText]"
        >
          <Square aria-hidden={true} size={16} />
        </Button>
      </div>

      <span
        aria-live="polite"
        aria-atomic="true"
        className="text-sm text-slate-300 truncate flex-shrink-0 max-w-48"
      >
        {sourceLabel}
      </span>

      <div ref={positionWrapperRef} tabIndex={-1} onKeyDown={handlePositionKeyDown}>
        <PlaybackPosition />
      </div>

      <div ref={volumeWrapperRef} tabIndex={-1} onKeyDown={handleVolumeKeyDown}>
        <VolumeSlider />
      </div>
    </div>
  );
});

PlayerPanel.displayName = "PlayerPanel";
