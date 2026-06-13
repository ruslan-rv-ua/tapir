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
use crate::app_state::AppState;
use crate::profile::StreamInfo;

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

use tauri::{AppHandle, Emitter, Manager};

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
}
