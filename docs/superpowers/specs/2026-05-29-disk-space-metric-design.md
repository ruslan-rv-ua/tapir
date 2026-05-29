# Disk-space metric — design

**Date:** 2026-05-29
**Branch:** `feat/disk-space-metric` (from `develop`)
**Status:** approved

## Problem

The "free space" indicator is a half-wired feature spread across three places:

- **Streams screen metrics bar** ([StreamsPanel.tsx:288-296](../../../src/components/streams/StreamsPanel.tsx)) — the 4th metric card is a stub showing `—` with aria-label `metric_free_space_unavailable`.
- **Settings** — `disk_space_threshold_gb` ([settings.rs:28-29](../../../src-tauri/src/settings.rs)) exists (default 1 GB) with UI in [GeneralTab.tsx:186-201](../../../src/components/settings/GeneralTab.tsx), but the value is **never consumed** anywhere in the backend.
- **StatusBar** — the architecture doc ([architecture.md:133](../../../docs/architecture.md)) says it should show disk space, but there is no such segment.

There is no backend command to query free disk space, so the card is stuck on `—`.

This feature wires the missing layer: a backend command to read free space, a polling hook + store on the frontend, and display on both the streams card and the StatusBar, with a visual warning state when free space drops below the configured threshold.

## Scope

In scope:

- Backend command `get_free_space` returning free bytes on the recording volume.
- Frontend `$freeSpace` store + polling hook (30 s interval).
- Streams metrics card: real value, unavailable state, low-space warning state.
- StatusBar: new free-space segment with the same warning state.
- Activate the dead `disk_space_threshold_gb` setting as a **visual** warning threshold only.
- Update the setting's description text to stop promising stop-recording behavior.

Explicitly out of scope (YAGNI):

- Stopping/pausing recording on low disk space.
- Toast/notification on threshold crossing.
- Backend event push / scheduler changes.
- Showing total capacity or a percentage bar (free bytes only).

## Architecture

Three layers.

### 1. Backend — `get_free_space` command

New `#[tauri::command] async fn get_free_space` in [settings_commands.rs](../../../src-tauri/src/commands/settings_commands.rs):

1. Read the active profile's `recording.output_dir` and resolve it to an absolute path.
2. Query free bytes available to the caller on that path's volume via Win32 `GetDiskFreeSpaceExW`.
3. Return `Result<u64, String>` — free bytes. On any failure (path missing, API error) return `Err`; the frontend treats this as "unavailable".

**Path resolution reuse:** `resolve_output_dir` is currently a private fn in [songs_commands.rs:11-19](../../../src-tauri/src/commands/songs_commands.rs). Extract it into `portable.rs` as a shared `pub fn resolve_output_dir(rel: &str) -> PathBuf` and have both `songs_commands` and the new command call it. This removes duplication rather than adding a second copy.

**Win32 access:** the `windows` crate (v0.62) is **already a dependency**. Add the `Win32_Storage_FileSystem` feature to its feature list in [Cargo.toml:73-77](../../../src-tauri/Cargo.toml) and call `GetDiskFreeSpaceExW`. No new crate.

The actual disk read is blocking; wrap it in `tokio::task::spawn_blocking` (matching the pattern of `save_settings` / `list_saved_songs`).

`u64` free bytes serializes to a JSON number. Real disks are far below 2^53 bytes (9 PB), so no precision loss in JS.

Register the command in the `invoke_handler` in [lib.rs:95](../../../src-tauri/src/lib.rs).

### 2. Frontend — store + polling hook

New store in `src/stores/` (add to existing or a small new file):

```ts
export const $freeSpace = atom<number | null>(null); // bytes, null = unavailable
```

A polling hook (mounted once, in [App.tsx](../../../src/App.tsx) alongside the existing event wiring):

- On mount: call `getFreeSpace()` immediately.
- `setInterval` every **30 s**: call `getFreeSpace()`, write the result to `$freeSpace`.
- On error: set `$freeSpace` to `null`.
- Clear the interval on unmount.

Add a thin wrapper `getFreeSpace(): Promise<number>` to [tauri.ts](../../../src/lib/tauri.ts) (matching the existing `invoke` wrappers).

Disk space changes slowly; 30 s is ample and keeps the backend change to one read-only command, decoupled from any scheduler.

### 3. UI — two surfaces

Both surfaces read `$freeSpace` (via `useStore`) and `diskSpaceThresholdGb` (from the existing settings store).

**Low-space predicate** (shared helper, e.g. in `formatters.ts` or a small util):

```
isLow = threshold > 0 && freeBytes !== null && freeBytes < threshold * 1024**3
```

`threshold === 0` disables the warning. Uses 1024³ (GiB) to match `formatBytes`' base.

