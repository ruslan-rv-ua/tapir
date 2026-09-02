import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams, $statuses, $streamSelection, $editStream, replaceSelection, pruneSelection } from "../../stores/streams";
import { $settings } from "../../stores/settings";
import { $playerStatus } from "../../stores/player";
import { CompositeList } from "../common/composite-list";
import type { ActionModifiers, CompositeSelection, SelectionChange, SegmentKind } from "../../hooks/useCompositeList";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StreamInfo, ProfileMeta } from "../../lib/tauri";
import { StreamItem, getStreamSegments } from "./StreamItem";
import { playRefusalMessage } from "../../lib/playRefusal";
import { StreamTransferDialog } from "./StreamTransferDialog";
import { ProfileNameDialog } from "../profile/ProfileNameDialog";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import { streamOpenErrorMessage } from "../../lib/shellOpenError";
import { isRecordingLike } from "../../lib/streamState";
import { useAnnounce } from "../../hooks/useAnnounce";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../common/ConfirmDialog";
import * as m from "../../i18n/paraglide/messages";

/** Imperative handle: zone navigation + the toolbar's bulk-op entry points. */
export type StreamListHandle = ZoneEntry & {
  requestBulkDelete(): void;
  requestBulkTransfer(mode: "copy" | "move"): void;
};

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  /** Pre-filtered list to render. Defaults to all streams in the store. */
  streams?: StreamInfo[];
}

