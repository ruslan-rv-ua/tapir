# Copy / Move a stream to another profile

**Date:** 2026-06-09
**Branch:** `feat/stream-copy-move-to-profile`
**Status:** Approved design

## Problem

Streams live inside a profile (`data/profiles/{name}.tapirprofile`). Only one
profile is active at a time and the Streams screen shows that profile's streams.
Today the only way to get a stream into another profile is to re-add it by URL
there, or duplicate the whole profile. There is no per-stream way to copy or move
a single stream between profiles.

## Goal

Add two items to a stream's context menu on the Streams screen:

- **Копіювати в профіль…** — copy the stream into another profile; it stays in
  the current profile too.
- **Перемістити в профіль…** — copy the stream into another profile and remove
  it from the current (active) profile.

Both open a modal dialog to choose the target profile (existing profiles or
"create new"). The work must respect the app's strong accessibility model
(focus management, live announcements, keyboard navigation).

## Non-goals

- No multi-select / bulk transfer (single stream per action).
- No drag-and-drop between profiles.
- No merge of wishlist / ignorelist / scheduled recordings — only the
  `StreamInfo` entry moves.
- No change to the profile data model or to `useProfileSync`.

## Decisions (settled during brainstorming)

1. **Target picker** = modal dialog with a profile list (matches
   `ProfileNameDialog` / `ConfirmDialog`), not a submenu.
2. The dialog lists **existing (non-active) profiles** plus a
   **"+ Новий профіль…"** entry that creates a profile and transfers into it.
3. **Move is disabled** while the stream is active (recording / connecting /
   reconnecting) or playing through the player. Copy is always available.
4. **Duplicate by URL** in the target profile is **blocked**: report
   "already in profile X" and change nothing (for move, the source is **not**
   removed).
5. **Passwords are preserved** on copy/move (DPAPI ciphertext stays valid on the
   same machine+user) — deliberately different from profile *export*, which
   strips passwords.

## Architecture context

- Profiles are independent JSON files. The active profile is held in memory at
  `AppState.active_profile`; other profiles exist only on disk and are read via
  `Profile::load` / written via `Profile::save` (already used by duplicate /
  rename / export).
- `list_profiles()` returns all profiles with an `isActive` flag.
- Existing stream commands ([stream_commands.rs](../../../src-tauri/src/commands/stream_commands.rs))
  take an `active_profile` write lock, mutate `profile.streams`, and persist a
  snapshot via `tokio::task::spawn_blocking(move || snapshot.save())`.
- The frontend updates `$streams` optimistically after destructive ops (see
  `handleConfirmDelete` in [StreamList.tsx](../../../src/components/streams/StreamList.tsx)).

## Design

### 1. Backend (Rust)

One internal command, two thin frontend wrappers.

**Command:** `transfer_stream_to_profile(stream_id, target_profile, mode)` in
[stream_commands.rs](../../../src-tauri/src/commands/stream_commands.rs), where
`mode` is an enum-like string `"copy" | "move"`. Registered in
`commands/mod.rs` invoke handler and `lib.rs`.

Steps:

1. **Guard `target != active`** — if the target equals the active profile name,
   return `Forbidden` (the UI never offers the active profile; this is a
   safety net).
2. **Find the source stream** by `id` in the active profile (clone it). Not
   found → error.
3. **Move-guard** — if a live recording task exists for this `id` in
   `stream_manager`, return `Forbidden`. (UI also disables the item; this guards
   data integrity if bypassed.) The player-source case is **UI-only**: the menu
   disables move while playing, but the backend does not hard-guard it, because
   the player holds the resolved URL rather than the profile entry, so removing
   the entry does not interrupt playback — it is a UX nicety, not an integrity
   concern.
4. **Load target** profile from disk (`Profile::load(target)`), on a blocking
   thread.
5. **Dedup by URL** — if any `target.streams[*].url == source.url`, return a
   `Conflict` carrying the target profile name. Nothing is changed; for move the
   source is **not** removed.
6. **Insert** a clone of the source into the target:
   - `copy` → assign a fresh `nanoid` `id` and `added_at = now` (guarantees
     within-profile id uniqueness, e.g. when copying the same stream twice).
   - `move` → keep the original `id` and `added_at`.
   - In both cases keep `username` / `password` / `ignorelist` / icy fields
     verbatim (passwords are **not** stripped — local transfer).
7. **Save target** profile (`spawn_blocking`).
8. **Move only:** remove the stream from the active profile
   (`profile.streams.retain(|s| s.id != stream_id)`) and persist a snapshot —
   mirroring `remove_stream` (best-effort `stop_recording` is unnecessary because
   move is guarded against active streams, but a best-effort stop is harmless).
9. Return `()`. The frontend updates its store optimistically.

Error types reuse `RadioError` (`Forbidden`, `NotFound`, `Conflict`,
`InvalidData`) and are surfaced as strings, consistent with existing commands.

### 2. IPC layer (`tauri.ts`)

Two wrappers in [tauri.ts](../../../src/lib/tauri.ts):

