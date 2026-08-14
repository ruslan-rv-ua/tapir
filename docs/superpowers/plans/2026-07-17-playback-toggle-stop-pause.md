# Contextual Playback Toggle (stop for streams, pause for files, resume last) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Ctrl+Shift+K` (rebound from `Ctrl+Shift+P`) a source-aware playback toggle — **stop** live streams, **pause/resume** files at position, and **resume the last source** from a cold/stopped state — by reviving the dormant `PlayerSession` persistence fields with a discriminator, and announcing every transition to NVDA.

**Architecture:** Backend-first (Tauri v2). A single Rust entry point `playback_control::toggle_playback(app)` — shared by the global hotkey and the tray Play/Pause item — reads `PlayerStatus.source` and branches by **source type first**, then state. The dormant `PlayerSession.{last_stream_id,last_file_position}` fields plus a new `last_active` discriminator are written on playback transitions (play-start, pause, stop, quit) and read by a cold-start resume path. Cold-start hints the webview can't derive from `player-status` (connecting / unavailable) are delivered via a new `player-announce` event; the webview localizes via Paraglide and announces through the existing `LiveAnnouncer`.

**Tech Stack:** Rust (Tauri v2, rodio/symphonia, serde, tokio), React 19 + nanostores + react-aria-components, Paraglide.js i18n (compile-time), Vitest, `cargo test`/`cargo clippy`.

## Global Constraints

