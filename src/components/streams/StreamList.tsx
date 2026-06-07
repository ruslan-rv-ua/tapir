import { forwardRef, useCallback, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams, $statuses } from "../../stores/streams";
import { $recordingSettings, $settings } from "../../stores/settings";
import { $playerStatus } from "../../stores/player";
import { CompositeList } from "../common/composite-list";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StreamInfo } from "../../lib/tauri";
import { StreamItem, getStreamSegments } from "./StreamItem";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../common/ConfirmDialog";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  /** Pre-filtered list to render. Defaults to all streams in the store. */
  streams?: StreamInfo[];
}

export const StreamList = forwardRef<ZoneEntry, Props>(({ exitZone, onEmpty, streams: streamsProp }, ref) => {
  const allStreams = useStore($streams);
  const statuses = useStore($statuses);
  const recordingSettings = useStore($recordingSettings);
  const settings = useStore($settings);
  const playerStatus = useStore($playerStatus);
  const maxRetries = recordingSettings?.reconnect.maxRetries ?? 0;
  const streams = streamsProp ?? allStreams;
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Build items with dynamic segments
  const items = useMemo(
    () => streams.map((s) => ({ id: s.id, segments: getStreamSegments(statuses[s.id]) })),
    [streams, statuses],
  );

  // The row's primary action, shared by keyboard activation (Enter/Space on the
  // summary) and a mouse double-click. Per `doubleClickAction` it toggles either
  // playback or recording (the default).
  const activateStream = useCallback(
    (itemId: string) => {
      if (settings?.doubleClickAction === "play") {
        const isPlaying =
          playerStatus.state !== "stopped" &&
          playerStatus.source?.type === "stream" &&
          playerStatus.source.streamId === itemId;
        (isPlaying ? tauri.stopPlayback() : tauri.playStream(itemId)).catch((err) =>
          addToast(String(err), "error"),
        );
      } else {
        const isRecording = statuses[itemId]?.state === "recording";
        (isRecording ? tauri.stopRecording(itemId) : tauri.startRecording(itemId)).catch((err) =>
          addToast(String(err), "error"),
        );
      }
    },
    [settings, playerStatus, statuses],
  );

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    const streamName = streams.find((s) => s.id === pendingDeleteId)?.name ?? "";
    try {
      await tauri.removeStream(pendingDeleteId);
      $streams.set($streams.get().filter((s) => s.id !== pendingDeleteId));
      addToast(m.stream_removed({ name: streamName }), "info");
    } catch (err) {
      addToast(String(err), "error");
    }
    setPendingDeleteId(null);
  };

  return (
    <>
      <CompositeList
        ref={ref}
        zoneId="streams-list"
        ariaLabel={m.zone_streams_list()}
        items={items}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onTabOut={exitZone}
        onEmpty={onEmpty}
        onAction={(type, itemId, segment) => {
          if (type === "delete") {
            setPendingDeleteId(itemId);
            return;
          }
          // Action buttons self-activate; only Enter/Space on the whole-row
          // summary triggers the row's primary action.
          if ((type === "primary" || type === "toggle") && segment === "summary") {
            activateStream(itemId);
          }
        }}
        renderRow={({ id, isActive, isFocused }) => {
          const stream = streams.find((s) => s.id === id)!;
          return (
            <StreamItem
              key={id}
              stream={stream}
              status={statuses[id]}
              isActiveRow={isActive}
              isFocused={isFocused}
              maxRetries={maxRetries}
              onDelete={() => setPendingDeleteId(id)}
              onActivate={() => activateStream(id)}
            />
          );
        }}
      />
      {pendingDeleteId &&
        createPortal(
          <ConfirmDialog
            title={m.remove_stream()}
            message={m.confirm_delete_stream({ name: streams.find((s) => s.id === pendingDeleteId)?.name ?? "" })}
            onConfirm={handleConfirmDelete}
            onCancel={() => setPendingDeleteId(null)}
          />,
          document.body,
        )}
    </>
  );
});
StreamList.displayName = "StreamList";
