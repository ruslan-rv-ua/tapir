## Task 5 Report: StreamList bulk transfer convergence

### Files changed
- `src/components/streams/StreamList.tsx` — main implementation
- `src/components/streams/StreamList.test.tsx` — new test block + mock additions

### What was implemented

**Type changes:**
- `StreamListHandle` widened: added `requestBulkTransfer(mode: "copy" | "move"): void`
- New local `TransferTarget` type: `{ kind: "single"; streamId: string } | { kind: "bulk" }`
- `Transfer` type updated: `streamId: string` replaced with `target: TransferTarget` in both `pick` and `create` phases

**New functions:**
- `openTransfer` refactored to `useCallback` with `TransferTarget` param (was async closure taking `streamId: string`)
- `composeSummary(mode, res)`: builds a `, `-joined summary string with lead clause + optional skip clauses
- `doBulkTransfer(mode, targetProfile)`: calls `tauri.moveStreamsToProfile` or `tauri.copyStreamsToProfile`; on move removes only `res.transferred` rows, computes survivor focus (mirrors bulk-delete logic), calls `onEmpty()` when no survivors, announces summary

**Declaration order fix:**
- Removed `imperativeExtra` from its original position (before `openTransfer`)
- Re-added `imperativeExtra` after `doBulkTransfer`, with `[openTransfer]` in deps and `requestBulkTransfer` in returned object — no use-before-declaration

**Routing changes:**
- `onMoveToProfile`/`onCopyToProfile` in `renderRow`: now branch by `.has(id)` — selected row → bulk, unselected row → collapse + single (mirrors `onDelete`)
- `doCreateAndTransfer`: branches by `target.kind` to call either `doBulkTransfer` or `doTransfer`
- `StreamTransferDialog` render: passes `subject` (not `streamName`) derived from `target.kind`; `onSelect` branches similarly; `onCreateNew` preserves `target` in the create phase state

### TDD evidence

**RED** — `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "bulk transfer"`
```
Tests  5 failed | 38 skipped (43)
```
Failures: `requestBulkTransfer` not on handle; `subject` prop missing from `StreamTransferDialog` (got `streamName` instead); bulk routing absent.

**GREEN** — after implementation, same command:
```
Tests  5 passed | 38 skipped (43)
```

**Full file GREEN** — `pnpm exec vitest run src/components/streams/StreamList.test.tsx`
```
Tests  43 passed (43)
```
All pre-existing single copy/move/conflict/delete/focus/announce tests still green.

### Self-review

- Declaration order: `openTransfer` declared at line ~88, `imperativeExtra` at line ~136 — no use-before-declaration.
- Single-transfer path unchanged: `doTransfer(mode, streamId, targetProfile)` keeps its signature and conflict-keeps-picker-open behavior; only called for `{kind:"single"}`.
- Focus never lands on `<body>`: uses the same `pendingBulkFocusRef` + `useLayoutEffect` + `setBulkDeleteSeq` mechanism as bulk-delete.
- `composeSummary` join format: `", "` separator, lead always present, skip clauses only when `> 0` — matches brief's test assertion exactly.
- No regressions: 38 pre-existing tests all pass.
- Committed only `StreamList.tsx` and `StreamList.test.tsx` — no paraglide files touched.
