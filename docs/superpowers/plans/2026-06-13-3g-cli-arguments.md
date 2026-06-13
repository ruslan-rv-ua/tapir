# Phase 3G — CLI Arguments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tapir recognize command-line flags (`--record`, `--play`, `--stop-recording`, `--stop-playback`, `--wish-add`, `--wish-remove`, `--profile`, `--minimize`) and act on them both on its own startup (first instance) and when a second launch forwards its argv to the running instance (Phase 3E single-instance callback), with a screen-reader announcement for every action and edge case.

**Architecture:** Three layers in `cli.rs` — **parse** (clap, pure) → **plan** (pure, context-dependent) → **execute** (async, impure dispatch that reuses the existing IPC command logic). The pure layers are unit-tested; `execute` is thin orchestration. Startup actions are deferred into a managed `StartupPlan` and drained from `frontend_ready` (so announcements are not lost before the webview subscribes), exactly as the scheduler already does. Forwarded actions run straight from the single-instance callback via `spawn`. Parse-error `exit(2)` happens at the *start of `.setup`* (reachable only by the first instance), never before the builder.

**Tech Stack:** Rust + Tauri v2 (`clap` 4 with derive, `tauri-plugin-single-instance`), TypeScript + React 19 frontend (nanostores, Paraglide i18n, react-aria live regions).

**Source spec:** [docs/superpowers/specs/2026-06-13-3g-cli-design.md](../specs/2026-06-13-3g-cli-design.md)

---

## File Structure

**Rust (`src-tauri/`):**
- `Cargo.toml` — add `clap` dependency.
- `src/cli.rs` — **rewritten**. Owns `Cli`, `CliContext`, `Action`, `IgnoredFlag`, `Plan`, `StartupPlan`, `CliFeedback` and the `parse` / `plan` / `find_stream` / `validate_needle` / `execute` / `feedback` functions. The pure helpers carry the unit tests. Replaces the Phase 3E `handle_args` stub.
- `src/lib.rs` — `run()` gains an early parse (for `--profile`), a deferred `exit` at the start of `.setup`, the `--minimize` window handling, and `app.manage(StartupPlan::new(...))`. The Phase 3E `handle_args` call in `.setup` is removed.
- `src/single_instance.rs` — `on_second_instance` replaces the `handle_args` tail with a `spawn` that runs `parse` → `plan(_, Forwarded)` → `execute`, plus `InvalidArgs` feedback on a real parse error.
- `src/commands/app_commands.rs` — `frontend_ready` drains `StartupPlan` and spawns `execute`.

**Frontend (`src/`):**
- `lib/tauri.ts` — add `CliFeedbackPayload` discriminated-union type.
- `hooks/useCliFeedback.ts` — **new**. Subscribes to `cli-feedback`, maps `kind` → Paraglide message → `announce` (+ toast). Mirrors `useScheduleEvents.ts`.
- `App.tsx` — call `useCliFeedback()`; add a `wishlist-changed` listener that refreshes the `$wishlist` store.
- `i18n/messages/uk.json`, `i18n/messages/en.json` — seven new `cli_*` keys.

---

## Task 1: Add the `clap` dependency

**Files:**
- Modify: `src-tauri/Cargo.toml:14-26` (the `[dependencies]` block)

- [ ] **Step 1: Add the dependency**

In `src-tauri/Cargo.toml`, immediately after the `tauri-plugin-single-instance = "2"` line (line 26), add:

```toml

# CLI argument parsing (Phase 3G). Pure-Rust, no C deps; derive adds the
# clap_derive proc-macro (build-time only). try_parse_from is used so clap
# never auto-prints to the (absent) release console — see cli.rs.
clap = { version = "4", features = ["derive"] }
```

- [ ] **Step 2: Verify it resolves and builds**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds successfully (clap and clap_derive downloaded/compiled, no errors).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "build(cli): add clap dependency for Phase 3G argument parsing"
```

---

## Task 2: `Cli` struct + `parse()` (TDD)

Rewrite `cli.rs` to define the raw-parse struct and the pure `parse` function. **Keep the existing `handle_args` function for now** — `lib.rs:102` and `single_instance.rs:55` still call it; it is removed in Task 10 once both callers are migrated. Keeping it means every task in between still builds.

**Files:**
- Modify: `src-tauri/src/cli.rs` (full rewrite of the top; tests inline in `#[cfg(test)] mod tests`)

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src-tauri/src/cli.rs` with:

```rust
//! Command-line argument handling (Phase 3G).
//!
//! Three layers: `parse` (clap, pure) -> `plan` (pure, context-dependent) ->
//! `execute` (async, impure dispatch reusing the IPC command logic). The pure
//! layers are unit-tested below; `execute` is thin orchestration over the
//! already-tested manager/player/wishlist code.
//!
//! Called from two places:
//!   * startup (first instance): `lib.rs` parses its own argv early, then
//!     `frontend_ready` drains the deferred `StartupPlan` and runs `execute`;
//!   * forwarded (second instance's argv): `single_instance.rs` spawns
//!     `parse` -> `plan(_, Forwarded)` -> `execute`.

use clap::Parser;

/// Raw argv parse. Every field is optional, so an empty argv (an ordinary
/// double-click) parses to "no actions". `try_parse_from` works for our own
/// argv and for forwarded argv alike (both carry `argv[0]` = the EXE path).
#[derive(Parser, Debug, Default, PartialEq, Eq)]
// `version` is REQUIRED: without it clap does not generate the `--version`
// flag, and `--version` would become an UnknownArgument (exit 2) instead of
// DisplayVersion (exit 0). Help is generated automatically.
#[command(name = "tapir", version = env!("CARGO_PKG_VERSION"))]
pub struct Cli {
    #[arg(long, value_name = "NAME|URL")]
    pub record: Option<String>,
    #[arg(long, value_name = "NAME|URL")]
    pub play: Option<String>,
    #[arg(long)]
    pub stop_recording: bool,
    #[arg(long)]
    pub stop_playback: bool,
    #[arg(long, value_name = "PATTERN")]
    pub wish_add: Option<String>,
    #[arg(long, value_name = "PATTERN")]
    pub wish_remove: Option<String>,
    #[arg(long, value_name = "NAME")]
    pub profile: Option<String>, // startup-only
    #[arg(long)]
    pub minimize: bool, // startup-only
}

/// Pure: argv -> Cli (or clap::Error for help/version/parse-error).
pub fn parse(argv: &[String]) -> Result<Cli, clap::Error> {
    Cli::try_parse_from(argv)
}

use tauri::AppHandle;

