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
- **System Requirements**: Windows 11+ (x64). The app is fully portable and doesn't touch the system registry or AppData. WebView2 runtime is bundled/required under the hood.
- **CLI Arguments**: Launch the app with command-line arguments like `--profile`, `--start-recording`, and other flags.
- **Single Instance & Crash Recovery**: A dedicated mechanism ensures only one instance runs at a time. It also automatically resumes interrupted recordings on the next launch if a sudden crash occurs.
- **Stream Export/Import**: Station lists can be imported and exported as `M3U8` / `PLS` files.

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

Additional technical documentation is available in the `docs/` folder:
- `docs/architecture.md`
- `docs/tech-stack.md`
- `docs/data-models.md`
