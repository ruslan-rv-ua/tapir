<!--
  AUDIENCE: end users first, contributors second.
  One entry per user-visible change, newest version on top, grouped under
  Added / Changed / Deprecated / Removed / Fixed / Security.
  Write for the person using Tapir, not for the diff: no commit hashes, no file
  names, no internal refactors that change nothing on screen.
  Version headings must match `src-tauri/Cargo.toml` — the only file that
  carries the version. While a version is still in development its heading
  reads `Unreleased`; the release turns that into an ISO date (YYYY-MM-DD).
  A version heading is a line beginning `## [`; the release workflow publishes
  the section under the heading that matches the tag, and refuses the release
  when that section is missing or empty (docs/release.md).
-->

# Changelog

All notable changes to Tapir are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and Tapir uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — Unreleased

### Fixed

- The **LIVE** badge in the player no longer looks like a recording. It was a pulsing red
  dot — the same mark a stream row shows while it writes to disk — on a badge that only
  ever meant «the sound is a station on air, not a file». It is now still, green, and
  carries a broadcast tower; what a screen reader announces is unchanged.

## [0.1.0] — 2026-09-07

The first public build. Everything below is new.

### Added

- **Listening and recording** of internet radio streams (ICY, Icecast, SHOUTcast) in MP3 and
  AAC. A stream can be recorded while you listen to it or to something else.
- **Automatic track splitting.** Tapir watches the station's now-playing metadata, cuts the
  recording at every change and writes artist and title tags into each file. Incomplete first
  and last tracks are named by their own template and can be discarded.
- **Continuous file** of the whole broadcast, alongside the split tracks, as an option per stream.
- **Wishlist and ignorelist.** Patterns with `*` and `?` against `Artist - Title`: a wishlist
  match is announced and logged in the session's match log; an ignorelist match is not saved as
  a separate file.
- **Station browser** over the community Radio Browser directory: search, filters by codec,
  country and tags, a preview before adding, and «Load more» at the end of the results.
- **Songs** — every recorded track in one place: play, delete to the Recycle Bin, edit tags,
  open with the default app.
- **Scheduler** for one-off and weekly recordings, per profile.
- **Profiles.** Each holds its own streams, wishlist, ignorelist, schedule and recording
  settings; streams can be copied or moved between profiles.
- **System tray** with a menu for recording and playback; the window can start minimized.
- **Global hotkeys** for record, play/stop, volume, previous/next and show/hide, configurable
  in Settings, working from any application.
- **Crash recovery.** Recordings that were running when the app or the machine went down are
  resumed on the next start.
- **Command line.** `--record`, `--play`, `--stop-recording`, `--stop-playback`, `--wish-add`,
  `--wish-remove`, `--profile`, `--minimize`; a second copy forwards the action to the running one.
- **Import and export** of station lists as M3U8 and PLS.
- **Built-in help** (`F1`) in English and Ukrainian, and an interface in both languages.
- **Screen readers.** Built for NVDA, JAWS and Narrator: every control is labeled, state changes
  are spoken, and everything spoken has a visible counterpart.
- **Portable.** One executable; settings live in `data\` and recordings in `recordings\` next to
  it.

### Known limitations

- HE-AAC (AAC+) streams record correctly but do not play back inside Tapir.
- OGG, FLAC and other formats Tapir cannot write are refused rather than recorded under a
  wrong name.
- The executable is not code-signed: Windows SmartScreen shows a warning on the first run of a
  browser download. The keyboard path through it is in the README; installing through scoop
  shows no warning.