- **Backend owns state.** All playback/session logic lives in Rust; React is a presentation layer over Tauri IPC. (AGENTS.md)
- **Accessibility-first / NVDA.** Every transition must announce status **+ name** via `aria-live` through `LiveAnnouncer`. The developer is blind. (AGENTS.md)
- **i18n uk-first via Paraglide.** All user-facing strings are message keys in `src/i18n/messages/{uk,en}.json`, compiled to `src/i18n/paraglide/messages`. **Backend never returns ready-made strings** — it emits discriminators, the webview localizes. Regenerate messages via the Vite plugin (a `pnpm vite:build` or `pnpm test` run compiles them); do not hand-edit `paraglide/`.
- **No migrations / no back-compat guarantees** for stored config (Phase 3F). New defaults apply to fresh installs only; stored values are never rewritten. (AGENTS.md, [settings.rs:326](../../../src-tauri/src/settings.rs#L326) precedent)
- **Verification gates (all must pass):** `cargo test` + `cargo clippy` green; `pnpm test` + `pnpm vite:build` green; manual NVDA gate on a real stream **and** a file, including cold-start resume. `tsc` has ~51 pre-existing paraglide errors — **not** a gate ([[typecheck-paraglide-gotchas]]).
- **Branch model:** never touch `main`. Work on a feature branch; integrate into `develop` at the end via the finishing-a-development-branch skill. ([[branch-model-main-stale]])
- **Commit per task.** DRY, YAGNI, TDD.

---

## File Structure

**New files:**
- `src-tauri/src/playback_control.rs` — the shared toggle entry point, cold-start resume, session-persistence helpers, the `player-announce` emitter, and the pure decision/snapshot functions (with unit tests). Mirrors the existing `recording_control.rs` split (AppState-aware orchestration that the hotkey/tray/commands call).
- `src/lib/playbackAnnounce.ts` — pure function `selectPlaybackAnnouncement(prev, next, nameOf)` returning a transition discriminator; unit-tested in Vitest. Keeps the tricky announce-selection out of `App.tsx` so it is testable without Paraglide.
- `src/lib/playbackAnnounce.test.ts` — Vitest coverage for the pure function.

**Modified files:**
- `src-tauri/src/profile.rs` — add `LastActive` enum + `PlayerSession.last_active` field.
- `src-tauri/src/settings.rs` — `default_hk_toggle_playback()` → `"Ctrl+Shift+K"` + tests.
- `src-tauri/src/shortcuts.rs` — `"toggle_playback"` arm delegates to `playback_control::toggle_playback`.
- `src-tauri/src/tray/handlers.rs` — `spawn_toggle_playback` delegates to the shared fn; `spawn_stop_playback` snapshots before stop.
- `src-tauri/src/app_state.rs` — `graceful_shutdown` captures the session snapshot before player teardown (merged into the existing volume save).
- `src-tauri/src/commands/player_commands.rs` — `play_stream`/`play_file` persist on start; `stop_playback` snapshots before stop.
- `src-tauri/src/commands/songs_commands.rs` — `play_saved_song` persists on start.
- `src-tauri/src/lib.rs` — register `mod playback_control;`.
- `src/lib/tauri.ts` — `PlaybackAnnounce` payload type.
- `src/App.tsx` — replace inline announce logic with `selectPlaybackAnnouncement` + kind→message map; add a `player-announce` handler.
- `src/components/player/PlayerPanel.tsx` — remove the now-redundant optimistic pause/resume announces (centralized in `App.tsx`).
- `src/components/player/PlayerPanel.test.tsx` — update expectations.
- `src/i18n/messages/{uk,en}.json` — new message keys.
- Docs: `README.md`, `docs/accessibility.md`, `docs/architecture.md`, `docs/data-models.md`, `docs/keyboard-shortcuts.md`.

**Out of scope (explicit non-goals):**
- The **in-app** PlayerPanel Play/Pause button keeps its current behavior (it still `pause`s a live stream if pressed). The spec scopes the stream=stop semantics to the **hotkey + tray** only; changing the visible toggle button (icon/zone-nav) is a separate concern.
- SMTC hardware media keys stay untouched — Play/Pause/Stop are distinct buttons there, already semantically correct (spec: "SMTC лишається окремим шляхом").
- Autostart auto-play and the per-profile `startup_playback_mode` superstructure belong to #10 [resume-last-playback](../../backlog/done/p1-resume-last-playback.md); this plan only lays the fields + the reusable resume function.

---

### Design note: NVDA announcement split (read before Task 7)

Transitions the webview **already observes** via `player-status` are announced webview-side by enriching the existing `handlePlayerStatus` (single source of truth):

| Transition (webview-derived) | Message |
|---|---|
| `paused` (file, playing→paused) | `playback_paused_named` → «Пауза — <трек>» |
| `resumed` (file, paused→playing) | `playback_resumed_named` → «Відновлено — <трек>» |
| `stopped` (stream/preview/file → stopped) | `playback_stopped_named` (uses **prev** source) → «Зупинено — <назва>» |
| `started` (stopped→playing / source switch) | `playback_started` → «Відтворення: <трек>» (covers cold-start **file** resume + normal starts + stream reconnect) |

Transitions the webview **cannot derive** (no status change, or needed before the ≤15 s blocking `play_live`) are delivered by a new Rust `player-announce` event:

| Cold-start signal (Rust-emitted) | Message |
|---|---|
| `connecting` (before `play_stream`) | `playback_connecting` → «Підключення — <станція>» |
| `unavailable` (stale target, after clearing) | `playback_unavailable` → «Останнє відтворення недоступне» |
| `error` (transient play failure, record kept) | `playback_error` → «Помилка відтворення» |

The optimistic pause/resume announces are **removed** from `PlayerPanel.handlePlayPause` so a UI-button press and a hotkey press produce exactly one announce each, via the same `player-status` path. (Today a **global-hotkey** pause/resume is silent — this fixes that gap.)

Note the accepted double for cold-start streams: «Підключення — X» (immediate) followed by «Відтворення: X» after the connection succeeds. This mirrors real connecting→connected flows and is informative, not a bug.

---

### Task 1: `LastActive` discriminator + `PlayerSession.last_active` field

**Files:**
- Modify: `src-tauri/src/profile.rs` (PlayerSession block, [profile.rs:229-259](../../../src-tauri/src/profile.rs#L229-L259))
- Test: `src-tauri/src/profile.rs` (`#[cfg(test)] mod tests`)

**Interfaces:**
- Produces: `pub enum LastActive { Stream, File }` (serde `lowercase`), and `PlayerSession.last_active: Option<LastActive>` (`#[serde(default)]`). Consumed by Tasks 3–6.

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `src-tauri/src/profile.rs`:

```rust
    #[test]
    fn last_active_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&LastActive::Stream).unwrap(), "\"stream\"");
        assert_eq!(serde_json::to_string(&LastActive::File).unwrap(), "\"file\"");
    }

    #[test]
    fn player_session_defaults_last_active_none() {
        let s = PlayerSession::default();
        assert!(s.last_active.is_none());
    }

    #[test]
    fn player_session_without_last_active_still_loads() {
        // A profile written before this field existed must still deserialize.
        let json = r#"{"volume":0.5,"lastStreamId":"abc"}"#;
        let s: PlayerSession = serde_json::from_str(json).unwrap();
        assert!(s.last_active.is_none());
        assert_eq!(s.last_stream_id.as_deref(), Some("abc"));
    }

    #[test]
    fn player_session_round_trips_last_active() {
        let mut s = PlayerSession::default();
        s.last_active = Some(LastActive::File);
        let back: PlayerSession = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back.last_active, Some(LastActive::File));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test --lib profile::tests::last_active_serializes_lowercase`
Expected: FAIL — `LastActive` not found / `last_active` no field.

- [ ] **Step 3: Add the enum + field**

In `src-tauri/src/profile.rs`, immediately above the `PlayerSession` struct ([profile.rs:237](../../../src-tauri/src/profile.rs#L237)):

```rust
/// Which source was last active — the single discriminator cold-start uses to
/// decide what `Ctrl+Shift+K` resumes. Set on every play-start; the resolve step
/// tolerates a dangling value (discriminator set but its data field `None`) by
/// treating it as "nothing saved". Two slots only, so no timestamp/ordering.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LastActive {
    Stream,
    File,
}
```

Then add the field to `PlayerSession` (after `last_file_position`):

```rust
    #[serde(default)]
    pub last_file_position: Option<FilePosition>,
    #[serde(default)]
    pub last_active: Option<LastActive>,
```

And in `impl Default for PlayerSession`:

```rust
    fn default() -> Self {
        Self {
            volume: 0.75,
            last_stream_id: None,
            last_file_position: None,
            last_active: None,
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib profile::tests`
Expected: PASS (all profile tests, including the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/profile.rs
git commit -m "feat(profile): add LastActive discriminator to PlayerSession"
```

---

### Task 2: Rebind default `togglePlayback` hotkey to `Ctrl+Shift+K`

**Files:**
- Modify: `src-tauri/src/settings.rs:138` (`default_hk_toggle_playback`)
- Test: `src-tauri/src/settings.rs` (`#[cfg(test)] mod tests`)

**Interfaces:**
- Produces: `default_hk_toggle_playback() == "Ctrl+Shift+K"`. No signature change.

- [ ] **Step 1: Write the failing test**

Add to `tests` in `src-tauri/src/settings.rs`:

```rust
    #[test]
    fn default_toggle_playback_is_ctrl_shift_k() {
        assert_eq!(HotkeyMap::default().toggle_playback, "Ctrl+Shift+K");
    }

    #[test]
    fn stored_toggle_playback_combo_is_not_migrated() {
        // The old default (Ctrl+Shift+P) collided with Firefox private-window /
        // VS Code command palette. The new default is for fresh installs only;
        // a stored combo — old default or customization — must survive verbatim.
        let json = r#"{ "hotkeys": { "togglePlayback": "Ctrl+Shift+P" } }"#;
        let settings: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.hotkeys.toggle_playback, "Ctrl+Shift+P");
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test --lib settings::tests::default_toggle_playback_is_ctrl_shift_k`
Expected: FAIL — left `"Ctrl+Shift+P"`, right `"Ctrl+Shift+K"`.

- [ ] **Step 3: Change the default**

In `src-tauri/src/settings.rs:138`:

```rust
fn default_hk_toggle_playback() -> String { "Ctrl+Shift+K".to_string() }
```

Update the doc-comment on the function group if present. Note: the existing test `hotkeys_object_without_stop_all_still_loads` (and `..._without_track_fields_...`) hard-code `"togglePlayback": "Ctrl+Shift+P"` **in stored JSON** and assert other fields — they must keep passing unchanged (stored values are not migrated), so do **not** edit them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib settings::tests`
Expected: PASS (all settings tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat(settings): default togglePlayback hotkey Ctrl+Shift+P -> Ctrl+Shift+K"
```

---

### Task 3: Pure decision + snapshot functions (`playback_control.rs`)

**Files:**
- Create: `src-tauri/src/playback_control.rs`
- Modify: `src-tauri/src/lib.rs:11` area (add `mod playback_control;`)
- Test: inline `#[cfg(test)] mod tests` in the new file

**Interfaces:**
- Produces (consumed by Task 4/5):
  - `pub(crate) enum ToggleAction { StopStream, StopPreview, PauseFile, ResumeFile, ResumeLast, Noop }`
  - `pub(crate) fn decide_toggle(source: Option<&PlaybackSource>, state: PlaybackState) -> ToggleAction`
  - `pub(crate) enum ColdStart { PlayStream, PlayFile, Unavailable, Silent }`
  - `pub(crate) fn decide_cold_start(last_active: Option<&LastActive>, has_stream_id: bool, stream_in_profile: bool, has_file: bool, file_exists: bool) -> ColdStart`
  - `pub(crate) fn apply_session_snapshot(session: &mut PlayerSession, status: &PlayerStatus)`

- [ ] **Step 1: Register the module**

In `src-tauri/src/lib.rs`, add alongside the other `mod` lines (keep alphabetical-ish near line 8):

```rust
mod playback_control;
```

- [ ] **Step 2: Write the file with pure fns + failing tests**

Create `src-tauri/src/playback_control.rs`:

```rust
//! The single source-aware playback-toggle entry point (Ctrl+Shift+K and the
//! tray Play/Pause item), plus cold-start resume and the persistence that
//! revives the dormant `PlayerSession` resume fields.
//!
//! Pure decision logic lives in `decide_toggle` / `decide_cold_start` and is
//! unit-tested here; the async orchestration (Task 4) is thin glue over them.

use crate::player::engine::{PlaybackSource, PlaybackState, PlayerStatus};
use crate::profile::{FilePosition, LastActive, PlayerSession};

/// What `toggle_playback` should do for a given live status. Branch by source
/// **type first** (impl-decision #4): a `Stream` is stopped whether Playing or
/// Paused — resuming a live buffer is meaningless (you'd replay a stale buffer
/// and lag the broadcast). A legacy `Paused + Stream` (only an old build could
/// create it; an in-memory session never survives restart) thus resolves to
/// stop, correctly.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ToggleAction {
    StopStream,
    StopPreview,
    PauseFile,
    ResumeFile,
    ResumeLast,
    Noop,
}

pub(crate) fn decide_toggle(source: Option<&PlaybackSource>, state: PlaybackState) -> ToggleAction {
    match source {
        Some(PlaybackSource::Stream { .. }) => ToggleAction::StopStream,
        Some(PlaybackSource::Preview { .. }) => ToggleAction::StopPreview,
        Some(PlaybackSource::File { .. }) => match state {
            PlaybackState::Playing => ToggleAction::PauseFile,
            PlaybackState::Paused => ToggleAction::ResumeFile,
            // A source implies a live session; Stopped-with-source cannot occur.
            PlaybackState::Stopped => ToggleAction::Noop,
        },
        None => ToggleAction::ResumeLast,
    }
}

/// What cold-start `Ctrl+Shift+K` resumes. `Silent` clears the record without an
/// announce (nothing saved, or a dangling discriminator — impl-decision #1);
/// `Unavailable` announces then clears (stale target: stream deleted / file moved).
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ColdStart {
    PlayStream,
    PlayFile,
    Unavailable,
    Silent,
}

pub(crate) fn decide_cold_start(
    last_active: Option<&LastActive>,
    has_stream_id: bool,
    stream_in_profile: bool,
    has_file: bool,
    file_exists: bool,
) -> ColdStart {
    match last_active {
        None => ColdStart::Silent,
        Some(LastActive::Stream) => {
            if !has_stream_id {
                ColdStart::Silent // dangling discriminator
            } else if stream_in_profile {
                ColdStart::PlayStream
            } else {
                ColdStart::Unavailable // stream deleted from profile
            }
        }
        Some(LastActive::File) => {
            if !has_file {
                ColdStart::Silent // dangling discriminator
            } else if file_exists {
                ColdStart::PlayFile
            } else {
                ColdStart::Unavailable // file moved / deleted
            }
        }
    }
}

/// Update the dormant resume fields from a live status. Stream/File set the
/// discriminator (+ id / path+position); Preview and None are transient and
/// leave the session untouched. Shared by the runtime persistence helper and
/// `graceful_shutdown`.
pub(crate) fn apply_session_snapshot(session: &mut PlayerSession, status: &PlayerStatus) {
    match &status.source {
        Some(PlaybackSource::Stream { stream_id }) => {
            session.last_active = Some(LastActive::Stream);
            session.last_stream_id = Some(stream_id.clone());
        }
        Some(PlaybackSource::File { path }) => {
            session.last_active = Some(LastActive::File);
            session.last_file_position = Some(FilePosition {
                path: path.clone(),
                position_ms: status.position_ms.unwrap_or(0),
            });
        }
        _ => {} // Preview / None: do not persist
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stream() -> PlaybackSource { PlaybackSource::Stream { stream_id: "s1".into() } }
    fn file() -> PlaybackSource { PlaybackSource::File { path: "rec/a.mp3".into() } }
    fn preview() -> PlaybackSource {
        PlaybackSource::Preview { url: "http://x".into(), name: "X".into() }
    }
    fn status(source: Option<PlaybackSource>, position_ms: Option<u64>) -> PlayerStatus {
        PlayerStatus {
            state: PlaybackState::Playing,
            source,
            volume: 0.5,
            position_ms,
            duration_ms: None,
        }
    }

    #[test]
    fn stream_stops_whether_playing_or_paused() {
        assert_eq!(decide_toggle(Some(&stream()), PlaybackState::Playing), ToggleAction::StopStream);
        assert_eq!(decide_toggle(Some(&stream()), PlaybackState::Paused), ToggleAction::StopStream);
    }

    #[test]
    fn preview_stops() {
        assert_eq!(decide_toggle(Some(&preview()), PlaybackState::Playing), ToggleAction::StopPreview);
    }

    #[test]
    fn file_pauses_and_resumes() {
        assert_eq!(decide_toggle(Some(&file()), PlaybackState::Playing), ToggleAction::PauseFile);
        assert_eq!(decide_toggle(Some(&file()), PlaybackState::Paused), ToggleAction::ResumeFile);
    }

    #[test]
    fn no_source_resumes_last() {
        assert_eq!(decide_toggle(None, PlaybackState::Stopped), ToggleAction::ResumeLast);
    }

    #[test]
    fn cold_start_nothing_saved_is_silent() {
        assert_eq!(decide_cold_start(None, false, false, false, false), ColdStart::Silent);
    }

    #[test]
    fn cold_start_stream_valid_plays() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::Stream), true, true, false, false),
            ColdStart::PlayStream
        );
    }

    #[test]
    fn cold_start_stream_deleted_is_unavailable() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::Stream), true, false, false, false),
            ColdStart::Unavailable
        );
    }

    #[test]
    fn cold_start_stream_dangling_is_silent() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::Stream), false, false, false, false),
            ColdStart::Silent
        );
    }

    #[test]
    fn cold_start_file_valid_plays() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::File), false, false, true, true),
            ColdStart::PlayFile
        );
    }

    #[test]
    fn cold_start_file_moved_is_unavailable() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::File), false, false, true, false),
            ColdStart::Unavailable
        );
    }

    #[test]
    fn cold_start_file_dangling_is_silent() {
        assert_eq!(
            decide_cold_start(Some(&LastActive::File), false, false, false, false),
            ColdStart::Silent
        );
    }

    #[test]
    fn snapshot_records_stream_id() {
        let mut s = PlayerSession::default();
        apply_session_snapshot(&mut s, &status(Some(stream()), None));
        assert_eq!(s.last_active, Some(LastActive::Stream));
        assert_eq!(s.last_stream_id.as_deref(), Some("s1"));
    }

    #[test]
    fn snapshot_records_file_position() {
        let mut s = PlayerSession::default();
        apply_session_snapshot(&mut s, &status(Some(file()), Some(4200)));
        assert_eq!(s.last_active, Some(LastActive::File));
        let fp = s.last_file_position.unwrap();
        assert_eq!(fp.path, "rec/a.mp3");
        assert_eq!(fp.position_ms, 4200);
    }

    #[test]
    fn snapshot_ignores_preview_and_none() {
        let mut s = PlayerSession::default();
        apply_session_snapshot(&mut s, &status(Some(preview()), None));
        apply_session_snapshot(&mut s, &status(None, None));
        assert_eq!(s.last_active, None);
        assert!(s.last_stream_id.is_none());
        assert!(s.last_file_position.is_none());
    }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib playback_control::tests`
Expected: PASS (14 tests). If the crate does not compile because `toggle_playback` etc. are referenced elsewhere, ignore — nothing references this module yet.

- [ ] **Step 4: Clippy the new module**

Run: `cd src-tauri && cargo clippy --lib 2>&1 | rg playback_control`
Expected: no warnings for `playback_control`. (Unused-fn warnings are acceptable here only if they appear; Task 4 wires everything. If clippy denies dead_code via `-D warnings` in CI config, add a temporary `#[allow(dead_code)]` on the module and remove it in Task 4 — check `src-tauri` lint config first with `rg "deny" src-tauri/src/lib.rs Cargo.toml`.)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/playback_control.rs src-tauri/src/lib.rs
git commit -m "feat(playback): pure toggle/cold-start decision fns + session snapshot"
```

---

### Task 4: Async orchestration — toggle, resume, persist, announce

**Files:**
- Modify: `src-tauri/src/playback_control.rs` (append the async layer above the `#[cfg(test)]` module)

**Interfaces:**
- Consumes: `decide_toggle`, `decide_cold_start`, `apply_session_snapshot` (Task 3); `AppState`, `PlayerEngine` methods `get_status/stop_playback/pause_playback/resume_playback/play_stream/play_file/seek_playback`; `crate::shortcuts::{recently_fired, LAST_TOGGLE_PLAYBACK_MS}`.
- Produces (consumed by Tasks 5–6):
  - `pub async fn toggle_playback(app: &AppHandle)`
  - `pub async fn persist_session_snapshot(app: &AppHandle)`
  - Event `"player-announce"` with payload `{ kind: "connecting"|"unavailable"|"error", name: Option<String> }` (camelCase).

- [ ] **Step 1: Add imports + the announce payload**

At the top of `src-tauri/src/playback_control.rs`, extend the imports:

```rust
use crate::app_state::AppState;
use crate::player::engine::{PlaybackSource, PlaybackState, PlayerStatus};
use crate::profile::{FilePosition, LastActive, PlayerSession};
use tauri::{AppHandle, Emitter, Manager};

/// Cold-start hints the webview can't derive from `player-status`. The webview
/// localizes `kind` via Paraglide (backend never sends ready-made strings).
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackAnnounce {
    kind: String,
    name: Option<String>,
}

fn emit_announce(app: &AppHandle, kind: &str, name: Option<String>) {
    let payload = PlaybackAnnounce { kind: kind.to_string(), name };
    if let Err(e) = app.emit("player-announce", payload) {
        log::warn!("playback: failed to emit player-announce: {e}");
    }
}
```

- [ ] **Step 2: Add the persistence helpers**

Append (above `#[cfg(test)]`). The save follows the exact clone-then-blocking-save pattern of the `set_volume` command ([player_commands.rs:80-88](../../../src-tauri/src/commands/player_commands.rs#L80-L88)):

```rust
/// Snapshot the current live status into the active profile's `player_session`
/// and save. No-op for Preview/None (transient). Called on play-start and before
/// a file pause/stop, so the dormant resume fields stay current. Position writes
/// happen only on these transitions — never per progress-tick.
pub async fn persist_session_snapshot(app: &AppHandle) {
    let state = app.state::<AppState>();
    let status = state.player.get_status().await;
    if !matches!(
        status.source,
        Some(PlaybackSource::Stream { .. }) | Some(PlaybackSource::File { .. })
    ) {
        return;
    }
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        apply_session_snapshot(&mut profile.player_session, &status);
        profile.clone()
    };
    match tokio::task::spawn_blocking(move || snapshot.save()).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => log::warn!("playback: failed to save session snapshot: {e}"),
        Err(e) => log::warn!("playback: session snapshot save task panicked: {e}"),
    }
}

/// Clear the resume record (stale/dangling target). Save follows the same
/// clone-then-blocking-save pattern.
async fn clear_last_session(app: &AppHandle) {
    let state = app.state::<AppState>();
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        profile.player_session.last_active = None;
        profile.player_session.last_stream_id = None;
        profile.player_session.last_file_position = None;
        profile.clone()
    };
    match tokio::task::spawn_blocking(move || snapshot.save()).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => log::warn!("playback: failed to clear session record: {e}"),
        Err(e) => log::warn!("playback: clear session task panicked: {e}"),
    }
}
```

(Delete the first `persist_session_snapshot` draft with the placeholder; keep only the clean version above.)

- [ ] **Step 3: Add `toggle_playback` + `resume_last`**

Append:

```rust
/// The single Ctrl+Shift+K / tray Play-Pause entry point. Debounced through the
/// cell shared with the hotkey and SMTC (a hotkey + media key near-simultaneous
/// must yield one action).
pub async fn toggle_playback(app: &AppHandle) {
    if crate::shortcuts::recently_fired(&crate::shortcuts::LAST_TOGGLE_PLAYBACK_MS) {
        log::debug!("playback: toggle_playback ignored (debounce)");
        return;
    }
    let state = app.state::<AppState>();
    let status = state.player.get_status().await;
    match decide_toggle(status.source.as_ref(), status.state.clone()) {
        ToggleAction::StopStream => {
            // Discriminator already set at play-start; stream has no position.
            let _ = state.player.stop_playback(app).await;
        }
        ToggleAction::StopPreview => {
            // Preview is transient — never persisted.
            let _ = state.player.stop_playback(app).await;
        }
        ToggleAction::PauseFile => {
            persist_session_snapshot(app).await; // capture position before pause
            let _ = state.player.pause_playback(app).await;
        }
        ToggleAction::ResumeFile => {
            let _ = state.player.resume_playback(app).await;
        }
        ToggleAction::ResumeLast => resume_last(app).await,
        ToggleAction::Noop => log::info!("playback: toggle — nothing to do"),
    }
}

/// Cold-start: resume the newest saved source (impl "найновіше джерело" —
/// `last_active` is the single marker). Stale target → announce + clear;
/// dangling/empty → silent + clear.
async fn resume_last(app: &AppHandle) {
    let state = app.state::<AppState>();

    // Read everything needed under one short read-lock.
    let (last_active, last_stream_id, last_file, stream) = {
        let profile = state.active_profile.read().await;
        let ps = &profile.player_session;
        let stream = ps.last_stream_id.as_ref().and_then(|id| {
            profile.streams.iter().find(|s| &s.id == id)
                .map(|s| (s.id.clone(), s.url.clone(), s.name.clone()))
        });
        (ps.last_active.clone(), ps.last_stream_id.clone(), ps.last_file_position.clone(), stream)
    };

    let has_stream_id = last_stream_id.is_some();
    let stream_in_profile = stream.is_some();
    let has_file = last_file.is_some();
    let file_exists = last_file.as_ref().map(|f| std::path::Path::new(&f.path).exists()).unwrap_or(false);

    match decide_cold_start(last_active.as_ref(), has_stream_id, stream_in_profile, has_file, file_exists) {
        ColdStart::PlayStream => {
            let (id, url, name) = stream.expect("PlayStream implies Some(stream)");
            emit_announce(app, "connecting", Some(name)); // before the ≤15 s blocking connect
            match state.player.play_stream(id, url, app).await {
                Ok(()) => persist_session_snapshot(app).await,
                Err(e) => {
                    log::warn!("playback: cold-start stream failed: {e}");
                    emit_announce(app, "error", None); // transient — keep the record
                }
            }
        }
        ColdStart::PlayFile => {
            let fp = last_file.expect("PlayFile implies Some(file)");
            match state.player.play_file(fp.path.clone(), app).await {
                Ok(()) => {
                    if let Err(e) = state.player.seek_playback(fp.position_ms, app).await {
                        // Best-effort: stay at the start rather than fail the resume.
                        log::warn!("playback: cold-start seek failed, staying at start: {e}");
                    }
                    persist_session_snapshot(app).await;
                    // `playback_started` (stopped→playing, file) announces webview-side.
                }
                Err(e) => {
                    log::warn!("playback: cold-start file failed: {e}");
                    emit_announce(app, "error", None); // keep the record
                }
            }
        }
        ColdStart::Unavailable => {
            emit_announce(app, "unavailable", None);
            clear_last_session(app).await;
        }
        ColdStart::Silent => {
            // Nothing saved or dangling discriminator — clear silently.
            clear_last_session(app).await;
        }
    }
}
```

Note: `status.state.clone()` requires `PlaybackState: Clone` — it already derives `Clone` ([engine.rs:16](../../../src-tauri/src/player/engine.rs#L16)).

- [ ] **Step 4: Build + clippy**

Run: `cd src-tauri && cargo build --lib && cargo clippy --lib`
Expected: compiles; no new warnings. Remove any temporary `#[allow(dead_code)]` from Task 3 (`toggle_playback`/`persist_session_snapshot` are now `pub` but still unreferenced until Task 5 — if `dead_code` fires, leave the `pub` fns; they are wired next task. If CI denies warnings, keep a module-level `#![allow(dead_code)]` note and remove it after Task 5's build.)

- [ ] **Step 5: Run the pure tests still pass**

Run: `cd src-tauri && cargo test --lib playback_control`
Expected: PASS (Task 3 tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/playback_control.rs
git commit -m "feat(playback): toggle_playback + cold-start resume + persistence helpers"
```

---

### Task 5: Wire the dispatch (hotkey + tray)

**Files:**
- Modify: `src-tauri/src/shortcuts.rs:146-157` (`"toggle_playback"` arm)
- Modify: `src-tauri/src/tray/handlers.rs:33-52` (`spawn_toggle_playback`, `spawn_stop_playback`)

**Interfaces:**
- Consumes: `playback_control::{toggle_playback, persist_session_snapshot}` (Task 4).

- [ ] **Step 1: Replace the hotkey arm**

In `src-tauri/src/shortcuts.rs`, replace the `"toggle_playback"` arm ([shortcuts.rs:146-157](../../../src-tauri/src/shortcuts.rs#L146-L157)) with:

```rust
            "toggle_playback" => {
                // Debounce + full source-aware dispatch live in playback_control;
                // shared verbatim with the tray Play/Pause item.
                crate::playback_control::toggle_playback(&app).await;
            }
```

The `PlaybackState` import at the top of `shortcuts.rs` ([shortcuts.rs:2](../../../src-tauri/src/shortcuts.rs#L2)) is now unused — remove `use crate::player::engine::PlaybackState;`. (`AppState` is still used by other arms; keep it.)

- [ ] **Step 2: Update the existing hotkey debounce test**

The test `toggle_playback_debounce_cell_swallows_repeat` ([shortcuts.rs:208-213](../../../src-tauri/src/shortcuts.rs#L208-L213)) tests `recently_fired(&LAST_TOGGLE_PLAYBACK_MS)` directly — it does **not** reference the arm, so it still passes unchanged. Leave it.

- [ ] **Step 3: Rewire the tray handlers**

In `src-tauri/src/tray/handlers.rs`, replace `spawn_toggle_playback` and `spawn_stop_playback`:

```rust
fn spawn_toggle_playback(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Same entry point as Ctrl+Shift+K: stream=stop, file=pause/resume,
        // cold=resume-last, shared debounce.
        crate::playback_control::toggle_playback(&app).await;
    });
}

fn spawn_stop_playback(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Explicit "Зупинити": capture the file position first so a later K
        // resumes where it left off, then stop.
        crate::playback_control::persist_session_snapshot(&app).await;
        let state = app.state::<crate::app_state::AppState>();
        let _ = state.player.stop_playback(&app).await;
    });
}
```

The `PlaybackState` import in `handlers.rs` (via the fully-qualified `crate::player::engine::PlaybackState` inside the old match) is removed by this change — verify no other reference remains (`rg PlaybackState src-tauri/src/tray/handlers.rs`).

- [ ] **Step 4: Build + clippy + full test**

Run: `cd src-tauri && cargo build --lib && cargo clippy --lib && cargo test --lib`
Expected: compiles, no warnings, all tests PASS. Any Task 3/4 `dead_code` allowance can now be removed (both fns are referenced).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/shortcuts.rs src-tauri/src/tray/handlers.rs
git commit -m "feat(playback): route hotkey + tray toggle through shared playback_control"
```

---

### Task 6: Persistence call sites (play-start, stop, quit)

**Files:**
- Modify: `src-tauri/src/commands/player_commands.rs` (`play_stream`, `play_file`, `stop_playback`)
- Modify: `src-tauri/src/commands/songs_commands.rs` (`play_saved_song`)
- Modify: `src-tauri/src/app_state.rs` (`graceful_shutdown`)

**Interfaces:**
- Consumes: `playback_control::{persist_session_snapshot, apply_session_snapshot}`.

- [ ] **Step 1: Persist on play-start in the player commands**

In `src-tauri/src/commands/player_commands.rs`, update `play_stream` and `play_file` to record the discriminator after a successful start. `play_stream` ([player_commands.rs:6-19](../../../src-tauri/src/commands/player_commands.rs#L6-L19)):

```rust
#[tauri::command]
pub async fn play_stream(
    stream_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let url = {
        let profile = state.active_profile.read().await;
        profile.streams.iter()
            .find(|s| s.id == stream_id)
            .map(|s| s.url.clone())
            .ok_or_else(|| format!("stream not found: {stream_id}"))?
    };
    state.player.play_stream(stream_id, url, &app).await.map_err(|e| e.to_string())?;
    crate::playback_control::persist_session_snapshot(&app).await;
    Ok(())
}
```

`play_file` ([player_commands.rs:31-38](../../../src-tauri/src/commands/player_commands.rs#L31-L38)):

```rust
#[tauri::command]
pub async fn play_file(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.play_file(path, &app).await.map_err(|e| e.to_string())?;
    crate::playback_control::persist_session_snapshot(&app).await;
    Ok(())
}
```

Leave `preview_station` untouched (transient — must never persist).

- [ ] **Step 2: Persist before stop in `stop_playback`**

`stop_playback` ([player_commands.rs:56-62](../../../src-tauri/src/commands/player_commands.rs#L56-L62)):

```rust
#[tauri::command]
pub async fn stop_playback(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Capture the file position before teardown so a later Ctrl+Shift+K resumes
    // where it left off (no-op for streams/preview).
    crate::playback_control::persist_session_snapshot(&app).await;
    state.player.stop_playback(&app).await.map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Persist on play-start in `play_saved_song`**

`play_saved_song` ([songs_commands.rs:31-38](../../../src-tauri/src/commands/songs_commands.rs#L31-L38)):

```rust
#[tauri::command]
pub async fn play_saved_song(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.play_file(path, &app).await.map_err(|e| e.to_string())?;
    crate::playback_control::persist_session_snapshot(&app).await;
    Ok(())
}
```

- [ ] **Step 4: Extend `graceful_shutdown`**

In `src-tauri/src/app_state.rs`, `graceful_shutdown` ([app_state.rs:48-86](../../../src-tauri/src/app_state.rs#L48-L86)). Capture the player status **before** `stop_session_public` (teardown loses the source/position), then merge the session snapshot into the existing volume save (impl-decision #3 — no third save). Replace the tail of the function (from the `state.player.stop_session_public().await;` line onward):

```rust
    // Capture the resume snapshot BEFORE tearing the player down — stop loses
    // the source and position. Merge it with the volume into a single save
    // (impl-decision #3: avoid a third profile write / racing saves).
    let player_status = state.player.get_status().await;

    state.player.stop_session_public().await;
    let volume = state.player.current_volume().await;
    let mut profile = state.active_profile.write().await;
    profile.player_session.volume = volume;
    crate::playback_control::apply_session_snapshot(&mut profile.player_session, &player_status);
    if let Err(e) = profile.save() {
        log::error!("Failed to save profile session on shutdown: {e}");
    }
    drop(profile);

    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
```

This requires `apply_session_snapshot` to be reachable as `pub(crate)` from `app_state` — it already is (Task 3). Note the `get_status()` call is added; the earlier `active_recording_urls` save block ([app_state.rs:69-74](../../../src-tauri/src/app_state.rs#L69-L74)) stays as-is (it must run before/independent of this).

- [ ] **Step 5: Build, clippy, test**

Run: `cd src-tauri && cargo build --lib && cargo clippy --lib && cargo test --lib`
Expected: compiles, no warnings, all tests PASS. (No new unit tests here — these are integration wiring verified by the manual NVDA gate + build. The pure logic they call is already covered in Task 3.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/player_commands.rs src-tauri/src/commands/songs_commands.rs src-tauri/src/app_state.rs
git commit -m "feat(playback): persist resume fields on play-start/stop/quit transitions"
```

---

### Task 7: Webview announcements (i18n + pure selector + wiring)

**Files:**
- Create: `src/lib/playbackAnnounce.ts`, `src/lib/playbackAnnounce.test.ts`
- Modify: `src/i18n/messages/uk.json`, `src/i18n/messages/en.json`
- Modify: `src/lib/tauri.ts` (add `PlaybackAnnounce`)
- Modify: `src/App.tsx` (announce selector + `player-announce` handler)
- Modify: `src/components/player/PlayerPanel.tsx` (remove redundant announces)
- Modify: `src/components/player/PlayerPanel.test.tsx`

**Interfaces:**
- Consumes: Rust `"player-announce"` event `{ kind, name }` (Task 4); `PlaybackSource`/`PlayerStatus` from `src/lib/tauri.ts`.
- Produces: `selectPlaybackAnnouncement(prev, next, nameOf)` → discriminated result.

- [ ] **Step 1: Write the failing pure-selector test**

Create `src/lib/playbackAnnounce.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectPlaybackAnnouncement } from "./playbackAnnounce";
import type { PlayerStatus, PlaybackSource } from "./tauri";

const stream = (id = "s1"): PlaybackSource => ({ type: "stream", streamId: id });
const file = (path = "rec/a.mp3"): PlaybackSource => ({ type: "file", path });
const st = (
  state: PlayerStatus["state"],
  source: PlaybackSource | null = null,
): PlayerStatus => ({ state, source, volume: 0.5, positionMs: null, durationMs: null });

const nameOf = (s: PlaybackSource) =>
  s.type === "stream" ? `S:${s.streamId}` : s.type === "file" ? `F:${s.path}` : s.name;

describe("selectPlaybackAnnouncement", () => {
  it("stopped→playing (file) is a started event", () => {
    expect(selectPlaybackAnnouncement(st("stopped"), st("playing", file()), nameOf))
      .toEqual({ kind: "started", name: "F:rec/a.mp3" });
  });

  it("source switch while playing is a started event", () => {
    expect(
      selectPlaybackAnnouncement(st("playing", stream("a")), st("playing", stream("b")), nameOf),
    ).toEqual({ kind: "started", name: "S:b" });
  });

  it("playing→paused (file) is a paused event with name", () => {
    expect(selectPlaybackAnnouncement(st("playing", file()), st("paused", file()), nameOf))
      .toEqual({ kind: "paused", name: "F:rec/a.mp3" });
  });

  it("paused→playing (file) is a resumed event with name", () => {
    expect(selectPlaybackAnnouncement(st("paused", file()), st("playing", file()), nameOf))
      .toEqual({ kind: "resumed", name: "F:rec/a.mp3" });
  });

  it("stream→stopped names the previous source", () => {
    expect(selectPlaybackAnnouncement(st("playing", stream("a")), st("stopped"), nameOf))
      .toEqual({ kind: "stopped", name: "S:a" });
  });

  it("stopped with no prior source yields a nameless stopped", () => {
    expect(selectPlaybackAnnouncement(st("playing"), st("stopped"), nameOf))
      .toEqual({ kind: "stopped", name: null });
  });

  it("volume-only change (playing→playing, same source) is silent", () => {
    expect(selectPlaybackAnnouncement(st("playing", stream("a")), st("playing", stream("a")), nameOf))
      .toBeNull();
  });

  it("no transition (stopped→stopped) is silent", () => {
    expect(selectPlaybackAnnouncement(st("stopped"), st("stopped"), nameOf)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- playbackAnnounce`
Expected: FAIL — module `./playbackAnnounce` not found.

- [ ] **Step 3: Implement the pure selector**

Create `src/lib/playbackAnnounce.ts`:

```ts
import type { PlayerStatus, PlaybackSource } from "./tauri";

export type PlaybackAnnouncement =
  | { kind: "started"; name: string }
  | { kind: "paused"; name: string }
  | { kind: "resumed"; name: string }
  | { kind: "stopped"; name: string | null }
  | null;

function sameSource(a: PlaybackSource | null, b: PlaybackSource | null): boolean {
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;
  if (a.type === "stream" && b.type === "stream") return a.streamId === b.streamId;
  if (a.type === "file" && b.type === "file") return a.path === b.path;
  if (a.type === "preview" && b.type === "preview") return a.url === b.url;
  return false;
}

/**
 * Pick the single NVDA announcement for a player-status transition. Central
 * source of truth for pause/resume/stop/start — a UI button press and a global
 * hotkey both arrive here via `player-status`, so each yields exactly one
 * announce. Cold-start "connecting"/"unavailable" are NOT here — they come from
 * the Rust `player-announce` event (the webview can't derive them).
 */
export function selectPlaybackAnnouncement(
  prev: PlayerStatus,
  next: PlayerStatus,
  nameOf: (source: PlaybackSource) => string,
): PlaybackAnnouncement {
  const startedToPlaying = prev.state === "stopped" && next.state === "playing";
  const switchedWhilePlaying =
    next.state === "playing" && prev.state === "playing" && !sameSource(prev.source, next.source);

  if (startedToPlaying || switchedWhilePlaying) {
    return next.source ? { kind: "started", name: nameOf(next.source) } : null;
  }
  if (prev.state === "playing" && next.state === "paused") {
    return next.source ? { kind: "paused", name: nameOf(next.source) } : null;
  }
  if (prev.state === "paused" && next.state === "playing") {
    return next.source ? { kind: "resumed", name: nameOf(next.source) } : null;
  }
  if (prev.state !== "stopped" && next.state === "stopped") {
    return { kind: "stopped", name: prev.source ? nameOf(prev.source) : null };
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- playbackAnnounce`
Expected: PASS (8 tests).

- [ ] **Step 5: Add i18n messages**

In `src/i18n/messages/uk.json`, after `"playback_started"` ([uk.json:210](../../../src/i18n/messages/uk.json#L210)) add:

```json
  "playback_paused_named": "Пауза — {name}",
  "playback_resumed_named": "Відновлено — {name}",
  "playback_stopped_named": "Зупинено — {name}",
  "playback_connecting": "Підключення — {name}",
  "playback_unavailable": "Останнє відтворення недоступне",
```

In `src/i18n/messages/en.json`, after `"playback_started"` ([en.json:210](../../../src/i18n/messages/en.json#L210)) add:

```json
  "playback_paused_named": "Paused — {name}",
  "playback_resumed_named": "Resumed — {name}",
  "playback_stopped_named": "Stopped — {name}",
  "playback_connecting": "Connecting — {name}",
  "playback_unavailable": "Last playback unavailable",
```

Ensure JSON stays valid (trailing commas only between entries; the block above is followed by more keys, so the trailing comma on the last line is correct — verify the following line is another key).

- [ ] **Step 6: Add the `PlaybackAnnounce` type**

In `src/lib/tauri.ts`, after `PlayerEndedPayload` ([tauri.ts:201-203](../../../src/lib/tauri.ts#L201-L203)):

```ts
export interface PlaybackAnnounce {
  kind: "connecting" | "unavailable" | "error";
  name: string | null;
}
```

- [ ] **Step 7: Wire `App.tsx` — replace inline announce logic**

In `src/App.tsx`, replace the announce block inside `handlePlayerStatus` ([App.tsx:206-241](../../../src/App.tsx#L206-L241)). Keep the store update; swap the hand-written transition logic for the pure selector plus a kind→message map. Add a `nameOf` helper (mirrors `useSourceLabel`/tray logic):

```tsx
  const handlePlayerStatus = useCallback((payload: PlayerStatus) => {
    const prev = $playerStatus.get();
    $playerStatus.set(payload);

    const nameOf = (source: NonNullable<PlayerStatus["source"]>): string => {
      if (source.type === "stream") {
        return $streams.get().find((s) => s.id === source.streamId)?.name ?? source.streamId;
      }
      if (source.type === "preview") return source.name;
      return source.path.split(/[\\/]/).pop() ?? source.path;
    };

    const a = selectPlaybackAnnouncement(prev, payload, nameOf);
    if (!a) return;
    switch (a.kind) {
      case "started":
        announceRef.current(m.playback_started({ name: a.name }), "assertive");
        break;
      case "paused":
        announceRef.current(m.playback_paused_named({ name: a.name }), "assertive");
        break;
      case "resumed":
        announceRef.current(m.playback_resumed_named({ name: a.name }), "assertive");
        break;
      case "stopped":
        announceRef.current(
          a.name ? m.playback_stopped_named({ name: a.name }) : m.playback_stopped(),
          "assertive",
        );
        break;
    }
  }, []);
```

Add the import near the other lib imports:

```tsx
import { selectPlaybackAnnouncement } from "./lib/playbackAnnounce";
```

- [ ] **Step 8: Wire `App.tsx` — the `player-announce` handler**

Add a handler and register it next to the other `useTauriEvent` calls ([App.tsx:299-301](../../../src/App.tsx#L299-L301)):

```tsx
  const handlePlayerAnnounce = useCallback((payload: PlaybackAnnounce) => {
    switch (payload.kind) {
      case "connecting":
        announceRef.current(m.playback_connecting({ name: payload.name ?? "" }), "assertive");
        break;
      case "unavailable":
        announceRef.current(m.playback_unavailable(), "assertive");
        break;
      case "error":
        announceRef.current(m.playback_error(), "assertive");
        break;
    }
  }, []);
```

Register it (and import `PlaybackAnnounce` in the existing `src/lib/tauri` type import group):

```tsx
  useTauriEvent<PlaybackAnnounce>("player-announce", handlePlayerAnnounce);
```

- [ ] **Step 9: Remove the redundant announces from `PlayerPanel`**

In `src/components/player/PlayerPanel.tsx`, `handlePlayPause` ([PlayerPanel.tsx:210-223](../../../src/components/player/PlayerPanel.tsx#L210-L223)) — drop the two optimistic announces (now centralized in `handlePlayerStatus`, giving hotkey + button parity):

```tsx
  const handlePlayPause = async () => {
    try {
      if (isPlaying) {
        await tauri.pausePlayback();
      } else if (isPaused) {
        await tauri.resumePlayback();
      }
      // Announce is driven by handlePlayerStatus (App.tsx) off the player-status
      // event, so a hotkey press and this button behave identically.
    } catch (e) {
      console.error(e);
      announce(m.playback_error(), "assertive");
    }
  };
```

`handleStop` already relies on `handlePlayerStatus` for the stopped announce ([PlayerPanel.tsx:237](../../../src/components/player/PlayerPanel.tsx#L237)) — leave it. `announce` is still used (mute/skip/error), so the import stays.

- [ ] **Step 10: Update `PlayerPanel.test.tsx`**

Run `rg "playback_paused|playback_resumed" src/components/player/PlayerPanel.test.tsx` to find assertions that the button announces pause/resume. Replace any such assertion with one verifying the IPC call happens and **no** pause/resume announce is emitted from the button (the announce now belongs to `App.tsx`). Concretely, for a test that pressed Play/Pause and asserted `announce` was called with `m.playback_paused()`, change it to assert `tauri.pausePlayback` was called and drop the announce expectation. If a test asserts the mute/skip/error announces, leave those.

- [ ] **Step 11: Full frontend gate**

Run: `pnpm test`
Expected: PASS (the new `playbackAnnounce` suite + updated `PlayerPanel` suite; watch for a cold-run flake — re-run once if many unrelated suites fail, [[vitest-cold-run-flake]]).

Run: `pnpm vite:build`
Expected: build succeeds (this compiles Paraglide messages; a missing key here fails the build).

- [ ] **Step 12: Commit**

```bash
git add src/lib/playbackAnnounce.ts src/lib/playbackAnnounce.test.ts src/lib/tauri.ts src/App.tsx src/components/player/PlayerPanel.tsx src/components/player/PlayerPanel.test.tsx src/i18n/messages/uk.json src/i18n/messages/en.json
git commit -m "feat(playback): source-aware NVDA announces + cold-start hints via player-announce"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md:126`; `docs/accessibility.md:919`; `docs/architecture.md` (~:1178, :1193); `docs/data-models.md` (:52, :621, :985); `docs/keyboard-shortcuts.md:43`

**Interfaces:** none (docs only). No test cycle — this task's gate is a self-review read.

- [ ] **Step 1: Keyboard-shortcuts + README + accessibility**

- `docs/keyboard-shortcuts.md:43` — change the `togglePlayback` default from `Ctrl+Shift+P` to `Ctrl+Shift+K`; add a note that streams **stop** (not pause), files **pause/resume** at position, and a cold press resumes the last source. Note the shared debounce with the tray item and SMTC.
- `README.md:126` — update the default combo to `Ctrl+Shift+K` in the hotkey list.
- `docs/accessibility.md:919` — document the new announcements (Пауза/Відновлено/Зупинено/Підключення/недоступне) and that they carry the source name.

- [ ] **Step 2: architecture.md doc-fixes (impl-decision #5)**

- `docs/architecture.md` ~:1178 — remove the erroneous `Ctrl+Shift+P → Switch Profile` mapping (Switch Profile is a `MenuTrigger` button in the profiles panel, not a global hotkey — verified: no such hotkey exists in code).
- `docs/architecture.md` :1193 — change the Play/Pause hotkey from `Ctrl+Shift+P` to `Ctrl+Shift+K`, and describe the source-aware toggle + cold-start resume.

- [ ] **Step 3: data-models.md — PlayerSession**

- `docs/data-models.md` (:52, and the §3.7 PlayerSession block ~:621, plus ~:985) — document the now-live `lastStreamId` / `lastFilePosition` and the new `lastActive: "stream" | "file" | null` discriminator, when each is written (play-start / pause / stop / quit), and that it is **profile-scoped** (cleared on duplicate) and lives in `player_session`, not `settings.json`.

- [ ] **Step 4: Self-review the docs**

Read each edited section back. Confirm no remaining `Ctrl+Shift+P` reference to `togglePlayback`/Play-Pause survives: `rg -n "Ctrl\+Shift\+P" README.md docs/`. Any hit must be either removed or an intentional historical note.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/
git commit -m "docs(playback): Ctrl+Shift+K rebind, stop/pause semantics, PlayerSession resume fields"
```

---

## Final Verification (before finishing the branch)

Run the full gate and confirm every line of output before claiming completion (verification-before-completion skill):

- [ ] `cd src-tauri && cargo test` — all green.
- [ ] `cd src-tauri && cargo clippy --all-targets` — no warnings.
- [ ] `pnpm test` — all green (re-run once on a cold-run flake).
- [ ] `pnpm vite:build` — succeeds (Paraglide keys compile).
- [ ] **Manual NVDA gate** (`just dev`), against the done-criteria:
  - Stream playing → `Ctrl+Shift+K` **stops** (hears «Зупинено — <станція>»); press again → reconnects same stream (hears «Підключення — <станція>» then «Відтворення: …»).
  - File playing → K **pauses** (hears «Пауза — <трек>»); press again → **resumes at the same position** (hears «Відновлено — <трек>»).
  - Preview → K stops; nothing written to the profile; relaunch + K does not resume the preview.
  - Cold start after a stream session → K reconnects; after a file session → K resumes with seek to `positionMs`.
  - Delete the last stream / move the last file, then cold K → «Останнє відтворення недоступне», no crash, record cleared (a second K is silent).
  - Nothing ever played, cold K → silence, no-op.
  - Tray Play/Pause item mirrors the hotkey; the tray "Зупинити" of a file lets a later K resume at position.
  - Confirm `data/profiles/<name>.tapirprofile` shows `lastActive` + `lastStreamId`/`lastFilePosition` updating on transitions.

Then use the **superpowers:finishing-a-development-branch** skill to integrate into `develop`.

---

## Self-Review (plan vs. spec)

**Spec coverage:** default rebind → Task 2; source-aware dispatch (stream=stop, file=pause/resume, preview=stop) → Tasks 3–5; revive dormant fields + discriminator → Tasks 1, 3, 4, 6; cold-start resume + seek + stale/dangling handling → Tasks 3, 4; NVDA status+name for every transition → Task 7; tray coordination + shared debounce → Tasks 4, 5; no-migration → Task 2; docs incl. architecture.md double-`Ctrl+Shift+P` and Switch-Profile fixes → Task 8; autostart NOT auto-playing → unchanged (no autostart-play code touched; play happens only through `toggle_playback`). Impl-decisions #1–#5 → discriminator enum (Task 1/3), seek reuse (Task 4), `graceful_shutdown` extension (Task 6), legacy paused-stream → stop (Task 3 `decide_toggle` + test), architecture.md fixes (Task 8).

**Type consistency:** `LastActive`/`last_active` (Task 1) used identically in Tasks 3/4/6; `persist_session_snapshot`/`apply_session_snapshot` signatures fixed in Task 3/4 and called unchanged in Tasks 5/6; `player-announce` payload `{ kind, name }` produced in Task 4 matches the `PlaybackAnnounce` TS type + handler in Task 7; `selectPlaybackAnnouncement` signature identical in test (Task 7 Step 1) and impl (Step 3).

**Known simplifications (documented, in-scope):** cold-start stream connect double-announce («Підключення» → «Відтворення») accepted as informative; transient play failure announces `error` and keeps the record (not in the spec's table but the correct non-destructive behavior); SMTC-stop / natural-end don't snapshot the latest file position (best-effort — durable crash-resume is Phase 3K's job); in-app PlayerPanel button keeps pause-based behavior for streams (spec scopes stream=stop to hotkey + tray).