/// Phase 3E seam — removed in Phase 3G Task 10 once both callers are migrated.
pub fn handle_args(_app: &AppHandle, argv: Vec<String>, cwd: Option<String>) {
    log::info!("CLI args (not yet interpreted, see Phase 3G): argv={argv:?}, cwd={cwd:?}");
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::error::ErrorKind;

    fn argv(args: &[&str]) -> Vec<String> {
        std::iter::once("tapir")
            .chain(args.iter().copied())
            .map(String::from)
            .collect()
    }

    #[test]
    fn empty_argv_parses_to_default() {
        assert_eq!(parse(&argv(&[])).unwrap(), Cli::default());
    }

    #[test]
    fn record_with_value_parses() {
        let cli = parse(&argv(&["--record", "Jazz FM"])).unwrap();
        assert_eq!(cli.record.as_deref(), Some("Jazz FM"));
        assert_eq!(cli.play, None);
    }

    #[test]
    fn boolean_flags_parse() {
        let cli = parse(&argv(&["--stop-recording", "--minimize"])).unwrap();
        assert!(cli.stop_recording);
        assert!(cli.minimize);
        assert!(!cli.stop_playback);
    }

    #[test]
    fn all_value_flags_parse() {
        let cli = parse(&argv(&[
            "--play", "http://x", "--wish-add", "*live*",
            "--wish-remove", "*ad*", "--profile", "Work",
        ]))
        .unwrap();
        assert_eq!(cli.play.as_deref(), Some("http://x"));
        assert_eq!(cli.wish_add.as_deref(), Some("*live*"));
        assert_eq!(cli.wish_remove.as_deref(), Some("*ad*"));
        assert_eq!(cli.profile.as_deref(), Some("Work"));
    }

    #[test]
    fn unknown_flag_is_error() {
        let err = parse(&argv(&["--nope"])).unwrap_err();
        assert_eq!(err.kind(), ErrorKind::UnknownArgument);
    }

    #[test]
    fn help_flag_is_display_help() {
        let err = parse(&argv(&["--help"])).unwrap_err();
        assert_eq!(err.kind(), ErrorKind::DisplayHelp);
    }

    #[test]
    fn version_flag_is_display_version() {
        // Regression for the v1 sketch bug: without `version` in #[command],
        // `--version` would be UnknownArgument, not DisplayVersion.
        let err = parse(&argv(&["--version"])).unwrap_err();
        assert_eq!(err.kind(), ErrorKind::DisplayVersion);
    }
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cli::tests`
Expected: all 7 `cli::tests::*` pass; the rest of the build still compiles (`handle_args` retained, callers unchanged).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/cli.rs
git commit -m "feat(cli): clap Cli struct + pure parse() with unit tests"
```

---

## Task 3: `plan()` + the plan types (TDD)

Add `CliContext`, `Action`, `IgnoredFlag`, `Plan`, and the pure `plan` function that maps a `Cli` + context to an ordered action list, routing startup-only flags to `ignored` on `Forwarded`.

**Files:**
- Modify: `src-tauri/src/cli.rs`

- [ ] **Step 1: Write the failing tests**

In `src-tauri/src/cli.rs`, add these type definitions immediately after the `parse` function (before the `use tauri::AppHandle;` line):

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CliContext {
    Startup,
    Forwarded,
}

/// One executable action. The order within `Plan.actions` is the execution
/// order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    Record(String),
    Play(String),
    StopRecording,
    StopPlayback,
    WishAdd(String),
    WishRemove(String),
    SwitchProfile(String), // Startup only; a no-op in execute (applied before AppState::new)
    // Minimize is handled directly in setup, never as a runtime Action.
}

/// A flag dropped because of context (drives a warn + announcement).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IgnoredFlag {
    Profile,
    Minimize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    pub actions: Vec<Action>,
    pub ignored: Vec<IgnoredFlag>,
}

/// Pure: Cli + context -> ordered plan. Order is fixed and deterministic:
/// SwitchProfile -> stop_* -> wish_* -> record/play (profile first, because it
/// changes where a stream is resolved). Startup-only flags on Forwarded land in
/// `ignored`, not `actions`.
pub fn plan(cli: Cli, ctx: CliContext) -> Plan {
    let mut actions = Vec::new();
    let mut ignored = Vec::new();

    // 1. profile (startup-only)
    if let Some(name) = cli.profile {
        match ctx {
            CliContext::Startup => actions.push(Action::SwitchProfile(name)),
            CliContext::Forwarded => ignored.push(IgnoredFlag::Profile),
        }
    }
    // minimize (startup-only): handled in setup on Startup; ignored on Forwarded.
    if cli.minimize && ctx == CliContext::Forwarded {
        ignored.push(IgnoredFlag::Minimize);
    }
    // 2. stop_*
    if cli.stop_recording {
        actions.push(Action::StopRecording);
    }
    if cli.stop_playback {
        actions.push(Action::StopPlayback);
    }
    // 3. wish_*
    if let Some(p) = cli.wish_add {
        actions.push(Action::WishAdd(p));
    }
    if let Some(p) = cli.wish_remove {
        actions.push(Action::WishRemove(p));
    }
    // 4. record/play
    if let Some(x) = cli.record {
        actions.push(Action::Record(x));
    }
    if let Some(x) = cli.play {
        actions.push(Action::Play(x));
    }

    Plan { actions, ignored }
}
```

Then add these tests inside the existing `#[cfg(test)] mod tests` block (after the parse tests):

