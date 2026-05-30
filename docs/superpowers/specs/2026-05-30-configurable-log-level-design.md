# Configurable log level + diagnostics settings — design

Date: 2026-05-30
Branch: `feat/configurable-log-level`

## Problem

Logging is hard-coded in [`src-tauri/src/lib.rs`](../../../src-tauri/src/lib.rs) lines 26–37: the
`tauri-plugin-log` builder always uses `LevelFilter::Debug`, `RotationStrategy::KeepOne`, and a
10 MB `max_file_size`. Meanwhile `GlobalSettings` already declares `log_rotation: bool` and
`log_max_size_mb: u32` (and these are mirrored in the TypeScript `GlobalSettings` type), but **neither
field is read by the plugin init, nor surfaced in any settings UI** — they are dead settings.

This work adds a user-configurable **log level** and, in the same change, finishes the diagnostics
block by wiring the two existing dead fields to the plugin and to the UI.

### Audience constraint

Tapir targets blind end users on Windows (NVDA), mostly non-engineers. The primary diagnostics
control must be understandable without knowing syslog levels; full control is available but tucked
away.

## Goals

- Add a `log_level` setting that controls the file/stdout log verbosity.
- Wire `log_level`, `log_rotation`, and `log_max_size_mb` to the `tauri-plugin-log` builder.
- Surface all three in the General settings tab: a simple verbose toggle on top, full controls in a
  collapsible "Advanced" block.
- Preserve current default behavior where it matters (rotation = KeepOne), while defaulting the new
  log level to `Info` (cleaner release logs than the current de-facto `Debug`).

## Non-goals (YAGNI)

- Runtime log-level switching without restart (the plugin builds once at startup; `tauri-plugin-log`
  cannot change the filter after init).
- Custom log file paths.
- Per-module log levels.

## 1. Backend (Rust)

### `src-tauri/src/settings.rs`

Add an enum and a field:

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    #[default]
    Info,
    Debug,
    Trace,
}

impl LogLevel {
    pub fn to_filter(self) -> log::LevelFilter {
        match self {
            LogLevel::Error => log::LevelFilter::Error,
            LogLevel::Warn => log::LevelFilter::Warn,
            LogLevel::Info => log::LevelFilter::Info,
            LogLevel::Debug => log::LevelFilter::Debug,
            LogLevel::Trace => log::LevelFilter::Trace,
        }
    }
}
```

Add to `GlobalSettings`:

```rust
#[serde(default)]
pub log_level: LogLevel,   // defaults to Info
```

Update the `Default for GlobalSettings` impl to set `log_level: LogLevel::Info`.

Backward compatibility: `#[serde(default)]` means an existing `settings.json` without `logLevel`
deserializes to `Info`.

### `src-tauri/src/lib.rs`

Reorder `run()` so settings are available before the plugin is built:

1. Call `portable::ensure_data_dirs()` at the very top of `run()` (before `tauri::Builder::default()`)
   so `logs_dir()` and `settings_path()` and their parents exist before either the plugin or
   `GlobalSettings::load()` (which may `save()` defaults) touches them.
2. `let initial_settings = GlobalSettings::load().expect("Failed to load settings");` **before** the
   builder.
3. Configure the plugin from `initial_settings`:
   - `.level(initial_settings.log_level.to_filter())`
   - `.max_file_size(initial_settings.log_max_size_mb as u64 * 1_048_576)`
   - `.rotation_strategy(rotation_strategy_for(initial_settings.log_rotation))`
4. Move `initial_settings` into the `.setup(move |app| { ... })` closure and reuse it instead of
   loading a second time. The existing `ensure_data_dirs()` call inside `setup` is removed (now done
   at the top).

Rotation mapping (preserves current default behavior):

```rust
fn rotation_strategy_for(keep_recycling: bool) -> RotationStrategy {
    if keep_recycling {
        RotationStrategy::KeepOne // default: bounded disk (~2x max size), == current behavior
    } else {
        RotationStrategy::KeepAll // opt-in: full history for deep diagnostics
    }
}
```

So `log_rotation = true` (default) -> `KeepOne` (unchanged from today); `false` -> `KeepAll`.

### Restart semantics

Level/rotation/size are applied only when the plugin is built at startup. Changing them in settings
takes effect on the next launch. This is communicated to the user via UI helper text — not enforced
in code.

## 2. Frontend (UI + i18n)

### `src/lib/tauri.ts`

Add to the `GlobalSettings` interface:

```ts
logLevel: "error" | "warn" | "info" | "debug" | "trace";
```

### `src/components/settings/GeneralTab.tsx`

New "Logging" section appended to the General tab.

