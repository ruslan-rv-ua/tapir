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
}
