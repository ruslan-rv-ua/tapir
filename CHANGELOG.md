# Changelog

All notable changes to Tapir, for the person who downloads it. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions are
[semver](https://semver.org/). A version heading is a line beginning `## [`, and the
release workflow publishes the section under the heading that matches the tag — an empty
or missing section refuses the release.

## [0.1.0] - unreleased

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