```rust
    #[test]
    fn startup_profile_becomes_switch_action() {
        let cli = parse(&argv(&["--profile", "Work"])).unwrap();
        let p = plan(cli, CliContext::Startup);
        assert_eq!(p.actions, vec![Action::SwitchProfile("Work".into())]);
        assert!(p.ignored.is_empty());
    }

    #[test]
    fn forwarded_profile_and_minimize_are_ignored() {
        let cli = parse(&argv(&["--profile", "Work", "--minimize"])).unwrap();
        let p = plan(cli, CliContext::Forwarded);
        assert!(p.actions.is_empty());
        assert_eq!(p.ignored, vec![IgnoredFlag::Profile, IgnoredFlag::Minimize]);
    }

    #[test]
    fn startup_minimize_is_not_an_action_and_not_ignored() {
        // Minimize on Startup is handled in setup (window visibility), so it
        // appears in neither actions nor ignored.
        let cli = parse(&argv(&["--minimize"])).unwrap();
        let p = plan(cli, CliContext::Startup);
        assert!(p.actions.is_empty());
        assert!(p.ignored.is_empty());
    }

    #[test]
    fn action_order_is_deterministic() {
        let cli = parse(&argv(&[
            "--record", "R", "--wish-add", "W", "--stop-recording", "--profile", "P",
        ]))
        .unwrap();
        let p = plan(cli, CliContext::Startup);
        assert_eq!(
            p.actions,
            vec![
                Action::SwitchProfile("P".into()),
                Action::StopRecording,
                Action::WishAdd("W".into()),
                Action::Record("R".into()),
            ]
        );
    }

    #[test]
    fn combinations_are_allowed_not_rejected() {
        // --stop-playback --record X is a legal combination (last wins by state).
        let cli = parse(&argv(&["--stop-playback", "--record", "X"])).unwrap();
        let p = plan(cli, CliContext::Forwarded);
        assert_eq!(
            p.actions,
            vec![Action::StopPlayback, Action::Record("X".into())]
        );
    }
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cli::tests`
Expected: all parse + plan tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/cli.rs
git commit -m "feat(cli): pure plan() with context routing + ordering tests"
```

---

## Task 4: `find_stream` resolver + `validate_needle` (TDD)

Two pure helpers for `--record`/`--play`: resolve a `name|url` needle against the active profile's streams, and reject non-http(s) URL-shaped needles.

**Files:**
- Modify: `src-tauri/src/cli.rs`

- [ ] **Step 1: Write the failing tests**

In `src-tauri/src/cli.rs`, add this import near the top (with the other `use` lines, after `use clap::Parser;`):

```rust
use crate::profile::StreamInfo;
```

Add the two helpers after the `plan` function:

```rust
/// Pure: resolve a needle to a stream by exact `name`, else exact `url`.
/// Name takes priority over url.
pub fn find_stream<'a>(streams: &'a [StreamInfo], needle: &str) -> Option<&'a StreamInfo> {
    streams
        .iter()
        .find(|s| s.name == needle)
        .or_else(|| streams.iter().find(|s| s.url == needle))
}

/// Pure: reject a needle that looks like a URL (contains "://") but is not
/// http/https. A needle without "://" is treated as a name and always passes.
pub fn validate_needle(needle: &str) -> Result<(), ()> {
    if needle.contains("://") {
        let lower = needle.to_ascii_lowercase();
        if !(lower.starts_with("http://") || lower.starts_with("https://")) {
            return Err(());
        }
    }
    Ok(())
}
```

Add these tests inside `#[cfg(test)] mod tests`:

```rust
    fn stream(id: &str, name: &str, url: &str) -> StreamInfo {
        StreamInfo {
            id: id.into(), url: url.into(), name: name.into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        }
    }

    #[test]
    fn find_stream_matches_by_name() {
        let streams = [stream("1", "Jazz", "http://a"), stream("2", "Rock", "http://b")];
        assert_eq!(find_stream(&streams, "Rock").unwrap().id, "2");
    }

    #[test]
    fn find_stream_matches_by_url_when_no_name() {
        let streams = [stream("1", "Jazz", "http://a"), stream("2", "Rock", "http://b")];
        assert_eq!(find_stream(&streams, "http://b").unwrap().id, "2");
    }

    #[test]
    fn find_stream_prefers_name_over_url() {
        // A needle equal to one stream's name and another's url resolves by name.
        let streams = [
            stream("1", "http://b", "http://a"), // name happens to equal stream 2's url
            stream("2", "Rock", "http://b"),
        ];
        assert_eq!(find_stream(&streams, "http://b").unwrap().id, "1");
    }

    #[test]
    fn find_stream_returns_none_when_no_match() {
        let streams = [stream("1", "Jazz", "http://a")];
        assert!(find_stream(&streams, "Nope").is_none());
    }

    #[test]
    fn validate_needle_accepts_http_and_https_and_names() {
        assert!(validate_needle("http://x").is_ok());
        assert!(validate_needle("https://x").is_ok());
        assert!(validate_needle("HTTPS://X").is_ok()); // scheme is case-insensitive
        assert!(validate_needle("Jazz FM").is_ok()); // no "://" -> name
    }

    #[test]
    fn validate_needle_rejects_non_http_schemes() {
        assert!(validate_needle("ftp://x").is_err());
        assert!(validate_needle("file://x").is_err());
        assert!(validate_needle("javascript://x").is_err());
    }
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cli::tests`
Expected: parse + plan + find_stream + validate_needle tests all pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/cli.rs
git commit -m "feat(cli): pure find_stream resolver + URL validation with tests"
```

---

## Task 5: `StartupPlan` managed state (TDD)

A one-shot holder for the startup plan, drained from `frontend_ready`. `Mutex<Option<Plan>>` so `take()` makes it idempotent (a webview reload that calls `frontend_ready` again finds it empty).

**Files:**
- Modify: `src-tauri/src/cli.rs`

- [ ] **Step 1: Write the failing test**

In `src-tauri/src/cli.rs`, add after the `Plan` struct:

```rust
/// Startup plan deferred until the webview is ready. Stored as managed state in
/// `setup`, drained (`take`) from `frontend_ready` so action announcements are
/// not lost before the webview subscribes to events. `take()` makes it one-shot.
pub struct StartupPlan(pub std::sync::Mutex<Option<Plan>>);

impl StartupPlan {
    pub fn new(plan: Plan) -> Self {
        Self(std::sync::Mutex::new(Some(plan)))
    }
    pub fn take(&self) -> Option<Plan> {
        self.0.lock().unwrap().take()
    }
}
```

Add this test inside `#[cfg(test)] mod tests`:

```rust
    #[test]
    fn startup_plan_take_is_one_shot() {
        let sp = StartupPlan::new(Plan {
            actions: vec![Action::StopRecording],
            ignored: vec![],
        });
        assert_eq!(
            sp.take(),
            Some(Plan { actions: vec![Action::StopRecording], ignored: vec![] })
        );
        assert_eq!(sp.take(), None, "second take must be empty (reload-safe)");
    }
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cli::tests::startup_plan_take_is_one_shot`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/cli.rs
git commit -m "feat(cli): StartupPlan one-shot managed-state holder"
```

---

## Task 6: `CliFeedback` event + `feedback()` emitter (TDD on serialization)

The structural feedback payload the backend emits on `cli-feedback`. The frontend localizes it (Task 11/12). Test the serde tagging so the kebab-case `kind` contract is locked.

**Files:**
- Modify: `src-tauri/src/cli.rs`

- [ ] **Step 1: Write the failing test**

In `src-tauri/src/cli.rs`, change the tauri import line from:

```rust
use tauri::AppHandle;
```

to:

```rust
use tauri::{AppHandle, Emitter, Manager};
```

Add the enum and emitter after `StartupPlan` (before the `handle_args` fn):

```rust
/// Structural feedback for the frontend. Localized there (Paraglide); the
/// backend never sends finished strings. `tag = "kind"`, kebab-case variant
/// names — the TS discriminated union in lib.rs/tauri.ts mirrors this.
#[derive(Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CliFeedback {
    WishlistAdded { pattern: String },
    WishlistRemoved { pattern: String },
    StreamNotFound { needle: String },
    InvalidUrl { needle: String },
    FlagIgnoredForwarded { flag: String },
    ActionFailed { action: String }, // "record" | "play" | "stop-playback" | ... ; error detail -> log
    InvalidArgs,
}

