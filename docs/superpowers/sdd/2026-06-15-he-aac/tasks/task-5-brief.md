## Task 5: `StreamList` — bulk transfer convergence (B3/B4/B5)

**Files:**
- Modify: `src/components/streams/StreamList.tsx`
- Test: `src/components/streams/StreamList.test.tsx`

**Interfaces:**
- Consumes: `tauri.copyStreamsToProfile`/`moveStreamsToProfile`/`BulkTransferResult` (Task 1), `m.transfer_done_*`/`m.transfer_skipped_*` (Task 2).
- Produces: `StreamListHandle = ZoneEntry & { requestBulkDelete(): void; requestBulkTransfer(mode: "copy" | "move"): void }` (consumed by StreamsPanel, Task 6).

- [ ] **Step 1: Write the failing tests**

In `src/components/streams/StreamList.test.tsx`, extend the `vi.mock("../../lib/tauri", …)` block with the bulk wrappers (place near `copyStreamToProfile`):

```tsx
  copyStreamsToProfile: vi.fn().mockResolvedValue({ transferred: [], skippedRecording: 0, skippedConflict: 0 }),
  moveStreamsToProfile: vi.fn().mockResolvedValue({ transferred: [], skippedRecording: 0, skippedConflict: 0 }),
```

Add a new describe block:

```tsx
describe("StreamList — bulk transfer to profile", () => {
  const openMenu = (container: HTMLElement, id: string) =>
    fireEvent.click(container.querySelector<HTMLElement>(`li[data-item-id="${id}"] button[data-segment="action-menu"]`)!);
  const idOf = () => document.activeElement?.getAttribute("data-item-id") ?? null;

  it("toolbar requestBulkTransfer('move') opens the picker with the BULK title", async () => {
    replaceSelection(new Set(["a", "b"]));
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    await act(async () => { ref.current!.requestBulkTransfer("move"); });
    expect(await screen.findByText(m.move_selected_to_profile_title({ count: 2 }))).toBeTruthy();
  });

  it("bulk move calls moveStreamsToProfile, removes only transferred rows, focuses a survivor", async () => {
    vi.mocked(tauri.moveStreamsToProfile).mockResolvedValueOnce({ transferred: ["a"], skippedRecording: 0, skippedConflict: 0 });
    replaceSelection(new Set(["a", "b"])); // b will be reported as skipped (not in transferred)
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    const { container } = render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    act(() => (ref.current as unknown as ZoneEntry).focus("forward"));
    await act(async () => { ref.current!.requestBulkTransfer("move"); });
    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.moveStreamsToProfile).toHaveBeenCalledTimes(1));
    expect(new Set(vi.mocked(tauri.moveStreamsToProfile).mock.calls[0][0])).toEqual(new Set(["a", "b"]));
    await waitFor(() => expect($streams.get().map((s) => s.id)).toEqual(["b", "c"])); // only 'a' removed
    await waitFor(() => expect(idOf()).toBe("b")); // nearest survivor, never <body>
    expect(document.activeElement).not.toBe(document.body);
    expect([...$streamSelection.get()]).toEqual(["b"]); // moved 'a' pruned; skipped 'b' stays selected
  });

  it("bulk copy calls copyStreamsToProfile, keeps rows AND selection", async () => {
    vi.mocked(tauri.copyStreamsToProfile).mockResolvedValueOnce({ transferred: ["a", "b"], skippedRecording: 0, skippedConflict: 0 });
    replaceSelection(new Set(["a", "b"]));
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    await act(async () => { ref.current!.requestBulkTransfer("copy"); });
    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.copyStreamsToProfile).toHaveBeenCalledTimes(1));
    expect($streams.get().map((s) => s.id)).toEqual(["a", "b", "c"]); // nothing removed
    expect([...$streamSelection.get()].sort()).toEqual(["a", "b"]); // selection kept
  });

  it("announces a reason-broken-down summary", async () => {
    vi.mocked(tauri.moveStreamsToProfile).mockResolvedValueOnce({ transferred: ["a"], skippedRecording: 1, skippedConflict: 1 });
    replaceSelection(new Set(["a", "b", "c"]));
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    $announcer.set(null);
    await act(async () => { ref.current!.requestBulkTransfer("move"); });
    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));
    await waitFor(() =>
      expect($announcer.get()?.message).toBe(
        `${m.transfer_done_moved({ count: 1 })}, ${m.transfer_skipped_recording({ count: 1 })}, ${m.transfer_skipped_conflict({ count: 1 })}`,
      ),
    );
  });

  it("⋯ move on a SELECTED row opens bulk; on a NON-selected row collapses + single", async () => {
    replaceSelection(new Set(["a", "b"]));
    const { container } = renderList();
    openMenu(container, "a"); // selected
    fireEvent.click(await screen.findByRole("menuitem", { name: m.move_selected({ count: 2 }) }));
    expect(await screen.findByText(m.move_selected_to_profile_title({ count: 2 }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.cancel() }));

    openMenu(container, "c"); // not selected
    fireEvent.click(await screen.findByRole("menuitem", { name: m.move_to_profile() }));
    expect(await screen.findByText(m.move_stream_to_profile_title({ name: "Charlie" }))).toBeTruthy();
    expect([...$streamSelection.get()]).toEqual(["c"]); // collapsed to the row
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "bulk transfer"`
Expected: FAIL — `requestBulkTransfer` not on the handle; bulk routing/summary absent.