```ts
export async function copyStreamToProfile(streamId: string, targetProfile: string): Promise<void> {
  return invoke("transfer_stream_to_profile", { streamId, targetProfile, mode: "copy" });
}
export async function moveStreamToProfile(streamId: string, targetProfile: string): Promise<void> {
  return invoke("transfer_stream_to_profile", { streamId, targetProfile, mode: "move" });
}
```

### 3. Frontend UI

**Context menu** ([StreamContextMenu.tsx](../../../src/components/streams/StreamContextMenu.tsx)):
add two items before the delete separator —

- "Копіювати в профіль…" (lucide `Copy`) → `onCopyToProfile()`.
- "Перемістити в профіль…" (lucide `FolderInput`) → `onMoveToProfile()`,
  `isDisabled` when the stream is active (`recording | connecting |
  reconnecting`) or is the current player source. The menu already reads
  `$playerStatus` and `status`. New props: `onCopyToProfile`, `onMoveToProfile`.

**Target picker dialog** — new `StreamTransferDialog` component, portalled,
following `ConfirmDialog` / `ProfileNameDialog` structure:

- `role="dialog"`, `aria-modal`, labelled by a title that depends on `mode`
  ("Копіювати потік у профіль" / "Перемістити потік у профіль", including the
  stream name).
- A keyboard-navigable list of **non-active** profiles (from `listProfiles()`,
  filtered `!isActive`), each selectable; selecting one performs the transfer.
- A trailing **"+ Новий профіль…"** entry.
- Empty state when no other profiles exist → only the create-new path is shown.
- Escape / Cancel closes; focus returns to the originating ⋯ trigger.

**Create-new sub-flow:** the "Новий профіль…" entry opens the existing
`ProfileNameDialog` → `createProfile(name)` (reusing its name validation and
inline error display) → then immediately copy/move into the new profile.

**State ownership:** lift transfer state into
[StreamList.tsx](../../../src/components/streams/StreamList.tsx), which already
owns `pendingDeleteId` + its `ConfirmDialog` and renders each `StreamItem` with
callbacks. Add `transfer: { mode: "copy" | "move"; streamId: string } | null`.
`StreamList` orchestrates: fetch + filter profiles, call the right wrapper,
handle create-new, toasts, and announcements. `StreamsPanel` is unchanged.

### 4. Data flow & refresh

- **Copy:** only the target file on disk changes; `$streams` unchanged. Toast:
  «{stream}» скопійовано в «{profile}». A later switch to the target profile
  picks up the change via `useProfileSync` — no event needed.
- **Move:** target file + active profile (memory & disk) change; the frontend
  removes the stream from `$streams` optimistically (like delete) + a polite
  announcement. `CompositeList` handles focus when the row disappears.
- **Duplicate conflict:** backend returns `Conflict` → toast «{stream}» вже є в
  профілі «{profile}»; nothing changes.

### 5. i18n

New keys in [uk.json](../../../src/i18n/messages/uk.json) and
[en.json](../../../src/i18n/messages/en.json): menu items
(`copy_to_profile`, `move_to_profile`), dialog titles/labels, the create-new
entry, success toasts (`stream_copied_to_profile`, `stream_moved_to_profile`),
the conflict message (`stream_already_in_profile`), the empty-state text, and
the move-disabled reason (title/aria). Regenerate paraglide messages via the
vite plugin. Gates: `pnpm test` + `pnpm vite:build` (`tsc` has ~51 pre-existing
untyped-paraglide errors and is not a gate).

### 6. Accessibility

- Dialog: `aria-modal`, focus trap, Escape closes, focus returns to the ⋯
  trigger on close.
- Profile list fully keyboard-navigable.
- Disabled "Перемістити" conveys its reason via `title` / `aria`.
- Polite announcements via `useAnnounce` on copy/move success, consistent with
  existing flows.

## Testing

**Rust unit tests** (mirror existing `profile.rs` / command test style):

- copy adds a new entry with a fresh id and preserves the password.
- move removes from the source and adds to the target (same id).
- dedup by URL blocks the transfer (and does not remove the source on move).
- `target == active` is rejected.
- move while a recording task is live is rejected.
- stream-not-found errors.

**Frontend tests** (mirror `StreamItem.test` / `ProfileContextMenu.test`):

- context menu renders the two new items.
- "Перемістити" is disabled when recording / connecting / reconnecting / playing.
- the picker lists non-active profiles + the create-new entry.
- selecting a profile calls the correct `tauri` wrapper.
- move optimistically removes the stream from `$streams`.
- a duplicate conflict surfaces the "already in profile" message.

## Edge cases

- **No other profiles:** dialog shows only "+ Новий профіль…".
- **Copy the same stream twice into one profile:** first succeeds (fresh id);
  second is blocked by the URL dedup.
- **Target profile file is corrupt/unreadable:** `Profile::load` errors →
  surfaced as a toast; no partial change.
- **Save failure on the target:** error surfaced; for move, the source is only
  removed *after* the target save succeeds, so a failed target save leaves the
  source intact.
