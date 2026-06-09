# Copy / Move a stream to another profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Копіювати в профіль…" and "Перемістити в профіль…" to a stream's context menu, transferring a single `StreamInfo` into another profile (existing or newly created) via a modal picker.

**Architecture:** One Rust command `transfer_stream_to_profile(stream_id, target_profile, mode)` loads the target profile from disk, dedups by URL, inserts a clone (fresh id for copy / preserved id for move, passwords kept), and for `move` also removes the stream from the active profile. The frontend adds two menu items, a modal `StreamTransferDialog` (lists non-active profiles + "create new"), and orchestrates the calls in `StreamList`, updating `$streams` optimistically on move.

**Tech Stack:** Rust + Tauri v2 (backend), React 19 + nanostores + react-aria-components + paraglide i18n (frontend), vitest + cargo test.

**Spec:** [docs/superpowers/specs/2026-06-09-stream-copy-move-to-profile-design.md](../specs/2026-06-09-stream-copy-move-to-profile-design.md)

---

## File structure

- **Modify** [src-tauri/src/profile.rs](../../../src-tauri/src/profile.rs): add `Profile::add_stream_checked` (URL dedup) + unit tests.
- **Modify** [src-tauri/src/commands/stream_commands.rs](../../../src-tauri/src/commands/stream_commands.rs): add `TransferMode`, `prepare_transfer_stream` helper (+ tests), and the `transfer_stream_to_profile` command.
- **Modify** [src-tauri/src/lib.rs](../../../src-tauri/src/lib.rs): register the new command in the invoke handler.
- **Modify** [src/lib/tauri.ts](../../../src/lib/tauri.ts): add `copyStreamToProfile` / `moveStreamToProfile` wrappers.
- **Modify** [src/i18n/messages/uk.json](../../../src/i18n/messages/uk.json) + [en.json](../../../src/i18n/messages/en.json): 11 new keys; regenerate paraglide.
- **Modify** [src/components/streams/StreamContextMenu.tsx](../../../src/components/streams/StreamContextMenu.tsx): two new menu items + disabled logic + props.
- **Create** `src/components/streams/StreamContextMenu.test.tsx`: menu item tests.
- **Create** `src/components/streams/StreamTransferDialog.tsx` + `StreamTransferDialog.test.tsx`: the picker dialog.
- **Modify** [src/components/streams/StreamItem.tsx](../../../src/components/streams/StreamItem.tsx): thread the two new callbacks to the menu; update `StreamItem.test.tsx` helper.
- **Modify** [src/components/streams/StreamList.tsx](../../../src/components/streams/StreamList.tsx): transfer state machine, dialogs, optimistic move; add tests to `StreamList.test.tsx`.

---

## Task 1: `Profile::add_stream_checked` (URL dedup)

**Files:**
- Modify: `src-tauri/src/profile.rs` (add a method inside `impl Profile`, tests inside the existing `#[cfg(test)] mod tests`)

- [ ] **Step 1: Write the failing tests**

Add to the `mod tests` block in `src-tauri/src/profile.rs`:

```rust
    #[test]
    fn add_stream_checked_appends_when_url_is_new() {
        let mut p = Profile::create_default();
        let s = StreamInfo {
            id: "1".into(), url: "http://a".into(), name: "A".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        };
        assert!(p.add_stream_checked(s).is_ok());
        assert_eq!(p.streams.len(), 1);
    }

    #[test]
    fn add_stream_checked_rejects_duplicate_url() {
        let mut p = Profile::create_default();
        let mk = |id: &str| StreamInfo {
            id: id.into(), url: "http://dup".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        };
        p.add_stream_checked(mk("1")).unwrap();
        let err = p.add_stream_checked(mk("2")).unwrap_err();
        assert!(matches!(err, RadioError::Conflict(_)));
        assert_eq!(p.streams.len(), 1, "duplicate must not be appended");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml add_stream_checked`
Expected: FAIL — `no method named add_stream_checked found`.

- [ ] **Step 3: Implement the method**

Add inside `impl Profile { … }` in `src-tauri/src/profile.rs` (e.g. just after `pub fn save`):