**Always visible:** a checkbox **"Detailed logging for diagnostics"** plus helper text
("Helps the developer find the cause of a problem. Takes effect after restart.").

Single source of truth is `logLevel`. The checkbox is a simplified view:

- `isSelected = logLevel === "debug" || logLevel === "trace"`
- on check -> set `logLevel: "debug"` (leave `trace` as-is if already trace — i.e. only change when
  currently not debug/trace)
- on uncheck -> set `logLevel: "info"`

**Collapsible "Advanced"** using a native `<details>/<summary>` element (robust and accessible for
NVDA, no dependency on a specific react-aria version):

- `Select` for the full level: Error / Warn / Info / Debug / Trace, bound to `logLevel`.
- `Checkbox` "Keep full log history" = inverted `logRotation` (checked -> `logRotation: false` ->
  KeepAll).
- `NumberField` "Max file size (MB)" bound to `logMaxSizeMb`, min 1, max 100, step 1.

All controls use the existing `update()` / `useAutoSave()` pattern already in `GeneralTab.tsx`.

### i18n — `src/i18n/messages/en.json` and `uk.json`

New keys (English values shown; Ukrainian translations added in parallel):

- `settings_logging`: "Logging"
- `settings_log_verbose`: "Detailed logging for diagnostics"
- `settings_log_verbose_desc`: "Helps the developer find the cause of a problem. Takes effect after restart."
- `settings_log_advanced`: "Advanced"
- `settings_log_level`: "Log level"
- `settings_log_level_error`: "Error"
- `settings_log_level_warn`: "Warning"
- `settings_log_level_info`: "Info"
- `settings_log_level_debug`: "Debug"
- `settings_log_level_trace`: "Trace"
- `settings_log_keep_history`: "Keep full log history"
- `settings_log_max_size`: "Max log file size (MB)"

## 3. Testing / verification

### Rust unit tests (in `settings.rs`)

- `LogLevel::to_filter` maps each variant to the correct `LevelFilter`.
- `LogLevel::default()` is `Info`.
- Deserializing a `settings.json` payload **without** `logLevel` yields `log_level == Info`
  (backward compatibility).
- serde round-trip: serialize then deserialize a `GlobalSettings` preserves `log_level`.

### Manual verification

- `cargo build` (or `cargo test`) passes.
- Frontend typecheck / `pnpm build` passes.
- Launch the app, toggle "Detailed logging", restart, confirm the verbosity in
  `data/logs/tapir.log` changed accordingly. Open Advanced, change level explicitly, confirm the
  checkbox reflects it.

## Files touched

- `src-tauri/src/settings.rs` — `LogLevel` enum, field, default, tests.
- `src-tauri/src/lib.rs` — reorder init, wire plugin from settings, rotation mapping.
- `src/lib/tauri.ts` — `logLevel` on `GlobalSettings`.
- `src/components/settings/GeneralTab.tsx` — Logging section + Advanced block.
- `src/i18n/messages/en.json`, `src/i18n/messages/uk.json` — new keys.
- `docs/data-models.md` — update the `GlobalSettings` documentation to include `logLevel`.

## Revision (as implemented)

After review of what logging the app actually emits, the design above was amended:

1. **Trace level dropped.** The app contains zero `trace!` calls; enabling Trace only surfaced
   dependency internals (hyper/reqwest wire logs, symphonia packet-level) — high volume, low signal,
   and a credential-leak risk (request headers for password-protected streams). `LogLevel` is now
   **`error | warn | info | debug`** (4 variants). The `settings_log_level_trace` key and the Trace
   `<ListBoxItem>` are removed. The verbose checkbox simplifies to `isSelected = logLevel === "debug"`,
   on→`debug`, off→`info`.

2. **Per-module filtering** (previously a non-goal). The user's level applies to our crate only:
   `.level(dep_filter).level_for("tapir_lib", app_filter)` where `dep_filter = app_filter.min(Info)`.
   So "detailed logging" means detailed *app* logs while dependencies stay at Info — quiet and safe.

3. **Single logging facade.** The codebase mixed `tracing::` and `log::`, but `tauri-plugin-log` only
   consumes `log`; the `tracing::*` calls had no subscriber/bridge and likely never reached the file.
   All `tracing::` usages were converted to `log::`, and the `tracing` / `tracing-log` dependencies
   were removed.

4. **Added diagnostic `debug!` points** so the new level is actually useful: reconnect attempts +
   backoff delay (`stream/manager.rs`), raw ICY `StreamTitle` metadata (`stream/manager.rs`),
   track-split decisions in `handle_splitter_action` (`stream/manager.rs`), and probed
   codec/sample-rate/channels in `LiveSource::new` (`player/engine.rs`).