/// Emit a `cli-feedback` event to the webview. Best-effort: a failure to emit
/// is logged, never propagated.
pub fn feedback(app: &AppHandle, fb: CliFeedback) {
    if let Err(e) = app.emit("cli-feedback", fb) {
        log::warn!("Failed to emit cli-feedback: {e}");
    }
}
```

Add this test inside `#[cfg(test)] mod tests`:

```rust
    #[test]
    fn cli_feedback_serializes_with_kebab_kind_tag() {
        let json = serde_json::to_string(&CliFeedback::WishlistAdded { pattern: "*x*".into() }).unwrap();
        assert!(json.contains("\"kind\":\"wishlist-added\""), "got: {json}");
        assert!(json.contains("\"pattern\":\"*x*\""), "got: {json}");

        let json = serde_json::to_string(&CliFeedback::FlagIgnoredForwarded { flag: "profile".into() }).unwrap();
        assert!(json.contains("\"kind\":\"flag-ignored-forwarded\""), "got: {json}");

        let json = serde_json::to_string(&CliFeedback::InvalidArgs).unwrap();
        assert!(json.contains("\"kind\":\"invalid-args\""), "got: {json}");
    }
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cli::tests::cli_feedback_serializes_with_kebab_kind_tag`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/cli.rs
git commit -m "feat(cli): CliFeedback event payload + feedback() emitter"
```

---

## Task 7: `execute()` async dispatch

Map each `Action` to the **existing** IPC command logic (no duplication), turn every `Err` into a `CliFeedback::ActionFailed` (decision §6 — no silent failures), announce ignored flags, and emit `wishlist-changed` after a wishlist mutation so the panel refreshes.

`execute` is impure (`&AppHandle`, holds manager/player locks) and is **not** unit-tested — same call as Phase 3E's `handle_args`: thin orchestration over already-tested code. Verified by `cargo build` here and by the manual NVDA run in Task 13.

**Files:**
- Modify: `src-tauri/src/cli.rs`

- [ ] **Step 1: Add the `AppState` import**

In `src-tauri/src/cli.rs`, add near the other `use` lines:

```rust
use crate::app_state::AppState;
```

- [ ] **Step 2: Write `execute` and its private helpers**

Add after the `feedback` function:

```rust
/// Impure: run the plan on a live instance. Called from the async runtime.
/// Ignored flags are announced first, then actions run in plan order.
pub async fn execute(app: &AppHandle, plan: Plan) {
    for flag in &plan.ignored {
        let name = match flag {
            IgnoredFlag::Profile => "profile",
            IgnoredFlag::Minimize => "minimize",
        };
        log::warn!("CLI flag --{name} ignored on forwarded launch");
        feedback(app, CliFeedback::FlagIgnoredForwarded { flag: name.to_string() });
    }
    for action in plan.actions {
        execute_action(app, action).await;
    }
}

/// Outcome of resolving a `--record`/`--play` needle.
enum Resolved {
    Found(String), // stream_id
    NotFound,
    InvalidUrl,
}

async fn resolve_stream_id(app: &AppHandle, needle: &str) -> Resolved {
    if validate_needle(needle).is_err() {
        return Resolved::InvalidUrl;
    }
    let state = app.state::<AppState>();
    let profile = state.active_profile.read().await;
    match find_stream(&profile.streams, needle) {
        Some(s) => Resolved::Found(s.id.clone()),
        None => Resolved::NotFound,
    }
}