- [ ] **Step 3: Widen the handle type + Transfer target**

In `src/components/streams/StreamList.tsx`, change the handle type (line ~21) and the `Transfer` type (lines ~85-89):

```ts
/** Imperative handle: zone navigation + the toolbar's bulk-op entry points. */
export type StreamListHandle = ZoneEntry & {
  requestBulkDelete(): void;
  requestBulkTransfer(mode: "copy" | "move"): void;
};
```

```ts
  type TransferTarget = { kind: "single"; streamId: string } | { kind: "bulk" };
  type Transfer =
    | null
    | { phase: "pick"; mode: "copy" | "move"; target: TransferTarget; profiles: ProfileMeta[] }
    | { phase: "create"; mode: "copy" | "move"; target: TransferTarget };
```

- [ ] **Step 4: Make `openTransfer` stable + branch the transfer flows**

Replace `openTransfer` (lines ~94-101) with a `useCallback` version, and add `doBulkTransfer` + `composeSummary`. Place `openTransfer` **above** `imperativeExtra` (move the `imperativeExtra` definition below it, or keep `imperativeExtra` where it is and ensure `openTransfer` is declared earlier — both must precede the `imperativeExtra` that references it):

```ts
  const openTransfer = useCallback(async (mode: "copy" | "move", target: TransferTarget) => {
    try {
      const all = await tauri.listProfiles();
      setTransfer({ phase: "pick", mode, target, profiles: all.filter((p) => !p.isActive) });
    } catch (e) {
      addToast(String(e), "error");
    }
  }, []);

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
        const topRemovedIdx = Math.max(0, visible.findIndex((s) => moved.has(s.id)));
        const survivors = visible.filter((s) => !moved.has(s.id));
        // Remove only the transferred rows; pruneSelection drops them from the
        // selection, leaving the skipped rows selected (R3). copy: untouched.
        $streams.set($streams.get().filter((s) => !moved.has(s.id)));
        pendingBulkFocusRef.current =
          survivors.length === 0 ? null : survivors[Math.min(topRemovedIdx, survivors.length - 1)].id;
        if (survivors.length === 0) onEmpty();
        setBulkDeleteSeq((n) => n + 1);
      }
      announce(composeSummary(mode, res), "polite");
      setTransfer(null);
    } catch (err) {
      addToast(String(err), "error");
      setTransfer(null);
    }
  };
```

Update `imperativeExtra` (lines ~48-56) to also expose `requestBulkTransfer`:

```ts
  const imperativeExtra = useCallback(
    (api: { focusItem: (itemId: string, segment?: SegmentKind) => void }) => {
      focusItemRef.current = api.focusItem;
      return {
        requestBulkDelete: () => setBulkConfirmOpen(true),
        requestBulkTransfer: (mode: "copy" | "move") => openTransfer(mode, { kind: "bulk" }),
      };
    },
    [openTransfer],
  );
```

- [ ] **Step 5: Branch `doCreateAndTransfer` + the JSX routing/dialog**

Update `doCreateAndTransfer` (lines ~130-150) to branch by `target.kind`:

```ts
      const meta = await tauri.createProfile(nameInput.trim());
      const { mode, target } = transfer;
      setNameInput("");
      if (target.kind === "bulk") await doBulkTransfer(mode, meta.name);
      else await doTransfer(mode, target.streamId, meta.name);
```

In `renderRow`, route `onMoveToProfile`/`onCopyToProfile` by selection (mirror `onDelete`, lines ~307-321):

```tsx
              onCopyToProfile={() => {
                if ($streamSelection.get().has(id)) openTransfer("copy", { kind: "bulk" });
                else { replaceSelection(new Set([id])); openTransfer("copy", { kind: "single", streamId: id }); }
              }}
              onMoveToProfile={() => {
                if ($streamSelection.get().has(id)) openTransfer("move", { kind: "bulk" });
                else { replaceSelection(new Set([id])); openTransfer("move", { kind: "single", streamId: id }); }
              }}
```

Update the `StreamTransferDialog` render (lines ~349-364) to pass `subject` + branch `onSelect`:

```tsx
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
```

(`doTransfer` keeps its existing signature `(mode, streamId, targetProfile)` and its Conflict-keeps-picker-open behavior — used only for `{kind:"single"}`.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx`
Expected: PASS — new bulk-transfer block green; existing single copy/move/conflict/delete tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/components/streams/StreamList.tsx src/components/streams/StreamList.test.tsx
git commit -m "feat(streams): converge bulk copy/move in StreamList (handle + summary + focus)"
```

---

