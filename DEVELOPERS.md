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

`just check-rust` runs both backend gates: `cargo clippy --all-targets`, then `cargo test`.

Clippy is a **gate, not a suggestion**. Its level is set once, by the `[lints.clippy]`
section of `src-tauri/Cargo.toml`, which denies the whole `clippy::all` group. No call
site has to remember `-D warnings`, and an editor, a terminal and the CI job all
reach the same verdict. `--all-targets` is what reaches test code; without it clippy
never looks at `#[cfg(test)]` modules. Plain `cargo build` and `cargo test` are
unaffected: rustc ignores `clippy::` lints.

A lint that is genuinely wrong in one place is silenced there —
`#[allow(clippy::…)]` with a comment saying why — never by lowering the crate-wide level.

The four frontend gates (`pnpm vite:build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`)
run together as `just check`, in that order: `vite:build` generates
`src/i18n/paraglide/` on disk, and both `tsc` and the tests read that output.

### Continuous Integration

The same six gates run on GitHub Actions — for every pull request into `develop`, for
every push to `develop`, and on demand. The workflow is
[`.github/workflows/ci.yml`](.github/workflows/ci.yml); it is the source of truth for
what runs, and this section only explains how to read it.

`develop` is protected: both checks are required, and nobody — the repository owner
included — can merge past a red one. A direct push to the trunk is refused outright.

Two jobs, both on `windows-latest`, and their ids are the names GitHub shows as required
checks:

- **`frontend`** — installs from the lockfile, then runs the four frontend gates. Its
  step list mirrors `just check`, order included; a gate added to one has to be added to
  the other.
- **`backend`** — the two Rust gates, with no Node and no `dist/`. In the dev profile
  `generate_context!` embeds empty assets, so nothing there reads the frontend build.

**Reading a failure.** The split is for exactly this. The pull-request page names the two
checks, so the status alone says which half broke before you open anything; inside a job
every gate is a separate named step, and its log holds that gate's output and nothing
else. There is no retry anywhere in the workflow: a red run means a gate said no, and it
is worth a diagnosis rather than a re-run button.

**Cache.** Only the run on `push: develop` writes it; pull-request runs read. Nothing about
it weakens the verdict: `actions/checkout` gives a fresh tree every time, `dist/` is never
cached, and `--frozen-lockfile` reinstalls from the lock — so "does this still build from a
clean clone" stays a question the gates actually answer.

Why the gates refuse instead of advise, and which alternatives were rejected —
[ADR](docs/decisions/2026-09-05-gates-refuse-rather-than-advise.md).

Additional technical documentation is available in the `docs/` folder:
- `docs/architecture.md`
- `docs/tech-stack.md`
- `docs/data-models.md`