```rust
    /// Append `stream` unless this profile already holds a stream with the same
    /// URL. On a duplicate, returns `Conflict(self.name)` so the caller can tell
    /// the user which profile already has it. Does not save.
    pub fn add_stream_checked(&mut self, stream: StreamInfo) -> Result<(), RadioError> {
        if self.streams.iter().any(|s| s.url == stream.url) {
            return Err(RadioError::Conflict(self.name.clone()));
        }
        self.streams.push(stream);
        Ok(())
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml add_stream_checked`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/profile.rs
git commit -m "feat(profile): add_stream_checked with URL dedup"
```

---

## Task 2: `TransferMode` + `prepare_transfer_stream` helper

**Files:**
- Modify: `src-tauri/src/commands/stream_commands.rs` (add enum + helper near the top, after the `use` lines; add a `#[cfg(test)] mod tests`)

- [ ] **Step 1: Write the failing tests**

At the bottom of `src-tauri/src/commands/stream_commands.rs`, add:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> StreamInfo {
        StreamInfo {
            id: "src-id".into(), url: "http://x".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec!["*ad*".into()],
            username: Some("u".into()), password: Some("DPAPI:abc".into()),
            added_at: "2026-01-01".into(),
        }
    }

    #[test]
    fn copy_assigns_fresh_id_and_added_at_but_keeps_password() {
        let src = sample();
        let out = prepare_transfer_stream(&src, &TransferMode::Copy, "NOW".into());
        assert_ne!(out.id, src.id, "copy must get a fresh id");
        assert_eq!(out.added_at, "NOW");
        assert_eq!(out.password.as_deref(), Some("DPAPI:abc"), "password preserved");
        assert_eq!(out.url, "http://x");
        assert_eq!(out.ignorelist, vec!["*ad*".to_string()]);
    }

    #[test]
    fn move_preserves_id_and_added_at() {
        let src = sample();
        let out = prepare_transfer_stream(&src, &TransferMode::Move, "NOW".into());
        assert_eq!(out.id, "src-id");
        assert_eq!(out.added_at, "2026-01-01");
        assert_eq!(out.password.as_deref(), Some("DPAPI:abc"));
    }

    #[test]
    fn move_blocked_only_for_active_states() {
        assert!(move_blocked_by_state(&StreamState::Recording));
        assert!(move_blocked_by_state(&StreamState::Connecting));
        assert!(move_blocked_by_state(&StreamState::Reconnecting));
        assert!(!move_blocked_by_state(&StreamState::Idle));
        // An Error-state entry can linger during retries; it must NOT block a move.
        assert!(!move_blocked_by_state(&StreamState::Error));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml stream_commands::tests`
Expected: FAIL — `cannot find type TransferMode` / functions not found.

- [ ] **Step 3: Implement the enum + helpers**

First extend the manager import at the top of `src-tauri/src/commands/stream_commands.rs` so `StreamState` is available — change:

```rust
use crate::stream::manager::StreamStatus;
```

to:

```rust
use crate::stream::manager::{StreamState, StreamStatus};
```

Then, after the existing `use` lines, add the enum and helpers:

```rust
/// Whether a stream transfer leaves the source in place (`Copy`) or removes it
/// from the active profile (`Move`). Deserialized from the JS string "copy"/"move".
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferMode {
    Copy,
    Move,
}

/// Build the `StreamInfo` to insert into the target profile. For `Copy` it gets a
/// fresh id + `added_at` so it is a distinct entry; for `Move` the id and
/// `added_at` are preserved. Passwords/usernames/ignorelist are always kept (a
/// local transfer keeps DPAPI ciphertext valid).
fn prepare_transfer_stream(source: &StreamInfo, mode: &TransferMode, now: String) -> StreamInfo {
    let mut out = source.clone();
    if *mode == TransferMode::Copy {
        out.id = nanoid::nanoid!();
        out.added_at = now;
    }
    out
}

/// A move is blocked only while the source stream is actively recording /
/// connecting / reconnecting. An `Error`-state manager entry can linger during
/// retries but must not block a move (matches the UI's disabled condition).
fn move_blocked_by_state(state: &StreamState) -> bool {
    matches!(
        state,
        StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting
    )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml stream_commands::tests`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/stream_commands.rs
git commit -m "feat(streams): TransferMode + prepare_transfer_stream helper"
```

---

## Task 3: `transfer_stream_to_profile` command + registration

**Files:**
- Modify: `src-tauri/src/commands/stream_commands.rs` (the command; extend the top `use` lines)
- Modify: `src-tauri/src/lib.rs:147` (add to invoke handler, next to `remove_stream`)

This command takes `tauri::State` and is verified by compilation + the helper tests from Tasks 1–2 (no separate unit test — matches the other untested commands in this file).

- [ ] **Step 1: Extend the imports**

At the top of `src-tauri/src/commands/stream_commands.rs` (the manager import was already widened to `{StreamState, StreamStatus}` in Task 2), add `RadioError` and `Profile`. Change:

```rust
use crate::app_state::AppState;
use crate::profile::StreamInfo;
use crate::stream::manager::{StreamState, StreamStatus};
use crate::stream::playlist;
```

to:

```rust
use crate::app_state::AppState;
use crate::errors::RadioError;
use crate::profile::{Profile, StreamInfo};
use crate::stream::manager::{StreamState, StreamStatus};
use crate::stream::playlist;
```

- [ ] **Step 2: Add the command**

Append to `src-tauri/src/commands/stream_commands.rs` (before the `#[cfg(test)] mod tests` block):

```rust
/// Copy or move a stream into another (non-active) profile.
/// - `Copy` leaves the source in the active profile; the inserted clone gets a
///   fresh id.
/// - `Move` removes the source from the active profile after the target saves.
/// Refuses to move a stream that is currently recording/connecting/reconnecting,
/// and refuses any transfer into the active profile or into a profile that
/// already holds a stream with the same URL (`Conflict`).
#[tauri::command]
pub async fn transfer_stream_to_profile(
    stream_id: String,
    target_profile: String,
    mode: TransferMode,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // 1. Guard: never transfer into the active profile.
    {
        let profile = state.active_profile.read().await;
        if profile.name == target_profile {
            return Err(RadioError::Forbidden(
                "Cannot transfer a stream into the active profile".into(),
            ).to_string());
        }
    }

    // 2. Find the source stream in the active profile.
    let source = {
        let profile = state.active_profile.read().await;
        profile.streams.iter().find(|s| s.id == stream_id).cloned().ok_or_else(|| {
            RadioError::NotFound(format!("Stream '{stream_id}' not found")).to_string()
        })?
    };

    // 3. Move-guard: refuse while the stream is active (matches the UI's disabled
    //    condition). An `Error`-state entry may linger during retries, so check
    //    the state rather than mere presence.
    if mode == TransferMode::Move {
        let manager = state.stream_manager.read().await;
        if let Some(status) = manager.get_status(&stream_id) {
            if move_blocked_by_state(&status.state) {
                return Err(RadioError::Forbidden(
                    "Cannot move a stream while it is active".into(),
                ).to_string());
            }
        }
    }

    // 4. Load the target profile off the async worker.
    let target_name = target_profile.clone();
    let mut target = tokio::task::spawn_blocking(move || Profile::load(&target_name))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    // 5. Build the entry and insert with URL dedup.
    let inserted = prepare_transfer_stream(&source, &mode, chrono::Local::now().to_rfc3339());
    target.add_stream_checked(inserted).map_err(|e| e.to_string())?;

    // 6. Save the target.
    tokio::task::spawn_blocking(move || target.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    // 7. Move only: remove from the active profile and persist (mirrors
    //    remove_stream; the stop is a harmless no-op for an idle stream).
    if mode == TransferMode::Move {
        {
            let mut manager = state.stream_manager.write().await;
            let _ = manager.stop_recording(&stream_id);
        }
        let snapshot = {
            let mut profile = state.active_profile.write().await;
            profile.streams.retain(|s| s.id != stream_id);
            profile.clone()
        };
        tokio::task::spawn_blocking(move || snapshot.save())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
```

- [ ] **Step 3: Register the command**

In `src-tauri/src/lib.rs`, in the `tauri::generate_handler![ … ]` list, add the line after `commands::stream_commands::remove_stream,` (around line 147):

```rust
            commands::stream_commands::transfer_stream_to_profile,
```

- [ ] **Step 4: Build + run the whole backend test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: compiles cleanly; all tests PASS (including Tasks 1–2).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/stream_commands.rs src-tauri/src/lib.rs
git commit -m "feat(streams): transfer_stream_to_profile command"
```

---

## Task 4: Frontend IPC wrappers

**Files:**
- Modify: `src/lib/tauri.ts` (add two functions at the end of the "Profile IPC wrappers" section, after `commitImport`)

- [ ] **Step 1: Add the wrappers**

Append to the Profile IPC wrappers section of `src/lib/tauri.ts`:

```ts
export async function copyStreamToProfile(streamId: string, targetProfile: string): Promise<void> {
  return invoke("transfer_stream_to_profile", { streamId, targetProfile, mode: "copy" });
}
export async function moveStreamToProfile(streamId: string, targetProfile: string): Promise<void> {
  return invoke("transfer_stream_to_profile", { streamId, targetProfile, mode: "move" });
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm vite:build`
Expected: build succeeds (this also regenerates paraglide; the wrappers type-check).

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat(streams): copyStreamToProfile / moveStreamToProfile IPC wrappers"
```

---

## Task 5: i18n keys

**Files:**
- Modify: `src/i18n/messages/uk.json` and `src/i18n/messages/en.json` (add 11 keys; keep both files in sync)

- [ ] **Step 1: Add Ukrainian keys**

Insert these into `src/i18n/messages/uk.json` (e.g. right after the `"remove_stream"` line at line 100):

```json
  "copy_to_profile": "Копіювати в профіль…",
  "move_to_profile": "Перемістити в профіль…",
  "move_disabled_reason": "Не можна перемістити активний потік",
  "copy_stream_to_profile_title": "Копіювати «{name}» у профіль",
  "move_stream_to_profile_title": "Перемістити «{name}» у профіль",
  "transfer_create_new_profile": "+ Новий профіль…",
  "transfer_no_other_profiles": "Інших профілів немає",
  "transfer_target_profiles": "Цільові профілі",
  "stream_copied_to_profile": "«{name}» скопійовано в «{profile}»",
  "stream_moved_to_profile": "«{name}» переміщено в «{profile}»",
  "stream_already_in_profile": "«{name}» вже є в профілі «{profile}»",
```

- [ ] **Step 2: Add the matching English keys**

Insert the parallel keys into `src/i18n/messages/en.json` (after its `"remove_stream"` line at line 100):

```json
  "copy_to_profile": "Copy to profile…",
  "move_to_profile": "Move to profile…",
  "move_disabled_reason": "Can't move a stream while it's active",
  "copy_stream_to_profile_title": "Copy “{name}” to a profile",
  "move_stream_to_profile_title": "Move “{name}” to a profile",
  "transfer_create_new_profile": "+ New profile…",
  "transfer_no_other_profiles": "No other profiles",
  "transfer_target_profiles": "Target profiles",
  "stream_copied_to_profile": "Copied “{name}” to “{profile}”",
  "stream_moved_to_profile": "Moved “{name}” to “{profile}”",
  "stream_already_in_profile": "“{name}” is already in “{profile}”",
```

- [ ] **Step 3: Regenerate paraglide messages**

Run: `pnpm vite:build`
Expected: build succeeds; `src/i18n/paraglide/messages` now exports `copy_to_profile`, `move_to_profile`, `copy_stream_to_profile_title`, etc. (The paraglide-vite plugin regenerates all messages from the JSON at build start.)

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "i18n(streams): keys for copy/move stream to profile"
```

---

## Task 6: StreamContextMenu — two new items

**Files:**
- Modify: `src/components/streams/StreamContextMenu.tsx`
- Create: `src/components/streams/StreamContextMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/streams/StreamContextMenu.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import { StreamContextMenu } from "./StreamContextMenu";
import { $playerStatus } from "../../stores/player";

vi.mock("../../i18n/paraglide/messages", () => ({
  stream_actions: ({ name }: { name: string }) => `Дії для ${name}`,
  stream_context_menu: () => "Контекстне меню потоку",
  play_stream: () => "Відтворити потік",
  stop_stream_playback: () => "Зупинити відтворення",
  start_recording: () => "Почати запис",
  stop_recording: () => "Зупинити запис",
  edit_stream: () => "Редагувати потік",
  add_to_wishlist: () => "Додати до бажаних",
  add_to_ignorelist: () => "Додати до ігнор-листа",
  remove_stream: () => "Видалити потік",
  copy_to_profile: () => "Копіювати в профіль…",
  move_to_profile: () => "Перемістити в профіль…",
  move_disabled_reason: () => "Не можна перемістити активний потік",
}));

const mkStream = (over: Partial<StreamInfo> = {}): StreamInfo => ({
  id: "s1", url: "http://x/s1", name: "Radio Paradise", format: "mp3", bitrate: 192,
  icyName: null, icyGenre: null, icyUrl: null, ignorelist: [], username: null,
  password: null, addedAt: "2026-01-01T00:00:00Z", ...over,
});

const mkStatus = (state: StreamStatus["state"]): StreamStatus => ({
  streamId: "s1", state, currentTrack: null, recordingStartedAt: null,
  bytesRecorded: 0, tracksRecorded: 0, error: null, reconnectAttempt: null,
});

function renderMenu(status?: StreamStatus) {
  const h = {
    onAddToWishlist: vi.fn(), onAddToIgnorelist: vi.fn(), onDelete: vi.fn(),
    onCopyToProfile: vi.fn(), onMoveToProfile: vi.fn(),
  };
  const utils = render(
    <StreamContextMenu stream={mkStream()} status={status} menuFocused {...h} />,
  );
  return { ...utils, ...h };
}

afterEach(() => {
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
});

describe("StreamContextMenu — copy/move to profile", () => {
  const open = (container: HTMLElement) =>
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);

  it("shows both items and calls handlers when clicked", async () => {
    const { container, onCopyToProfile, onMoveToProfile } = renderMenu(mkStatus("idle"));
    open(container);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Копіювати в профіль…" }));
    expect(onCopyToProfile).toHaveBeenCalled();
    open(container);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Перемістити в профіль…" }));
    expect(onMoveToProfile).toHaveBeenCalled();
  });

  it("disables Move while recording", async () => {
    const { container } = renderMenu(mkStatus("recording"));
    open(container);
    const move = await screen.findByRole("menuitem", { name: "Перемістити в профіль…" });
    expect(move.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables Move while this stream is playing", async () => {
    $playerStatus.set({
      state: "playing", source: { type: "stream", streamId: "s1" },
      volume: 0.75, positionMs: null, durationMs: null,
    });
    const { container } = renderMenu(mkStatus("idle"));
    open(container);
    const move = await screen.findByRole("menuitem", { name: "Перемістити в профіль…" });
    expect(move.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps Copy enabled while recording", async () => {
    const { container } = renderMenu(mkStatus("recording"));
    open(container);
    const copy = await screen.findByRole("menuitem", { name: "Копіювати в профіль…" });
    expect(copy.getAttribute("aria-disabled")).not.toBe("true");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/components/streams/StreamContextMenu.test.tsx`
Expected: FAIL — props `onCopyToProfile`/`onMoveToProfile` don't exist; menu items not found.

- [ ] **Step 3: Update the component**

In `src/components/streams/StreamContextMenu.tsx`:

(a) Add the lucide import at the top:

```tsx
import { Copy, FolderInput } from "lucide-react";
```

(b) Extend the `Props` interface with the two callbacks:

```tsx
  onAddToWishlist: (currentTrack: string) => void;
  onAddToIgnorelist: (currentTrack: string) => void;
  onCopyToProfile: () => void;
  onMoveToProfile: () => void;
  onDelete: () => void;
```

(c) Destructure them in the function signature:

```tsx
export function StreamContextMenu({ stream, status, menuFocused, onAddToWishlist, onAddToIgnorelist, onCopyToProfile, onMoveToProfile, onDelete }: Props) {
```

(d) Compute the move-disabled flag right after `isThisStreamPlaying` is defined:

```tsx
  const moveDisabled =
    state === "recording" || state === "connecting" || state === "reconnecting" || isThisStreamPlaying;
```

(e) Add two cases to `handleAction`'s `switch` (before `case "delete":`):

```tsx
        case "copy-to-profile":
          onCopyToProfile();
          break;
        case "move-to-profile":
          onMoveToProfile();
          break;
```

(f) Add the two `MenuItem`s immediately before the `<Separator …/>` that precedes delete:

```tsx
          <MenuItem
            id="copy-to-profile"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            <span aria-hidden="true" className="mr-2 inline-flex"><Copy size={14} /></span>{m.copy_to_profile()}
          </MenuItem>
          <MenuItem
            id="move-to-profile"
            isDisabled={moveDisabled}
            title={moveDisabled ? m.move_disabled_reason() : undefined}
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
          >
            <span aria-hidden="true" className="mr-2 inline-flex"><FolderInput size={14} /></span>{m.move_to_profile()}
          </MenuItem>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/components/streams/StreamContextMenu.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamContextMenu.tsx src/components/streams/StreamContextMenu.test.tsx
git commit -m "feat(streams): copy/move-to-profile context menu items"
```

---

## Task 7: StreamTransferDialog (the picker)

**Files:**
- Create: `src/components/streams/StreamTransferDialog.tsx`
- Create: `src/components/streams/StreamTransferDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/streams/StreamTransferDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import type { ProfileMeta } from "../../lib/tauri";
import { StreamTransferDialog } from "./StreamTransferDialog";

vi.mock("../../i18n/paraglide/messages", () => ({
  copy_stream_to_profile_title: ({ name }: { name: string }) => `Копіювати «${name}» у профіль`,
  move_stream_to_profile_title: ({ name }: { name: string }) => `Перемістити «${name}» у профіль`,
  transfer_create_new_profile: () => "+ Новий профіль…",
  transfer_no_other_profiles: () => "Інших профілів немає",
  transfer_target_profiles: () => "Цільові профілі",
  cancel: () => "Скасувати",
}));

const profiles: ProfileMeta[] = [
  { name: "Jazz", streamCount: 5, isActive: false },
  { name: "Rock", streamCount: 0, isActive: false },
];

function renderDialog(over: Partial<Parameters<typeof StreamTransferDialog>[0]> = {}) {
  const props = {
    mode: "copy" as const, streamName: "Radio Paradise", profiles,
    onSelect: vi.fn(), onCreateNew: vi.fn(), onCancel: vi.fn(), ...over,
  };
  return { ...render(<StreamTransferDialog {...props} />), props };
}

describe("StreamTransferDialog", () => {
  it("shows the copy title and lists the target profiles", () => {
    renderDialog();
    expect(screen.getByText("Копіювати «Radio Paradise» у профіль")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Jazz" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rock" })).toBeTruthy();
  });

  it("shows the move title in move mode", () => {
    renderDialog({ mode: "move" });
    expect(screen.getByText("Перемістити «Radio Paradise» у профіль")).toBeTruthy();
  });

  it("calls onSelect with the chosen profile name", () => {
    const { props } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Jazz" }));
    expect(props.onSelect).toHaveBeenCalledWith("Jazz");
  });

  it("calls onCreateNew when the create entry is clicked", () => {
    const { props } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "+ Новий профіль…" }));
    expect(props.onCreateNew).toHaveBeenCalled();
  });

  it("shows the empty hint and the create entry when there are no profiles", () => {
    renderDialog({ profiles: [] });
    expect(screen.getByText("Інших профілів немає")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Новий профіль…" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/components/streams/StreamTransferDialog.test.tsx`
Expected: FAIL — module `./StreamTransferDialog` not found.

- [ ] **Step 3: Implement the component**

Create `src/components/streams/StreamTransferDialog.tsx`:

```tsx
import { Modal, ModalOverlay, Dialog, Heading } from "react-aria-components";
import type { ProfileMeta } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  mode: "copy" | "move";
  streamName: string;
  /** Non-active profiles the stream can be sent to. */
  profiles: ProfileMeta[];
  onSelect: (profileName: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

export function StreamTransferDialog({ mode, streamName, profiles, onSelect, onCreateNew, onCancel }: Props) {
  const title =
    mode === "copy"
      ? m.copy_stream_to_profile_title({ name: streamName })
      : m.move_stream_to_profile_title({ name: streamName });

  const optionClass =
    "flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-slate-200 outline-none hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400";

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      isOpen
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none flex flex-col gap-4">
          <Heading slot="title" className="text-base font-semibold text-slate-100">{title}</Heading>

          {profiles.length === 0 ? (
            <p className="text-sm text-slate-400">{m.transfer_no_other_profiles()}</p>
          ) : (
            <ul aria-label={m.transfer_target_profiles()} className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {profiles.map((p, i) => (
                <li key={p.name}>
                  <button autoFocus={i === 0} onClick={() => onSelect(p.name)} className={optionClass}>
                    <span className="truncate">{p.name}</span>
                    <span
                      aria-hidden="true"
                      className="ml-2 inline-flex min-w-[1.5rem] justify-center rounded-full bg-slate-700/80 px-1.5 text-[10px] leading-5 text-slate-300 forced-colors:border forced-colors:border-[ButtonText]"
                    >
                      {p.streamCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            autoFocus={profiles.length === 0}
            onClick={onCreateNew}
            className="rounded px-3 py-2 text-left text-sm text-blue-300 outline-none hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            {m.transfer_create_new_profile()}
          </button>

          <div className="flex justify-end">
            <button
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:text-[ButtonText]"
            >
              {m.cancel()}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/components/streams/StreamTransferDialog.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamTransferDialog.tsx src/components/streams/StreamTransferDialog.test.tsx
git commit -m "feat(streams): StreamTransferDialog profile picker"
```

---

## Task 8: Wire transfer into StreamList + StreamItem

**Files:**
- Modify: `src/components/streams/StreamItem.tsx` (Props + pass callbacks to the menu)
- Modify: `src/components/streams/StreamItem.test.tsx` (helper passes the new no-op callbacks)
- Modify: `src/components/streams/StreamList.tsx` (transfer state machine + dialogs + handlers + optimistic move)
- Modify: `src/components/streams/StreamList.test.tsx` (mock additions + orchestration tests)

- [ ] **Step 1: Thread props through StreamItem**

In `src/components/streams/StreamItem.tsx`:

(a) Add to the `Props` interface (after `onDelete: () => void;`):

```tsx
  onDelete: () => void;
  onCopyToProfile: () => void;
  onMoveToProfile: () => void;
```

(b) Add them to the destructured parameters (after `onDelete,`):

```tsx
  onDelete,
  onCopyToProfile,
  onMoveToProfile,
  onActivate,
```

(c) Pass them to `<StreamContextMenu …>` (it currently passes `onDelete={onDelete}`):

```tsx
        <StreamContextMenu
          stream={stream}
          status={status}
          menuFocused={isFocused("action-menu")}
          onAddToWishlist={(track) => setPatternDialog({ listType: "wishlist", initialPattern: track })}
          onAddToIgnorelist={(track) => setPatternDialog({ listType: "ignorelist", initialPattern: track })}
          onCopyToProfile={onCopyToProfile}
          onMoveToProfile={onMoveToProfile}
          onDelete={onDelete}
        />
```

- [ ] **Step 2: Keep StreamItem.test compiling**

In `src/components/streams/StreamItem.test.tsx`, update `renderItem`'s `<StreamItem … />` to pass the two new callbacks:

```tsx
      <StreamItem
        stream={stream}
        status={status}
        isActiveRow
        isFocused={(seg) => seg === focusedSeg}
        maxRetries={maxRetries}
        onDelete={() => {}}
        onCopyToProfile={() => {}}
        onMoveToProfile={() => {}}
      />
```

Run: `pnpm test src/components/streams/StreamItem.test.tsx`
Expected: PASS (unchanged behavior, still compiles).

- [ ] **Step 3: Write the failing StreamList orchestration tests**

In `src/components/streams/StreamList.test.tsx`:

(a) Extend the `vi.mock("../../lib/tauri", …)` factory to add the new functions:

```tsx
vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  removeStream: vi.fn().mockResolvedValue(undefined),
  addToWishlist: vi.fn().mockResolvedValue(undefined),
  addToIgnorelist: vi.fn().mockResolvedValue(undefined),
  listProfiles: vi.fn().mockResolvedValue([
    { name: "Default", streamCount: 3, isActive: true },
    { name: "Jazz", streamCount: 0, isActive: false },
  ]),
  copyStreamToProfile: vi.fn().mockResolvedValue(undefined),
  moveStreamToProfile: vi.fn().mockResolvedValue(undefined),
  createProfile: vi.fn().mockResolvedValue({ name: "Fresh", streamCount: 0, isActive: false }),
}));
```

(b) Widen the testing-library import to add `waitFor` and `screen`, and add the messages import. The file currently imports `{ render, fireEvent, act }`; replace that line and add `m`:

```tsx
import { render, fireEvent, act, waitFor, screen } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
```

(c) Append this describe block at the end of the file:

```tsx
describe("StreamList — copy/move stream to profile", () => {
  const openMenu = (container: HTMLElement, id: string) =>
    fireEvent.click(
      container.querySelector<HTMLElement>(`li[data-item-id="${id}"] button[data-segment="action-menu"]`)!,
    );

  it("move: sends to the chosen profile and optimistically removes the row", async () => {
    const { container } = renderList();
    openMenu(container, "a");
    fireEvent.click(await screen.findByRole("menuitem", { name: m.move_to_profile() }));

    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.moveStreamToProfile).toHaveBeenCalledWith("a", "Jazz"));
    await waitFor(() => expect($streams.get().some((s) => s.id === "a")).toBe(false));
  });

  it("copy: sends to the chosen profile and keeps the row", async () => {
    const { container } = renderList();
    openMenu(container, "b");
    fireEvent.click(await screen.findByRole("menuitem", { name: m.copy_to_profile() }));

    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.copyStreamToProfile).toHaveBeenCalledWith("b", "Jazz"));
    expect($streams.get().some((s) => s.id === "b")).toBe(true);
  });

  it("create-new: creates a profile then transfers into it", async () => {
    const { container } = renderList();
    openMenu(container, "c");
    fireEvent.click(await screen.findByRole("menuitem", { name: m.copy_to_profile() }));

    fireEvent.click(await screen.findByRole("button", { name: m.transfer_create_new_profile() }));

    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Fresh" } });
    fireEvent.click(screen.getByRole("button", { name: m.ok() }));

    await waitFor(() => expect(tauri.createProfile).toHaveBeenCalledWith("Fresh"));
    await waitFor(() => expect(tauri.copyStreamToProfile).toHaveBeenCalledWith("c", "Fresh"));
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test src/components/streams/StreamList.test.tsx`
Expected: FAIL — `StreamItem` rejects unknown props / `tauri.moveStreamToProfile` never called (orchestration not wired).

- [ ] **Step 5: Wire the orchestration into StreamList**

In `src/components/streams/StreamList.tsx`:

(a) Extend imports:

```tsx
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
```

(b) Add the transfer state machine inside the component, after the `pendingDeleteId` state:

```tsx
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
```

(c) In `renderRow`, pass the two callbacks to `StreamItem`:

```tsx
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
```

(d) Add the dialogs to the returned JSX, right after the existing `pendingDeleteId` portal block (before the closing `</>`):

```tsx
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
```

- [ ] **Step 6: Run the StreamList tests to verify they pass**

Run: `pnpm test src/components/streams/StreamList.test.tsx`
Expected: PASS (existing tests + 3 new orchestration tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/streams/StreamItem.tsx src/components/streams/StreamItem.test.tsx src/components/streams/StreamList.tsx src/components/streams/StreamList.test.tsx
git commit -m "feat(streams): wire copy/move-to-profile in StreamList"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole frontend test suite**

Run: `pnpm test`
Expected: all suites PASS.

- [ ] **Step 2: Run the whole backend test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests PASS.

- [ ] **Step 3: Production build (also confirms paraglide + types)**

Run: `pnpm vite:build`
Expected: build succeeds with no type errors in the changed files.

- [ ] **Step 4: Final commit (only if anything was regenerated/changed)**

```bash
git add -A
git commit -m "chore(streams): finalize copy/move-to-profile feature"
```

---

## Notes for the implementer

- **Tauri arg mapping:** the JS wrapper sends `{ streamId, targetProfile, mode }`; Tauri maps camelCase JS keys to the snake_case Rust params (`stream_id`, `target_profile`, `mode`). `mode` is the string `"copy"`/`"move"`, deserialized into `TransferMode`.
- **Passwords are intentionally NOT stripped** on copy/move (unlike profile *export*). The transfer stays on the same machine/user, so DPAPI ciphertext remains decryptable.
- **`tsc` is not a gate** — it has ~51 pre-existing untyped-paraglide errors. The gates are `pnpm test`, `cargo test`, and `pnpm vite:build`.
- **Conflict detection** on the frontend keys off the `"Conflict:"` string prefix from `RadioError::Conflict`; the user-facing names come from the values the frontend already holds, not from parsing the error.
- **Focus after move:** no extra code is needed — `CompositeList` already moves focus when a row disappears from `$streams` (same as delete). On copy/cancel the dialog's react-aria focus restoration returns focus to the ⋯ trigger.
- **Untested command guards:** the spec's test list mentions "target == active rejected" and "stream-not-found errors". These are one-line guards inside `transfer_stream_to_profile`, which takes `tauri::State` and is not unit-testable in isolation (consistent with the other untested commands in `stream_commands.rs`). They are verified by compilation and manual QA. The non-trivial parts — URL dedup and the move-block-by-state nuance — ARE unit-tested via `Profile::add_stream_checked` (Task 1) and `move_blocked_by_state` (Task 2).