export const StreamList = forwardRef<StreamListHandle, Props>(({ exitZone, onEmpty, streams: streamsProp }, ref) => {
  const allStreams = useStore($streams);
  const statuses = useStore($statuses);
  const selectedSet = useStore($streamSelection);
  const settings = useStore($settings);
  const playerStatus = useStore($playerStatus);
  const streams = streamsProp ?? allStreams;
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const pendingBulkFocusRef = useRef<string | null>(null);
  // Incremented each time a bulk delete succeeds, so the focus effect fires
  // even when `items` does not change (e.g. when the parent supplies a static
  // `streams` prop that it filters before passing in).
  const [bulkDeleteSeq, setBulkDeleteSeq] = useState(0);
  const focusItemRef = useRef<((id: string, segment?: SegmentKind) => void) | null>(null);

  const announce = useAnnounce();

  /** True while OUR player holds this stream (any non-stopped state). */
  const isPlayingStream = useCallback(
    (streamId: string) =>
      playerStatus.state !== "stopped" &&
      playerStatus.source?.type === "stream" &&
      playerStatus.source.streamId === streamId,
    [playerStatus],
  );

  /**
   * The ⋯ menu's `moveDisabled` (StreamContextMenu), reused for the keyboard route:
   * playback is not a recording state (R4), but a stream the user is listening to
   * must not be moved out from under the player either. Single route only — see the
   * transfer branch in onAction.
   */
  const isMoveBlocked = useCallback(
    (streamId: string) => isRecordingLike(statuses[streamId]?.state) || isPlayingStream(streamId),
    [statuses, isPlayingStream],
  );

  const selectionAdapter = useMemo<CompositeSelection>(
    () => ({
      current: () => $streamSelection.get(),
      replace: (next) => replaceSelection(next),
    }),
    [],
  );

  const handleSelectionChange = useCallback(
    (c: SelectionChange) => {
      // A pointer single already moved DOM focus → NVDA reads the row (with its
      // ", виділено" suffix) natively; re-announcing would double-speak.
      if (c.via === "pointer" && c.kind === "single") return;
      if (c.kind === "single") {
        // c.lastId is always a visible row (focus stays on rendered items), so the
        // filtered `streams` list is the right place to resolve its name.
        const name = streams.find((s) => s.id === c.lastId)?.name ?? "";
        announce(c.selected ? m.item_selected({ name }) : m.item_deselected({ name }), "polite");
      } else {
        announce(c.count === 0 ? m.selection_cleared() : m.selection_count({ count: c.count }), "polite");
      }
    },
    [streams, announce],
  );

  type TransferTarget = { kind: "single"; streamId: string } | { kind: "bulk" };
  type Transfer =
    | null
    | { phase: "pick"; mode: "copy" | "move"; target: TransferTarget; profiles: ProfileMeta[] }
    | { phase: "create"; mode: "copy" | "move"; target: TransferTarget };
  const [transfer, setTransfer] = useState<Transfer>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openTransfer = useCallback(async (mode: "copy" | "move", target: TransferTarget) => {
    try {
      const all = await tauri.listProfiles();
      setTransfer({ phase: "pick", mode, target, profiles: all.filter((p) => !p.isActive) });
    } catch (e) {
      addToast(String(e), "error");
    }
  }, []);

  /**
   * Hand the focus effect below an explicit destination after rows are removed.
   * Both indices come from the VISIBLE order (the filtered prop, not the full
   * store) snapshotted BEFORE the removal: the first survivor at/after the top
   * removed index, clamped to the new tail. `Math.max(0, …)` is the not-found
   * fallback (findIndex === -1 when no removed row was visible, e.g. under a
   * filter) → land on the first row. No survivors → null, and the caller's
   * onEmpty() owns that case.
   *
   * Shared by all three removal paths (single/bulk delete, single/bulk move) so
   * they cannot drift: the seq bump is what makes the effect fire even when
   * `items` is unchanged because the parent pre-filters `streams`.
   */
  const handOffFocusAfterRemoval = (visible: StreamInfo[], removed: ReadonlySet<string>) => {
    const topRemovedIdx = Math.max(0, visible.findIndex((s) => removed.has(s.id)));
    const survivors = visible.filter((s) => !removed.has(s.id));
    pendingBulkFocusRef.current =
      survivors.length === 0 ? null : survivors[Math.min(topRemovedIdx, survivors.length - 1)].id;
    setBulkDeleteSeq((n) => n + 1);
    return survivors;
  };

  const composeSummary = (mode: "copy" | "move", res: tauri.BulkTransferResult): string => {
    const lead =
      mode === "move"
        ? m.transfer_done_moved({ count: res.transferred.length })
        : m.transfer_done_copied({ count: res.transferred.length });
    const parts = [lead];
    if (res.skippedRecording > 0) parts.push(m.transfer_skipped_recording({ count: res.skippedRecording }));
    if (res.skippedConflict > 0) parts.push(m.transfer_skipped_conflict({ count: res.skippedConflict }));
    return parts.join(", ");
  };

  const doBulkTransfer = async (mode: "copy" | "move", targetProfile: string) => {
    const ids = [...$streamSelection.get()];
    if (ids.length === 0) { setTransfer(null); return; }
    const visible = streams; // snapshot before await — for the focus index (A8)
    try {
      const res = mode === "move"
        ? await tauri.moveStreamsToProfile(ids, targetProfile)
        : await tauri.copyStreamsToProfile(ids, targetProfile);
      if (mode === "move" && res.transferred.length > 0) {
        const moved = new Set(res.transferred);
        // Remove only the transferred rows; pruneSelection drops them from the
        // selection, leaving the skipped rows selected (R3). copy: untouched.
        $streams.set($streams.get().filter((s) => !moved.has(s.id)));
        if (handOffFocusAfterRemoval(visible, moved).length === 0) onEmpty();
      }
      announce(composeSummary(mode, res), "polite");
      setTransfer(null);
    } catch (err) {
      addToast(String(err), "error");
      setTransfer(null);
    }
  };

  const imperativeExtra = useCallback(
    (api: { focusItem: (itemId: string, segment?: SegmentKind) => void }) => {
      // Stash the latest focusItem; the handle is rebuilt on items change, so this
      // ref always points at a focusItem that knows the post-delete item set.
      focusItemRef.current = api.focusItem;
      return {
        requestBulkDelete: () => setBulkConfirmOpen(true),
        requestBulkTransfer: (mode: "copy" | "move") => openTransfer(mode, { kind: "bulk" }),
      };
    },
    [openTransfer],
  );

  const doTransfer = async (mode: "copy" | "move", streamId: string, targetProfile: string) => {
    const name = $streams.get().find((s) => s.id === streamId)?.name ?? "";
    const visible = streams; // snapshot before await — for the focus index (A9)
    try {
      if (mode === "copy") await tauri.copyStreamToProfile(streamId, targetProfile);
      else await tauri.moveStreamToProfile(streamId, targetProfile);

      if (mode === "move") {
        // A9: single move gets the same explicit focus hand-off the bulk paths have.
        // Reached from Shift+F5 the vanishing row IS the focused one and there is no
        // ⋯ trigger to fall back on, so leaving it to the hook's passive "active row
        // disappeared" reconciliation would put it in a race with react-aria's rAF
        // focus restore — the very race the bulk path moved to useLayoutEffect to win.
        $streams.set($streams.get().filter((s) => s.id !== streamId));
        // Same dead-onEmpty issue as handleConfirmDelete: moving the last
        // visible stream away unmounts this list in the same render.
        if (handOffFocusAfterRemoval(visible, new Set([streamId])).length === 0) onEmpty();
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
        // Keep the picker open so the user can pick a different profile.
        addToast(m.stream_already_in_profile({ name, profile: targetProfile }), "info");
      } else {
        addToast(msg, "error");
        setTransfer(null);
      }
    }
  };

  const doCreateAndTransfer = async () => {
    if (!transfer || transfer.phase !== "create") return;
    setNameError(null);
    setBusy(true);
    try {
      const meta = await tauri.createProfile(nameInput.trim());
      const { mode, target } = transfer;
      setNameInput("");
      if (target.kind === "bulk") await doBulkTransfer(mode, meta.name);
      else await doTransfer(mode, target.streamId, meta.name);
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

  // Programmatic focus after a bulk delete. useLayoutEffect (not useEffect) so it
  // runs in the layout phase of the post-deletion commit, AFTER the unmounting
  // ConfirmDialog (react-aria Modal) restores focus to its now-removed trigger in
  // the mutation phase — making this the last word. NOTE: react-aria can defer
  // restoration to a rAF in the "trigger was removed" branch, which jsdom doesn't
  // exercise; this ordering is verified by the manual NVDA pass (focus must land
  // on a surviving row, never <body>). Survivors > 0 only; the empty case already
  // called onEmpty() in the handler. `bulkDeleteSeq` is also in deps so the effect
  // fires even when `items` does not change (parent supplied a pre-filtered prop).
  useLayoutEffect(() => {
    const targetId = pendingBulkFocusRef.current;
    if (!targetId) return;
    pendingBulkFocusRef.current = null;
    focusItemRef.current?.(targetId, "summary");
  }, [items, bulkDeleteSeq]);

  // Prune ids that vanished from $streams (after bulk ops, edits, sync). Uses the
  // FULL store, not the visible list — a row hidden by a status change under a
  // chip must NOT drop out of the selection (only an explicit filter change clears).
  useEffect(() => {
    pruneSelection(new Set(allStreams.map((s) => s.id)));
  }, [allStreams]);

  // The row's primary action, shared by keyboard activation (Enter/Space on the
  // summary) and a mouse double-click. Per `doubleClickAction` it toggles either
  // playback or recording (the default). The fixed combos override the setting:
  // Shift = listen, Ctrl = record (app-wide convention, see keyboard-shortcuts.md).
  const activateStream = useCallback(
    (itemId: string, mods?: ActionModifiers) => {
      const action = mods?.shift
        ? "play"
        : mods?.ctrl
          ? "record"
          : (settings?.doubleClickAction ?? "record");
      if (action === "play") {
        (isPlayingStream(itemId) ? tauri.stopPlayback() : tauri.playStream(itemId)).catch((err) =>
          addToast(playRefusalMessage(err), "error"),
        );
      } else {
        const isRecording = statuses[itemId]?.state === "recording";
        (isRecording ? tauri.stopRecording(itemId) : tauri.startRecording(itemId)).catch((err) =>
          addToast(String(err), "error"),
        );
      }
    },
    [settings, isPlayingStream, statuses],
  );

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    const streamName = streams.find((s) => s.id === pendingDeleteId)?.name ?? "";
    try {
      await tauri.removeStream(pendingDeleteId);
      $streams.set($streams.get().filter((s) => s.id !== pendingDeleteId));
      // Visible survivors (the filtered prop, not the full store). When the last
      // visible row goes, the parent swaps this list for an empty zone in the
      // SAME render as the store write above — useCompositeList's own [items]
      // effect never runs, so its onEmpty is dead code on this path (the
      // wishlist 223fadb mechanism). Call it imperatively, like the bulk
      // handlers below already do.
      if (streams.every((s) => s.id === pendingDeleteId)) onEmpty();
      addToast(m.stream_removed({ name: streamName }), "info");
    } catch (err) {
      addToast(String(err), "error");
    }
    setPendingDeleteId(null);
  };

  const handleConfirmBulkDelete = async () => {
    const ids = [...$streamSelection.get()];
    if (ids.length === 0) {
      // Defensive: the selection was cleared (e.g. profile-change prune) while the
      // dialog was open. Nothing to delete.
      setBulkConfirmOpen(false);
      return;
    }
    const idSet = new Set(ids);
    const visible = streams; // snapshot before await — for the focus index (A8)
    try {
      const removed = await tauri.removeStreams(ids);
      $streams.set($streams.get().filter((s) => !idSet.has(s.id)));
      replaceSelection(new Set());
      announce(m.streams_removed_bulk({ count: removed }), "polite");
      if (handOffFocusAfterRemoval(visible, idSet).length === 0) onEmpty();
    } catch (err) {
      addToast(String(err), "error");
    }
    setBulkConfirmOpen(false);
  };

  // Success is deliberately silent: the media player taking the foreground is
  // the feedback, and a toast fired mid-switch would be cut off unread. A
  // failure leaves Tapir in front, so its toast is heard.
  const openStreamInPlayer = async (streamId: string) => {
    try {
      await tauri.openStreamInApp(streamId);
    } catch (err) {
      addToast(streamOpenErrorMessage(err), "error");
    }
  };

  const copyStreamUrl = async (stream: StreamInfo) => {
    try {
      await navigator.clipboard.writeText(stream.url);
      addToast(m.stream_url_copied({ name: stream.name }), "info");
      announce(m.stream_url_copied({ name: stream.name }), "polite");
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  return (
    <>
      <CompositeList<StreamListHandle>
        ref={ref}
        imperativeExtra={imperativeExtra}
        zoneId="streams-list"
        ariaLabel={m.zone_streams_list()}
        items={items}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onTabOut={exitZone}
        onEmpty={onEmpty}
        selection={selectionAdapter}
        onSelectionChange={handleSelectionChange}
        onAction={(type, itemId, segment, mods) => {
          if (type === "copy") {
            const stream = streams.find((s) => s.id === itemId);
            if (stream) copyStreamUrl(stream);
            return;
          }
          if (type === "edit") {
            // F2 → edit (rename) the focused row. Single-row only: ignores the
            // selection (unlike Delete) and opens AddStreamDialog in edit mode via
            // the shared $editStream store — the same path as the ⋯-menu "Edit".
            const stream = streams.find((s) => s.id === itemId);
            if (stream) $editStream.set(stream);
            return;
          }
          if (type === "delete") {
            // Keyboard Delete acts on the WHOLE selection if any (size > 0) — the
            // focused row need not itself be selected. This differs from the per-row
            // ⋯ menu onDelete below, which routes by .has(id) (Explorer model).
            if ($streamSelection.get().size > 0) setBulkConfirmOpen(true);
            else setPendingDeleteId(itemId);
            return;
          }
          if (type === "transfer-copy" || type === "transfer-move") {
            // F5 / Shift+F5. Selection semantics mirror Delete above one-for-one,
            // including its divergence from the ⋯ menu (size > 0 here, .has(id)
            // there): internal keyboard consistency beats keyboard↔menu symmetry.
            const mode = type === "transfer-copy" ? "copy" : "move";
            if ($streamSelection.get().size > 0) {
              openTransfer(mode, { kind: "bulk" });
              return;
            }
            // Single move only: honour the same safeguard the ⋯ menu shows as a
            // DISABLED "Move to profile". Without it the keyboard would either make
            // the user pick a profile only to hear a raw backend error (recording), or
            // silently move a stream out from under the player (playing — the backend
            // does not know about it). Copy has no guard; neither does the menu.
            if (mode === "move" && isMoveBlocked(itemId)) {
              // ToastContainer is role="log" aria-live="polite", so one call serves
              // both audiences — no separate announce().
              addToast(m.move_disabled_reason(), "info");
              return;
            }
            // Unlike the ⋯ menu's single route this does NOT collapse the selection
            // to {itemId} — the selection is already empty, there is nothing to collapse.
            openTransfer(mode, { kind: "single", streamId: itemId });
            return;
          }
          // Alt+Enter rides on the FOCUSED row only (like edit, unlike delete).
          // Space deliberately ignores modifiers, so Alt+Space stays a plain
          // play/record — mirrors SongsList.
          if (type === "primary" && segment === "summary" && mods?.alt) {
            openStreamInPlayer(itemId);
            return;
          }
          // Action buttons self-activate; only Enter/Space on the whole-row
          // summary triggers the row's primary action.
          if ((type === "primary" || type === "toggle") && segment === "summary") {
            activateStream(itemId, mods);
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
              isSelected={selectedSet.has(id)}
              onDelete={() => {
                // Explorer model: ⋯-delete on a row INSIDE the selection deletes the
                // whole selection; on a row OUTSIDE it, first collapse the selection
                // to that row (so the counter doesn't linger at N afterwards), then
                // single-delete. Routes by .has(id), not size > 0 (cf. keyboard above).
                if ($streamSelection.get().has(id)) {
                  setBulkConfirmOpen(true);
                } else {
                  replaceSelection(new Set([id]));
                  setPendingDeleteId(id);
                }
              }}
              onCopyToProfile={() => {
                if ($streamSelection.get().has(id)) openTransfer("copy", { kind: "bulk" });
                else { replaceSelection(new Set([id])); openTransfer("copy", { kind: "single", streamId: id }); }
              }}
              onMoveToProfile={() => {
                if ($streamSelection.get().has(id)) openTransfer("move", { kind: "bulk" });
                else { replaceSelection(new Set([id])); openTransfer("move", { kind: "single", streamId: id }); }
              }}
              onCopyUrl={() => copyStreamUrl(streams.find((s) => s.id === id)!)}
              onOpenInPlayer={() => openStreamInPlayer(id)}
              onActivate={(mods) => activateStream(id, mods)}
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

      {bulkConfirmOpen &&
        createPortal(
          <ConfirmDialog
            title={m.remove_stream()}
            message={m.confirm_delete_selected({ count: selectedSet.size })}
            onConfirm={handleConfirmBulkDelete}
            onCancel={() => setBulkConfirmOpen(false)}
          />,
          document.body,
        )}

      {transfer?.phase === "pick" &&
        createPortal(
          <StreamTransferDialog
            mode={transfer.mode}
            subject={
              transfer.target.kind === "bulk"
                ? { kind: "bulk", count: selectedSet.size }
                : { kind: "single", name: streams.find((s) => s.id === transfer.target.streamId)?.name ?? "" }
            }
            profiles={transfer.profiles}
            onSelect={(profileName) =>
              transfer.target.kind === "bulk"
                ? doBulkTransfer(transfer.mode, profileName)
                : doTransfer(transfer.mode, transfer.target.streamId, profileName)
            }
            onCreateNew={() => {
              setNameInput("");
              setNameError(null);
              setTransfer({ phase: "create", mode: transfer.mode, target: transfer.target });
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
