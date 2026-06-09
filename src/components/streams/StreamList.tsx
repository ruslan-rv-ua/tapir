import { forwardRef, useCallback, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams, $statuses } from "../../stores/streams";
import { $recordingSettings, $settings } from "../../stores/settings";
import { $playerStatus } from "../../stores/player";
import { CompositeList } from "../common/composite-list";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StreamInfo, ProfileMeta } from "../../lib/tauri";
import { StreamItem, getStreamSegments } from "./StreamItem";
import { StreamTransferDialog } from "./StreamTransferDialog";
import { ProfileNameDialog } from "../profile/ProfileNameDialog";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import { useAnnounce } from "../../hooks/useAnnounce";
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

  const announce = useAnnounce();

  type Transfer =
    | null
    | { phase: "pick"; mode: "copy" | "move"; streamId: string; profiles: ProfileMeta[] }
    | { phase: "create"; mode: "copy" | "move"; streamId: string };
  const [transfer, setTransfer] = useState<Transfer>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openTransfer = async (mode: "copy" | "move", streamId: string) => {
    try {
      const all = await tauri.listProfiles();
      setTransfer({ phase: "pick", mode, streamId, profiles: all.filter((p) => !p.isActive) });
    } catch (e) {
      addToast(String(e), "error");
    }
  };

  const doTransfer = async (mode: "copy" | "move", streamId: string, targetProfile: string) => {
    const name = streams.find((s) => s.id === streamId)?.name ?? "";
    try {
      if (mode === "copy") await tauri.copyStreamToProfile(streamId, targetProfile);
      else await tauri.moveStreamToProfile(streamId, targetProfile);

      if (mode === "move") {
        $streams.set($streams.get().filter((s) => s.id !== streamId));
        addToast(m.stream_moved_to_profile({ name, profile: targetProfile }), "info");
        announce(m.stream_moved_to_profile({ name, profile: targetProfile }), "polite");
      } else {
        addToast(m.stream_copied_to_profile({ name, profile: targetProfile }), "info");
        announce(m.stream_copied_to_profile({ name, profile: targetProfile }), "polite");
      }
      setTransfer(null);
    } catch (e) {
      const msg = String(e);
      if (msg.startsWith("Conflict:")) {
        addToast(m.stream_already_in_profile({ name, profile: targetProfile }), "info");
      } else {
        addToast(msg, "error");
      }
      setTransfer(null);
    }
  };

  const doCreateAndTransfer = async () => {
    if (!transfer || transfer.phase !== "create") return;
    setNameError(null);
    setBusy(true);
    try {
      const meta = await tauri.createProfile(nameInput.trim());
      const { mode, streamId } = transfer;
      setNameInput("");
      await doTransfer(mode, streamId, meta.name);
    } catch (e) {
      const msg = String(e);
      if (msg.startsWith("Conflict:") || msg.startsWith("InvalidName:")) {
        setNameError(msg.replace(/^(Conflict|InvalidName): /, ""));
      } else {
        addToast(msg, "error");
        setTransfer(null);
      }
    } finally {
      setBusy(false);
    }
  };

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
              onCopyToProfile={() => openTransfer("copy", id)}
              onMoveToProfile={() => openTransfer("move", id)}
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

      {transfer?.phase === "pick" &&
        createPortal(
          <StreamTransferDialog
            mode={transfer.mode}
            streamName={streams.find((s) => s.id === transfer.streamId)?.name ?? ""}
            profiles={transfer.profiles}
            onSelect={(profileName) => doTransfer(transfer.mode, transfer.streamId, profileName)}
            onCreateNew={() => {
              setNameInput("");
              setNameError(null);
              setTransfer({ phase: "create", mode: transfer.mode, streamId: transfer.streamId });
            }}
            onCancel={() => setTransfer(null)}
          />,
          document.body,
        )}

      {transfer?.phase === "create" &&
        createPortal(
          <ProfileNameDialog
            title={m.transfer_create_new_profile()}
            value={nameInput}
            error={nameError}
            busy={busy}
            onChange={(v) => { setNameInput(v); setNameError(null); }}
            onConfirm={doCreateAndTransfer}
            onCancel={() => { setTransfer(null); setNameInput(""); setNameError(null); }}
          />,
          document.body,
        )}
    </>
  );
});
StreamList.displayName = "StreamList";
