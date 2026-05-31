import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams, $statuses } from "../../stores/streams";
import { $recordingSettings } from "../../stores/settings";
import { useCompositeList } from "../../hooks/useCompositeList";
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
  const maxRetries = recordingSettings?.reconnect.maxRetries ?? 0;
  const streams = streamsProp ?? allStreams;
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Build items with dynamic segments
  const items = useMemo(
    () => streams.map((s) => ({ id: s.id, segments: getStreamSegments(statuses[s.id]) })),
    [streams, statuses]
  );

  const { listRef, onKeyDownCapture, isFocused, restoreFocus, activeItemId } =
    useCompositeList({
      zoneId: "streams-list",
      items,
      onTabOut: exitZone,
      onEmpty,
      onAction: (type, itemId, segment) => {
        if (type === "delete") {
          setPendingDeleteId(itemId);
          return;
        }
        if (type === "contextMenu") {
          const menuBtn = listRef.current?.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`
          );
          menuBtn?.click();
          return;
        }
        // Action buttons self-activate; only Enter/Space on the whole-row summary
        // triggers the row's primary action (record toggle).
        if ((type === "primary" || type === "toggle") && segment === "summary") {
          const isRecording = statuses[itemId]?.state === "recording";
          (isRecording ? tauri.stopRecording(itemId) : tauri.startRecording(itemId))
            .catch((err) => addToast(String(err), "error"));
        }
      },
    });

  useImperativeHandle(ref, () => ({
    id: "streams-list",
    get el() { return listRef.current!; },
    focus: restoreFocus,
  }), [restoreFocus]);

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    const streamName = streams.find(s => s.id === pendingDeleteId)?.name ?? "";
    try {
      await tauri.removeStream(pendingDeleteId);
      $streams.set($streams.get().filter((s) => s.id !== pendingDeleteId));
      addToast(m.stream_removed({ name: streamName }), "info");
    } catch (err) { addToast(String(err), "error"); }
    setPendingDeleteId(null);
  };

  return (
    <>
      <ul
        ref={listRef}
        data-zone-id="streams-list"
        aria-label={m.zone_streams_list()}
        role="application"
        className="flex-1 overflow-y-auto overflow-x-hidden pt-1"
        onKeyDownCapture={onKeyDownCapture}
      >
        {streams.map((stream) => (
          <StreamItem
            key={stream.id}
            stream={stream}
            status={statuses[stream.id]}
            isActiveRow={activeItemId === stream.id}
            isFocused={(segment) => isFocused(stream.id, segment)}
            maxRetries={maxRetries}
            onPrimaryAction={() => {
              const isRecording = statuses[stream.id]?.state === "recording";
              if (isRecording) tauri.stopRecording(stream.id).catch((e) => addToast(String(e), "error"));
              else tauri.startRecording(stream.id).catch((e) => addToast(String(e), "error"));
            }}
            onContextMenu={() => {
              const menuBtn = listRef.current?.querySelector<HTMLButtonElement>(
                `[data-item-id="${CSS.escape(stream.id)}"] [data-context-menu-trigger]`
              );
              menuBtn?.click();
            }}
            onDelete={() => setPendingDeleteId(stream.id)}
          />
        ))}
      </ul>
      {pendingDeleteId && createPortal(
        <ConfirmDialog
          title={m.remove_stream()}
          message={m.confirm_delete_stream({ name: streams.find(s => s.id === pendingDeleteId)?.name ?? "" })}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />,
        document.body
      )}
    </>
  );
});
StreamList.displayName = "StreamList";