**Streams metrics card** ([StreamsPanel.tsx:288-296](../../../src/components/streams/StreamsPanel.tsx)):

- `freeBytes === null` → keep current unavailable state: `—` + aria-label `metric_free_space_unavailable`.
- Available → `<strong>{formatBytes(freeBytes)}</strong>`, label `metric_free_space`, aria-label combining label + value.
- `isLow` → warning style (amber border/text, e.g. `border-amber-500/40 text-amber-300`, plus `forced-colors` fallback) and aria-label uses the new low-space message.

**StatusBar** ([StatusBar.tsx](../../../src/components/layout/StatusBar.tsx)):

Add a free-space segment. To avoid breaking the roving-focus index scheme (currently `segRefs = [seg0Ref, seg1Ref]` with `seg1` conditionally rendered and last), the new order is:

| index | segment | rendered |
|-------|---------|----------|
| 0 | recordings count | always |
| 1 | free space | always (`—` while `null`) |
| 2 | longest recording | conditional (`longestMs > 0`), **last** |

The conditional segment stays at the highest index, preserving the existing "reset focus to 0 when the last segment unmounts" logic — generalize the `if (longestMs === 0) moveTo(0)` effect to account for the new index. `segRefs` becomes `[seg0Ref, seg1Ref, seg2Ref]`. Free-space segment shows `formatBytes` (or `—` when null), warning style + aria when `isLow`, mirroring the card.

## i18n

Existing `metric_free_space` (label) and `metric_free_space_unavailable` (aria) stay. The card composes its aria-label as `` `${metric_free_space()}: ${formatBytes(freeBytes)}` `` (mirroring how sibling cards build `aria-label`), so the value needs no new key. The `free_space` key (`"Free: {space}"` / `"Вільно: {space}"`) already exists and MAY be used for the StatusBar segment's aria-label; this is the only candidate use — do not add a duplicate.

Add:

- `metric_free_space_low` — low-space aria-label, e.g. `"Free space low: {space}"` / `"Мало вільного місця: {space}"`.

Update (fix the misleading promise):

- `settings_disk_threshold_desc`:
  - en: `"Warn when free disk space drops below this threshold. 0 = disabled"`
  - uk: `"Попереджати, коли вільного місця менше за поріг. 0 = вимкнено"`

**Codegen:** the project uses `@inlang/paraglide-vite`, but the vitest config does NOT load the Vite plugin, so generated JS must be committed. After editing `en.json`/`uk.json`, run:

```
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide
```

Commit the regenerated files under `src/i18n/paraglide/`.

## Error handling

- Backend command failure → `Err(String)` → hook sets `$freeSpace = null` → both surfaces show the unavailable state. No crash, no toast.
- Missing/relative `output_dir` → resolved against `portable::data_dir()` (existing behavior); if the resolved path doesn't exist yet, the Win32 call may still succeed for the volume root, but any error degrades gracefully to "unavailable".

## Testing (Vitest)

- **Display logic:** card and StatusBar segment render correctly for the three states — value present, `null` (unavailable), and below-threshold (warning). Assert text (`formatBytes` output / `—`) and warning styling/aria.
- **Threshold predicate:** `isLow` is false when `threshold === 0`, false when `freeBytes === null`, true/false around the boundary.
- **Polling hook:** with `invoke` mocked, store updates on success and resets to `null` on rejection; interval is cleared on unmount.
- **StatusBar roving focus:** focus navigation across the 3-segment layout, and focus reset when the conditional last segment unmounts.
- **Backend:** unit test for the extracted `resolve_output_dir` (absolute vs relative). The Win32 call itself is not mocked.

## Files touched

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | add `Win32_Storage_FileSystem` feature to `windows` |
| `src-tauri/src/portable.rs` | add shared `resolve_output_dir` |
| `src-tauri/src/commands/songs_commands.rs` | use shared `resolve_output_dir` |
| `src-tauri/src/commands/settings_commands.rs` | new `get_free_space` command |
| `src-tauri/src/lib.rs` | register command in `invoke_handler` |
| `src/lib/tauri.ts` | `getFreeSpace()` wrapper |
| `src/stores/*` | `$freeSpace` atom |
| `src/App.tsx` | polling hook |
| `src/lib/formatters.ts` (or util) | `isLowDiskSpace` helper (reuse `formatBytes`) |
| `src/components/streams/StreamsPanel.tsx` | fill the metric card |
| `src/components/layout/StatusBar.tsx` | add free-space segment |
| `src/i18n/messages/{en,uk}.json` | +1 key, edit 1 description |
| `src/i18n/paraglide/` | regenerated output (committed) |
