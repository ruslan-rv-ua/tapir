# Global Prev/Next Track Hotkeys — Design Spec

**Date:** 2026-06-10
**Branch:** feat/global-prev-next-track

## Problem

There are no OS-global hotkeys for switching to the previous/next track or
stream. The player already has working Prev/Next buttons (transport model:
`playbackNeighbors` + `playbackTransport`), but they only work with the window
focused. KB-12 (2026-06-10) rejected global next/prev "until a player queue
model exists" — that model has since landed, so the blocker is gone.

## Goals

1. Two new Tier-1 (OS-global, configurable) hotkeys: `prev_track` and
   `next_track`.
2. Defaults: `Ctrl+Alt+Left` / `Ctrl+Alt+Right`. **Not** `Ctrl+Shift+←/→` as
   originally floated: that combo is system-wide "select word" (heavily used
   with NVDA); an OS-global grab would break word selection in every app while
   Tapir runs. `Ctrl+Alt+←/→` also matches the AIMP global-hotkey convention.
   The user can rebind in Settings → Hotkeys, including back to
   `Ctrl+Shift+←/→` if they accept the trade-off.
3. Hotkeys behave exactly like the player's SkipBack/SkipForward buttons,
   including when the window is hidden in the tray.

## Out of scope

- Global mute hotkey (still deferred; this work builds the Rust→webview bridge
  it needs, but mute itself is a separate task).
- Tray toast / notification on track change — the audible change is the
  feedback (unlike `toggle_recording`, where silence needs a toast).
- Hold-to-repeat (volume-style): prev/next are discrete actions; the plugin
  emits no auto-repeat on hold, and repeated presses are the legitimate way to
  skip several tracks. No debounce either, for the same reason.

---

## Architecture constraint

The transport decision (what "next" means) lives **only in the webview**:
`$playbackNeighbors` derives from `$streams` order and `$filteredSongs`
(filter state). Rust cannot compute it without duplicating that state.