async fn execute_action(app: &AppHandle, action: Action) {
    match action {
        // SwitchProfile is an UNCONDITIONAL no-op here: it only ever lands in a
        // Startup plan (Forwarded routes --profile to IgnoredFlag::Profile), and
        // on startup the profile is already loaded before AppState::new (lib.rs).
        // Kept as a no-op (rather than excluded from the plan) so `plan` stays
        // simple and symmetric. This is why `execute` needs no CliContext.
        Action::SwitchProfile(_) => {}

        Action::StopRecording => {
            // Reuses the global stop-all path; it emits the same recording-status
            // events the frontend already announces (and notify_manual_stop).
            crate::recording_control::stop_all_now(app).await;
        }

        Action::StopPlayback => {
            let state = app.state::<AppState>();
            if let Err(e) = state.player.stop_playback(app).await {
                log::warn!("CLI --stop-playback failed: {e}");
                feedback(app, CliFeedback::ActionFailed { action: "stop-playback".into() });
            }
            // Success path: player-status "stopped" is announced by the frontend.
        }

        Action::Record(needle) => match resolve_stream_id(app, &needle).await {
            Resolved::Found(id) => {
                if let Err(e) = crate::commands::stream_commands::start_recording(
                    id,
                    app.state::<AppState>(),
                    app.clone(),
                )
                .await
                {
                    // e.g. check_disk_space Err -> no recording-status would fire,
                    // so without this the failure would be silent.
                    log::warn!("CLI --record failed: {e}");
                    feedback(app, CliFeedback::ActionFailed { action: "record".into() });
                }
            }
            Resolved::NotFound => feedback(app, CliFeedback::StreamNotFound { needle }),
            Resolved::InvalidUrl => feedback(app, CliFeedback::InvalidUrl { needle }),
        },

        Action::Play(needle) => match resolve_stream_id(app, &needle).await {
            Resolved::Found(id) => {
                if let Err(e) = crate::commands::player_commands::play_stream(
                    id,
                    app.state::<AppState>(),
                    app.clone(),
                )
                .await
                {
                    log::warn!("CLI --play failed: {e}");
                    feedback(app, CliFeedback::ActionFailed { action: "play".into() });
                }
            }
            Resolved::NotFound => feedback(app, CliFeedback::StreamNotFound { needle }),
            Resolved::InvalidUrl => feedback(app, CliFeedback::InvalidUrl { needle }),
        },

        Action::WishAdd(pattern) => {
            match crate::commands::wishlist_commands::add_to_wishlist(
                pattern.clone(),
                app.state::<AppState>(),
            )
            .await
            {
                Ok(_) => {
                    feedback(app, CliFeedback::WishlistAdded { pattern });
                    // Refresh the wishlist panel (no existing event for CLI changes).
                    let _ = app.emit("wishlist-changed", ());
                }
                Err(e) => {
                    log::warn!("CLI --wish-add failed: {e}");
                    feedback(app, CliFeedback::ActionFailed { action: "wish-add".into() });
                }
            }
        }

        Action::WishRemove(pattern) => {
            match crate::commands::wishlist_commands::remove_from_wishlist(
                pattern.clone(),
                app.state::<AppState>(),
            )
            .await
            {
                Ok(_) => {
                    feedback(app, CliFeedback::WishlistRemoved { pattern });
                    let _ = app.emit("wishlist-changed", ());
                }
                Err(e) => {
                    log::warn!("CLI --wish-remove failed: {e}");
                    feedback(app, CliFeedback::ActionFailed { action: "wish-remove".into() });
                }
            }
        }
    }
}
```

- [ ] **Step 3: Verify it builds**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds successfully (note: clippy may warn `handle_args` / `execute` are not yet used at the new call sites — that is fine; callers are wired in Tasks 8–10).

- [ ] **Step 4: Re-run the cli tests (no regression)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cli::tests`
Expected: all pure-layer tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cli.rs
git commit -m "feat(cli): async execute() dispatch reusing IPC command logic"
```

---

## Task 8: `lib.rs` startup integration — early parse, deferred exit, --profile, --minimize, StartupPlan

`run()` parses its own argv early (so `--profile` can pick the profile before `AppState::new`), but the `exit` decision moves to the **start of `.setup`** (reachable only by the first instance — the second dies inside the single-instance plugin's setup hook before `.setup` runs). The Phase 3E `handle_args` call is removed from `.setup`.

**Files:**
- Modify: `src-tauri/src/lib.rs:41-132` (the `run()` function up to the end of `.setup`)

- [ ] **Step 1: Add the early parse + `--profile` adjustment before the builder**

In `src-tauri/src/lib.rs`, replace this block (lines 41-55):

```rust
pub fn run() {
    // Phase 3E: relax the foreground lock as early as possible. In a second
    // instance this hands the foreground grant to the first instance before the
    // single-instance plugin terminates this process; in the first instance it
    // is harmless. Must run before tauri::Builder (the plugin would exit a
    // second instance before any later code runs).
    single_instance::allow_foreground_handoff();

    // Create data dirs before anything reads/writes them: the log plugin targets
    // logs_dir() and GlobalSettings::load() may write default settings.json.
    portable::ensure_data_dirs().expect("Failed to create data directories");

    // Load settings once, before the builder, so the log plugin (which is built
    // at startup and cannot change afterwards) reflects the user's choices.
    let initial_settings = GlobalSettings::load().expect("Failed to load settings");
```

with:

```rust
pub fn run() {
    // Phase 3E: relax the foreground lock as early as possible. In a second
    // instance this hands the foreground grant to the first instance before the
    // single-instance plugin terminates this process; in the first instance it
    // is harmless. Must run before tauri::Builder (the plugin would exit a
    // second instance before any later code runs).
    single_instance::allow_foreground_handoff();

    // Phase 3G: parse our own argv early (so --profile can pick the profile
    // before AppState::new). args_os, not args: args() panics on invalid UTF-16,
    // and Cyrillic in names/paths is real. We do NOT exit here — this code also
    // runs in a second instance (the plugin kills it later, inside its own setup
    // hook). An early exit(2) here would eat the forwarding. The exit decision is
    // in .setup below, which only the first instance reaches.
    let argv: Vec<String> = std::env::args_os()
        .map(|s| s.to_string_lossy().into_owned())
        .collect();
    let parsed: Result<cli::Cli, clap::Error> = cli::parse(&argv);

    // Create data dirs before anything reads/writes them: the log plugin targets
    // logs_dir() and GlobalSettings::load() may write default settings.json.
    portable::ensure_data_dirs().expect("Failed to create data directories");

    // Load settings once, before the builder, so the log plugin (which is built
    // at startup and cannot change afterwards) reflects the user's choices.
    let mut initial_settings = GlobalSettings::load().expect("Failed to load settings");

    // --profile: pick the profile BEFORE AppState::new so we load the right one
    // directly (not Default -> switch). Session-only override (decision §7): we do
    // NOT save settings.json here. Only for an Ok parse; on Err we exit(2) in
    // .setup anyway. Existence is checked via Profile::list (Profile::load("Default")
    // would create a file as a side effect). Unknown name -> log warn + keep default.
    if let Ok(cli) = &parsed {
        if let Some(name) = &cli.profile {
            let known = Profile::list(&initial_settings.active_profile)
                .map(|metas| metas.iter().any(|m| &m.name == name))
                .unwrap_or(false);
            if known {
                initial_settings.active_profile = name.clone();
            } else {
                log::warn!("--profile: profile '{name}' does not exist, ignoring");
            }
        }
    }
```

> Note: `Profile` is already imported at `lib.rs:25` (`use profile::Profile;`). `cli` is already a module (`mod cli;` at line 20).

- [ ] **Step 2: Replace the top of `.setup` — deferred exit, window show/minimize, drop handle_args**

In `src-tauri/src/lib.rs`, replace the start of the `.setup` closure (lines 87-102):

```rust
        .setup(move |app| {
            // Show and focus the main window as early as possible — while the
            // OS foreground-activation grant from the user's launch is still
            // valid. The window is configured `visible: false` so its restored
            // position (tauri-plugin-window-state) is applied before it appears.
            // Showing it here (rather than from JS after data loads) ensures the
            // webview initializes while the window is already OS-foreground,
            // which NVDA requires to attach to the document and announce focus.
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }

            // Phase 3E: feed our own argv through the shared CLI seam.
            // No-op beyond logging until Phase 3G fills in parsing.
            crate::cli::handle_args(app.handle(), std::env::args().collect(), None);

            let settings = initial_settings;
```

with:

```rust
        .setup(move |app| {
            // Phase 3G: exit decision HERE, not before the builder. .setup is
            // reachable only by the first instance (the plugin terminated the
            // second earlier, in its own setup hook). try_parse_from does NOT
            // exit on help/version — it returns Err and WE exit. No console text
            // (release has windows_subsystem = "windows") — exit code only.
            let cli = match parsed {
                Ok(c) => c,
                Err(e) => {
                    use clap::error::ErrorKind::*;
                    match e.kind() {
                        DisplayHelp | DisplayHelpOnMissingArgumentOrSubcommand
                        | DisplayVersion => std::process::exit(0),
                        _ => std::process::exit(2), // parse-error, before showing the window
                    }
                }
            };

            // Show and focus the main window as early as possible — while the
            // OS foreground-activation grant from the user's launch is still
            // valid. The window is configured `visible: false` so its restored
            // position (tauri-plugin-window-state) is applied before it appears.
            // Showing it here (rather than from JS after data loads) ensures the
            // webview initializes while the window is already OS-foreground,
            // which NVDA requires to attach to the document and announce focus.
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.show();
                let _ = main_window.set_focus(); // webview inits in foreground (NVDA)
                if cli.minimize {
                    // --minimize = start in the tray. hide(), NOT minimize() (that
                    // is the taskbar). NVDA already attached above before we hide.
                    let _ = main_window.hide();
                    crate::tray::notify_state_changed(app.handle());
                }
            }

            let settings = initial_settings;
```

- [ ] **Step 3: Manage the StartupPlan at the end of `.setup`**

In `src-tauri/src/lib.rs`, find the end of the `.setup` closure (the `smtc::init(app.handle(), smtc_enabled);` line followed by `Ok(())`, lines 130-131). Insert the StartupPlan setup between them:

```rust
            smtc::init(app.handle(), smtc_enabled);

            // Phase 3G: do NOT run the actionable flags here — the webview is not
            // yet subscribed to events (it subscribes after its initial data load,
            // then calls frontend_ready). Running now would emit recording-status /
            // cli-feedback before subscription -> lost announcements (the same gate
            // the scheduler uses). Stash the plan; frontend_ready drains it.
            // profile is already applied above, so plan(cli, Startup)'s
            // SwitchProfile action is a no-op in execute.
            let startup_plan = cli::plan(cli, cli::CliContext::Startup);
            app.manage(cli::StartupPlan::new(startup_plan));

            Ok(())
```

- [ ] **Step 4: Verify it builds**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds. `single_instance.rs` still calls `cli::handle_args`, so `handle_args` is still used — no dead-code error yet.

- [ ] **Step 5: Run cli tests + lib tests (no regression)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cli:: rotation_`
Expected: cli pure-layer tests + `rotation_true_keeps_one_false_keeps_all` pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(cli): startup integration — early parse, deferred exit, --profile/--minimize, StartupPlan"
```

---

## Task 9: Drain `StartupPlan` from `frontend_ready`

The startup `execute` spawns from `frontend_ready` (alongside `scheduler.start`), so every startup `cli-feedback` / status event fires *after* the webview has subscribed. `take()` makes a webview reload safe.

**Files:**
- Modify: `src-tauri/src/commands/app_commands.rs`

- [ ] **Step 1: Replace `frontend_ready`**

Replace the entire contents of `src-tauri/src/commands/app_commands.rs` with:

```rust
use crate::app_state::AppState;
use tauri::Manager;

/// Ready-сигнал webview (§3.5): scheduler стартує лише після нього, інакше
/// catch-up першого тіка емітив би scheduled-started до підписки frontend —
/// втрачене озвучення. Phase 3G: так само дренажимо стартовий CLI-план
/// (StartupPlan) — дії озвучуються лише після підписки webview. Ідемпотентна:
/// scheduler.start — no-op на повторі; StartupPlan.take() — порожньо на повторі.
#[tauri::command]
pub async fn frontend_ready(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.scheduler.start(app.clone());

    if let Some(startup) = app.try_state::<crate::cli::StartupPlan>() {
        if let Some(plan) = startup.take() {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                crate::cli::execute(&app, plan).await;
            });
        }
    }
    Ok(())
}
```

> `scheduler.start` previously took `app` by value; it is now `app.clone()` so `app` remains usable for the StartupPlan drain. `try_state` (not `state`) is defensive — it returns `None` rather than panicking if the plan was somehow not managed.

- [ ] **Step 2: Verify it builds**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/app_commands.rs
git commit -m "feat(cli): drain StartupPlan from frontend_ready after webview subscribes"
```

---

## Task 10: `single_instance.rs` forwarded flow + remove `handle_args`

Replace the `handle_args` tail of `on_second_instance` with a `spawn` that parses, plans for `Forwarded`, and executes — keeping the proven window-activation synchronous and before the spawn (while the foreground grant is valid). A real parse-error announces `InvalidArgs` (this branch is now reachable, since the second instance forwards raw argv and does not exit on its own parse). Then delete the now-unused `handle_args`.

**Files:**
- Modify: `src-tauri/src/single_instance.rs:18-56`

- [ ] **Step 1: Replace `on_second_instance`**

In `src-tauri/src/single_instance.rs`, replace the function (lines 44-56):

```rust
/// Runs in the FIRST instance when a second is launched. (The second instance
/// never runs this — it exits inside the plugin's setup hook.)
fn on_second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    if let Some(window) = app.get_webview_window("main") {
        // Same proven order as the tray "Show" action (tray/handlers.rs):
        // show -> unminimize -> set_focus; set_focus MUST be last.
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    crate::tray::notify_state_changed(app); // tray menu: visibility changed
    crate::cli::handle_args(app, argv, Some(cwd)); // proxy argv -> Phase 3G seam
}
```

with:

```rust
/// Runs in the FIRST instance when a second is launched. (The second instance
/// never runs this — it exits inside the plugin's setup hook.)
fn on_second_instance(app: &AppHandle, argv: Vec<String>, _cwd: String) {
    if let Some(window) = app.get_webview_window("main") {
        // Same proven order as the tray "Show" action (tray/handlers.rs):
        // show -> unminimize -> set_focus; set_focus MUST be last. Done
        // synchronously, before the spawn, while the foreground grant is valid.
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    crate::tray::notify_state_changed(app); // tray menu: visibility changed

    // Phase 3G: do NOT block the callback. It runs on the UI thread under the
    // second instance's synchronous SendMessageW(WM_COPYDATA) (spec 3E §5) — the
    // second instance is blocked until we return. Action execution (async, holds
    // manager/player locks) goes to the runtime so the callback returns instantly.
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match crate::cli::parse(&argv) {
            Ok(cli) => {
                crate::cli::execute(
                    &app,
                    crate::cli::plan(cli, crate::cli::CliContext::Forwarded),
                )
                .await
            }
            Err(e) => {
                use clap::error::ErrorKind::*;
                match e.kind() {
                    // help/version have nowhere to print (no console) — stay
                    // silent (NVDA already announced the window activation).
                    DisplayHelp | DisplayHelpOnMissingArgumentOrSubcommand
                    | DisplayVersion => {}
                    // A real parse-error: announce "invalid arguments". This is
                    // where the first instance voices it — the second forwarded
                    // raw argv and never exited on its own parse.
                    _ => crate::cli::feedback(&app, crate::cli::CliFeedback::InvalidArgs),
                }
            }
        }
    });
}
```

- [ ] **Step 2: Remove the now-unused `handle_args`**

In `src-tauri/src/cli.rs`, delete the `handle_args` function and its `use tauri::AppHandle;`-only purpose is gone, but `AppHandle` is still used by `feedback`/`execute`, so keep the import. Delete only:

```rust
/// Phase 3E seam — removed in Phase 3G Task 10 once both callers are migrated.
pub fn handle_args(_app: &AppHandle, argv: Vec<String>, cwd: Option<String>) {
    log::info!("CLI args (not yet interpreted, see Phase 3G): argv={argv:?}, cwd={cwd:?}");
}
```

- [ ] **Step 3: Verify the whole backend builds with no dead code**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds successfully, no `handle_args` references remain.

- [ ] **Step 4: Run the full backend test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests pass (cli pure layers + existing suites).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/single_instance.rs src-tauri/src/cli.rs
git commit -m "feat(cli): forwarded argv -> parse/plan/execute in single-instance callback; drop handle_args"
```

---

## Task 11: Frontend i18n keys + regenerate Paraglide

Add the seven `cli_*` message keys to both locales, then regenerate the compiled Paraglide message functions (the inlang vite plugin emits `src/i18n/paraglide/messages/*.js` on a vite build).

**Files:**
- Modify: `src/i18n/messages/uk.json:509` (last key — add trailing comma + new keys)
- Modify: `src/i18n/messages/en.json:509` (same)

- [ ] **Step 1: Add the Ukrainian keys**

In `src/i18n/messages/uk.json`, change the last data line (509):

```json
  "settings_schedule_pad_after": "Закінчувати пізніше, хв"
```

to (add a comma, then the seven keys):

```json
  "settings_schedule_pad_after": "Закінчувати пізніше, хв",
  "cli_wishlist_added": "Додано до списку бажань: {pattern}",
  "cli_wishlist_removed": "Видалено зі списку бажань: {pattern}",
  "cli_stream_not_found": "Потік не знайдено: {needle}",
  "cli_invalid_url": "Невалідна URL-адреса: {needle}",
  "cli_flag_ignored": "Прапор «{flag}» проігноровано при повторному запуску",
  "cli_action_failed": "Не вдалося виконати дію: {action}",
  "cli_invalid_args": "Невалідні аргументи командного рядка"
```

- [ ] **Step 2: Add the English keys**

In `src/i18n/messages/en.json`, change the last data line (509):

```json
  "settings_schedule_pad_after": "Stop later, min"
```

to:

```json
  "settings_schedule_pad_after": "Stop later, min",
  "cli_wishlist_added": "Added to wishlist: {pattern}",
  "cli_wishlist_removed": "Removed from wishlist: {pattern}",
  "cli_stream_not_found": "Stream not found: {needle}",
  "cli_invalid_url": "Invalid URL: {needle}",
  "cli_flag_ignored": "Flag \"{flag}\" ignored on repeated launch",
  "cli_action_failed": "Action failed: {action}",
  "cli_invalid_args": "Invalid command-line arguments"
```

- [ ] **Step 3: Regenerate the compiled Paraglide messages**

Run: `pnpm vite:build`
Expected: build succeeds; `src/i18n/paraglide/messages/cli_wishlist_added.js` (and the six others) now exist.

Verify the new functions were generated:

Run: `ls src/i18n/paraglide/messages/cli_*.js`
Expected: lists `cli_action_failed.js`, `cli_flag_ignored.js`, `cli_invalid_args.js`, `cli_invalid_url.js`, `cli_stream_not_found.js`, `cli_wishlist_added.js`, `cli_wishlist_removed.js`.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "i18n(cli): add cli_* feedback message keys (uk/en) + regenerate paraglide"
```

---

## Task 12: Frontend — `CliFeedbackPayload` type, `useCliFeedback`, `wishlist-changed` listener

Add the discriminated-union type mirroring the Rust `CliFeedback`, a hook that announces each `cli-feedback` (mirroring `useScheduleEvents`), and a `wishlist-changed` listener in `App.tsx` that refreshes the `$wishlist` store.

**Files:**
- Modify: `src/lib/tauri.ts` (add type near the other event payload types, e.g. after `WishlistMatchPayload`/`TrackIgnoredPayload` at line 261)
- Create: `src/hooks/useCliFeedback.ts`
- Modify: `src/App.tsx` (imports; add `wishlist-changed` handler + listener; call `useCliFeedback()`)

- [ ] **Step 1: Add the payload type to `tauri.ts`**

In `src/lib/tauri.ts`, immediately after the `TrackIgnoredPayload` interface (ends at line 261), add:

```typescript

/**
 * Backend `cli-feedback` event (Phase 3G). Mirrors the Rust `CliFeedback` enum
 * (#[serde(tag = "kind", rename_all = "kebab-case")]). Localized on the frontend.
 */
export type CliFeedbackPayload =
  | { kind: "wishlist-added"; pattern: string }
  | { kind: "wishlist-removed"; pattern: string }
  | { kind: "stream-not-found"; needle: string }
  | { kind: "invalid-url"; needle: string }
  | { kind: "flag-ignored-forwarded"; flag: string }
  | { kind: "action-failed"; action: string }
  | { kind: "invalid-args" };
```

- [ ] **Step 2: Create the `useCliFeedback` hook**

Create `src/hooks/useCliFeedback.ts`:

```typescript
import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { addToast } from "../stores/toasts";
import type { CliFeedbackPayload } from "../lib/tauri";
import * as m from "../i18n/paraglide/messages";

/**
 * Озвучення CLI-зворотного зв'язку (§5, рішення №6 — без мовчазних збоїв).
 * Той самий патерн, що useScheduleEvents: backend шле структурний ключ, фронт
 * локалізує через Paraglide й озвучує. *Added/Removed — polite + success-toast;
 * ActionFailed — assertive + error-toast; not-found / invalid-* / invalid-args —
 * assertive; ignored-flag — polite. Працює і в модалці (data-live-announcer).
 */
export function useCliFeedback(): void {
  const announce = useAnnounce();

  useTauriEvent<CliFeedbackPayload>(
    "cli-feedback",
    useCallback(
      (p) => {
        switch (p.kind) {
          case "wishlist-added": {
            const msg = m.cli_wishlist_added({ pattern: p.pattern });
            announce(msg, "polite");
            addToast(msg, "success");
            break;
          }
          case "wishlist-removed": {
            const msg = m.cli_wishlist_removed({ pattern: p.pattern });
            announce(msg, "polite");
            addToast(msg, "success");
            break;
          }
          case "stream-not-found":
            announce(m.cli_stream_not_found({ needle: p.needle }), "assertive");
            break;
          case "invalid-url":
            announce(m.cli_invalid_url({ needle: p.needle }), "assertive");
            break;
          case "flag-ignored-forwarded":
            announce(m.cli_flag_ignored({ flag: p.flag }), "polite");
            break;
          case "action-failed": {
            const msg = m.cli_action_failed({ action: p.action });
            announce(msg, "assertive");
            addToast(msg, "error");
            break;
          }
          case "invalid-args":
            announce(m.cli_invalid_args(), "assertive");
            break;
        }
      },
      [announce],
    ),
  );
}
```

- [ ] **Step 3: Wire it into `App.tsx` + add the `wishlist-changed` listener**

In `src/App.tsx`:

(a) Add the imports. After line 21 (`import { useProfileSync } from "./hooks/useProfileSync";`) add:

```typescript
import { useCliFeedback } from "./hooks/useCliFeedback";
```

After line 26 (`import { $playerStatus, $muteState } from "./stores/player";`) add:

```typescript
import { $wishlist } from "./stores/wishlist";
```

(b) Add a `wishlist-changed` handler next to `handleStreamsChanged` (after line 321):

```typescript
  const handleWishlistChanged = useCallback(() => {
    tauri.getWishlist().then((wl) => $wishlist.set(wl)).catch(console.error);
  }, []);
```

(c) Register the listener next to the `streams-changed` registration (after line 335 `useTauriEvent("streams-changed", handleStreamsChanged);`):

```typescript
  useTauriEvent("wishlist-changed", handleWishlistChanged);
```

(d) Call the hook next to the other global subscriptions (after line 344 `useProfileSync();`):

```typescript
  useCliFeedback();
```

- [ ] **Step 4: Verify the frontend builds**

Run: `pnpm vite:build`
Expected: build succeeds with no TypeScript errors in the changed files (the `CliFeedbackPayload` union is exhaustively matched; all `m.cli_*` functions resolve).

- [ ] **Step 5: Run the frontend test suite (no regression)**

Run: `pnpm test`
Expected: all vitest suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tauri.ts src/hooks/useCliFeedback.ts src/App.tsx
git commit -m "feat(cli): cli-feedback listener + wishlist-changed refresh on frontend"
```

---

## Task 13: Full verification gates + manual NVDA acceptance

Run every build/test gate, then walk the manual NVDA scenarios (the primary acceptance — the developer tests by ear). `tsc` is **not** a gate (the project has ~51 pre-existing untyped-Paraglide errors); the gates are `cargo build`, `cargo test`, `pnpm test`, `pnpm vite:build`.

**Files:** none (verification only)

- [ ] **Step 1: Backend build + tests**

Run: `cargo build --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: build OK; all tests pass (includes `cli::tests::*`: parse known/unknown/help/**version**, plan startup-vs-forwarded + ordering + combinations, find_stream name/url/priority/none, validate_needle http(s)/non-http, StartupPlan one-shot, CliFeedback serde tag).

- [ ] **Step 2: Frontend build + tests**

Run: `pnpm test && pnpm vite:build`
Expected: vitest green; vite build succeeds.

- [ ] **Step 3: Build the app for manual testing**

Run: `pnpm build:fast`
Expected: a runnable `tapir.exe` is produced under `src-tauri/target/release-fast/`.

- [ ] **Step 4: Manual NVDA scenarios (spec §7)**

With NVDA running, exercise each scenario against the built `tapir.exe`. Check off each:

  - [ ] 1. With an instance running: `tapir.exe --record "<name>"` → recording starts; NVDA announces both the window activation and "recording started".
  - [ ] 2. `--play <url>` with a known URL plays; with an unknown URL → "stream not found" announced.
  - [ ] 3. `--stop-recording` stops everything (announced).
  - [ ] 4. `--wish-add "*test*"` → wishlist panel refreshes; "added" announced (+ success toast).
  - [ ] 5. `--profile X --minimize` on a cold start → correct profile loaded, window starts in the tray (and NVDA still attached — see nvda-startup-foreground).
  - [ ] 6. `--profile X` with an instance running → ignored + warn logged + "ignored on repeated launch" announced; active recordings are NOT stopped.
  - [ ] 7. An invalid flag on a cold start → process does not start (exit 2); an ordinary double-click still works as before.
  - [ ] 8. **frontend_ready gate:** `--record "<name>"` on a **cold** start (no instance yet) → despite the action firing at startup, NVDA still announces "recording started" (announcement not lost before webview subscribed).
  - [ ] 9. **Action failure:** `--record "<name>"` with the disk below the space threshold → "action failed" announced + error toast (not silence).
  - [ ] 10. Invalid flag with an instance **running** → instance 1 survives; instance 2 silently forwards and exits 0; instance 1 announces "invalid arguments".

- [ ] **Step 5: Verify exit codes (scripted scenario)**

From a shell, with no instance running:

Run: `src-tauri/target/release-fast/tapir.exe --nope; echo "exit=$?"`
Expected: `exit=2` (parse-error, no window shown).

Run: `src-tauri/target/release-fast/tapir.exe --version; echo "exit=$?"`
Expected: `exit=0` (no visible text — documented limitation).

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

Only if Steps 1–5 surfaced fixes; otherwise this task closes with the work already committed.

```bash
git add -A
git commit -m "test(cli): Phase 3G verification fixes"
```

---

## Done-criteria mapping (spec §8)

| Spec §8 criterion | Task |
|---|---|
| `--record`/`--play` by match; not-found → announce, profile unchanged; failure → announce | 4, 7, 12 |
| `--stop-recording`/`--stop-playback` reuse existing paths | 7 |
| `--wish-add`/`--wish-remove` manage active-profile wishlist + refresh panel | 7, 12 |
| `--profile NAME` startup-only; forwarded ignore+warn | 3, 8, 7 |
| `--minimize` start in tray, startup-only; forwarded ignore+warn | 3, 8, 7 |
| Repeated launch proxies argv (from 3E) | 10 |
| Every action/edge → toast + aria-live; startup gated on `frontend_ready` | 6, 9, 11, 12 |
| Exit codes: first instance `exit(2)` on parse-error at start of `.setup`, else 0; forwarded always 0 | 8, 10 |
| `parse`/`plan`/`find_stream`/URL validation unit-tested (incl. `--version`→`DisplayVersion`) | 2, 3, 4 |
