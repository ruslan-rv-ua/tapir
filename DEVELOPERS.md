<!--
  AUDIENCE: developers and advanced users.
  This is where technical detail goes so it does not clutter README.md:
  formats and protocols, CLI flags, pattern syntax, system internals, pointers
  into docs/. Anything an end user needs in order to download, run and use
  Tapir belongs in README.md instead.
  Agent/contributor guidelines live in AGENTS.md.
-->

# Tapir: Technical Overview and Developer Guide

This file contains advanced technical details about the Tapir application.

## Technical Capabilities

- **Formats and Protocols**: Supports recording audio from ICY, Icecast, and SHOUTcast streams in MP3 and AAC formats.
- **Metadata (ID3 / M4A)**: ID3 tags are automatically extracted from the stream metadata and written into each saved file.
- **System Requirements**: Windows 11+ (x64). WebView2 runtime is required (present on Windows 11). The app is portable: no installer, and everything Tapir decides for itself lives in `data\` next to the executable. It is not invisible to the system, though — see *What Tapir leaves behind* below.
- **CLI Arguments**: Launch the app with `--record`, `--play`, `--stop-recording`, `--stop-playback`, `--wish-add`, `--wish-remove`, `--profile` or `--minimize` (plus `--help` and `--version`). Passing an action flag to an already running copy forwards it to that copy instead of starting a second instance; `--profile` and `--minimize` only apply at startup and are ignored when forwarded.
- **Single Instance & Crash Recovery**: A dedicated mechanism ensures only one instance runs at a time. It also automatically resumes interrupted recordings on the next launch if a sudden crash occurs.
- **Stream Export/Import**: Station lists can be imported and exported as `M3U8` / `PLS` files.

## What Tapir Leaves Behind

Portable means *everything Tapir decides lives in `data\`* — settings, profiles, streams,
wishlist, crash-recovery state, logs and the window geometry. It does not mean the machine
stays untouched. Three traces are left by the platform, on purpose:

- **WebView2 profile** — `%LOCALAPPDATA%\ua.ruslanrv.tapir\EBWebView`, a browser-engine cache that
  grows to a hundred megabytes or more. Tauri forces this path unless the main window is built
  from Rust code instead of `tauri.conf.json`, which would rewrite the startup sequence the
  screen reader depends on. Deliberately left alone — see the ADR below.
- **`AppUserModelId`** — one key under `HKCU\Software\Classes\AppUserModelId`, written at startup. Without it
  Windows drops the app's toast notifications.
- **`Run` value** — under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, added only while
  autostart is enabled and removed when you turn it off.

Builds before 0.1.0 also stored the window geometry in
`%APPDATA%\ua.ruslanrv.tapir\.window-state.json`, and earlier builds used the identifiers
`com.tapir.app` and `dev.tapir.app`.
The current build never writes to any of them; delete those folders by hand if you have them.

Rationale and the rejected alternatives: [ADR — межа портативності](docs/decisions/2026-09-04-portable-boundary.md).

## Wishlist and Ignorelist Pattern Syntax

The Wishlist and Ignorelist features use a specific pattern syntax to filter tracks:

| Pattern | Matches |
|---------|---------|
| `Tycho*` | "Tycho - Dive", "Tycho - Awake", "Tycho Live" |
| `*jingle*` | "Station Jingle 3", "Intro Jingle", "daily jingle" |
| `T?cho - *` | "Tycho - Dive", "Ticho - Anything" |
| `Portishead - Glory Box` | Exactly this track |

- `*` — Any number of characters (including zero characters);
- `?` — Exactly one character;
- Pattern matching is **case-insensitive**.

**Rule Application Priority:**
1. Per-stream ignorelist — track is skipped.
2. Global ignorelist — track is skipped.
3. Wishlist — track is recorded normally, and the screen reader announces it.
4. No match — track is recorded and processed normally.

## Developer Information

Tapir is built using **React** (frontend) and **Rust / Tauri** (backend).

Please refer to [AGENTS.md](AGENTS.md) for a general architecture overview, build environment requirements, and coding conventions. 

### Gates

Two commands guard the backend, run from the repository root (or as `just check-rust`):

```
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
cargo test --manifest-path src-tauri/Cargo.toml
```

Clippy is a **gate, not a suggestion**. The level lives in `src-tauri/Cargo.toml`:

```toml
[lints.clippy]
all = "deny"
```

Everything in the `clippy::all` group is therefore an error, and no call site has to
remember `-D warnings` — an editor, a terminal and a future CI job all get the same
verdict. `--all-targets` is what reaches test code; without it clippy never looks at
`#[cfg(test)]` modules. Regular `cargo build` and `cargo test` are unaffected: rustc
ignores `clippy::` lints.

A lint that is genuinely wrong in one place is silenced there —
`#[allow(clippy::…)]` with a comment saying why — never by lowering the crate-wide level.

The three frontend gates (`pnpm vite:build`, `pnpm test`, `pnpm typecheck`) run together
as `just check`.

Additional technical documentation is available in the `docs/` folder:
- `docs/architecture.md`
- `docs/tech-stack.md`
- `docs/data-models.md`