**Chosen approach: event bridge Rust→webview.** The Rust shortcut handler does
not act; it emits a `transport-skip` event with payload `"prev"` / `"next"`.
The frontend listens and executes the same logic as the player buttons. The
webview keeps running while the window is hidden, so the bridge works from the
tray. (Rejected: moving the queue model to Rust — state duplication;
registering these two hotkeys from JS — breaks the "all Tier-1 registered in
Rust from HotkeyMap" invariant and bypasses re-registration/validation.)

---

## Design

### 1. `settings.rs` — HotkeyMap fields

```rust
#[serde(default = "default_hk_prev_track")]
pub prev_track: String,   // "Ctrl+Alt+Left"
#[serde(default = "default_hk_next_track")]
pub next_track: String,   // "Ctrl+Alt+Right"
```

Per-field `#[serde(default)]` keeps the KB-12 migration property: an old
`settings.json` whose `hotkeys` object predates these fields still
deserializes, new fields get defaults, customized combos survive. Update
`Default for HotkeyMap`. (`default_hotkeys` command picks the new fields up
automatically.)

### 2. `shortcuts.rs` — registration + emit

- Add `(&hotkeys.prev_track, "prev_track")` and
  `(&hotkeys.next_track, "next_track")` to the `combos` array.
- In `handle_shortcut_action`, new arms that only emit (no state access, no
  debounce):

```rust
"prev_track" => { let _ = app.emit("transport-skip", "prev"); }
"next_track" => { let _ = app.emit("transport-skip", "next"); }
```

(`tauri::Emitter` import.) Registration failures surface through the existing
`failed` list → HotkeysTab error panel. Note: `Ctrl+Alt+Left/Right` is the
Intel GPU screen-rotation hotkey on some laptops; if the driver grabbed it
first, registration fails visibly there — acceptable, user rebinds.

### 3. Frontend — shared transport executor

Extract the core of `PlayerPanel.handleSkip` into
`src/lib/transportControl.ts`:

```ts
export type SkipTrigger = "prev" | "next";

let pending = false; // module-level: button and hotkey share one guard

export async function executeTransportSkip(
  trigger: SkipTrigger,
  hooks?: {
    beforeExecute?: (action: TransportAction, ctx: TransportContext) => void;
    onSeekStart?: () => void;  // panel announces "player_restarted"
    onError?: () => void;      // panel announces "playback_error"
  },
): Promise<void>
```

Body = current `handleSkip`: read `$playerStatus` / `$playbackNeighbors` /
`$settings`, `resolveTransportAction`, `none` → return, pending guard,
switch over `play-stream` / `play-file` / `seek-start`, `finally` clears
pending. Errors always `console.error`; `onError` is extra.

- **PlayerPanel** calls it with hooks: `beforeExecute` does the existing
  `pressedBecomesDisabled` focus pre-move, `onSeekStart`/`onError` announce.
  `navPendingRef` is replaced by the shared module guard.
- **Global listener**: in App.tsx, the existing `useTauriEvent` hook —
  `useTauriEvent<string>("transport-skip", ...)` → validate payload is
  `"prev" | "next"` → `executeTransportSkip(payload)` with no hooks. Play
  announcements still happen via the existing `player-status` → App.tsx path
  when the window is visible.

### 4. Settings UI + i18n

- `HotkeyMap` interface in `src/lib/tauri.ts` += `prevTrack`, `nextTrack`
  (camelCase ⇄ serde rename).
- `HOTKEY_FIELDS` in HotkeysTab += two entries → KeyRecorder rows, duplicate
  validation and reset-to-defaults work automatically.
- i18n: `settings_hotkey_prev_track` ("Previous track" / «Попередній трек»),
  `settings_hotkey_next_track` ("Next track" / «Наступний трек») in
  `en.json` + `uk.json`; regenerate paraglide via the vite plugin.
- Verify KeyRecorder records `Left`/`Right` arrows into the combo format the
  plugin parses (it already records `Up`/`Down` for volume — same alias
  family).
- `Ctrl+Alt+Left/Right` does not collide with `RESERVED_WEBVIEW_COMBOS`
  (those are `Ctrl+K`, `Ctrl+,`, `Alt+digit`, `F1`, `F6`, …).

### 5. Docs

- [keyboard-shortcuts.md](../../keyboard-shortcuts.md): two new ✅ rows in the
  Tier-1 table; rewrite the note under it (next/prev no longer "rejected until
  queue model"); bump «Останнє звірення з кодом».
- [keyboard-shortcuts-backlog.md](../../keyboard-shortcuts-backlog.md): note
  under KB-12 that the queue model landed and next/prev shipped; mute remains
  deferred but the Rust→webview bridge now exists (`transport-skip` precedent).

### 6. Tests

- **Rust** (`settings.rs`): `hotkeys` object without the new fields still
  loads — new fields get defaults, others survive (mirror of the KB-12 test).
  Default combo assertions.
- **Frontend**:
  - `transportControl.test.ts`: executes the right tauri command per action;
    `none` → no command; pending guard blocks concurrent calls; `finally`
    releases the guard; hooks called at the right moments.
  - Event listener: `transport-skip` with `"prev"`/`"next"` triggers the
    executor; garbage payload is ignored.
  - `PlayerPanel.test.tsx`: existing skip tests keep passing after the
    extraction (buttons still work, focus pre-move intact).
  - `HotkeysTab.test.tsx`: two new rows render; duplicate validation covers
    the new fields.
- Gates: `pnpm test` + `pnpm vite:build` + `cargo test` (tsc has known
  pre-existing errors; not a gate).

## Behavior summary

| Situation | Result |
|---|---|
| Music/stream playing, neighbor exists | switch to neighbor (same as button) |
| `prev` past `prevRestartThresholdMs` in a file | seek to 0 (existing rule) |
| At list boundary / no neighbor | no-op, silent |
| Nothing playing | no-op, silent |
| Window hidden in tray | works (event reaches hidden webview) |
| Combo taken by another app | registration error shown in HotkeysTab |
