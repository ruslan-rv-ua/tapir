# Tapir

> **Status: Early development — not yet ready for end users.**

A Windows desktop application for recording internet radio streams. Supports ICY/Icecast/SHOUTcast, automatic track splitting, and ID3 tag writing. Portable — runs from a single `.exe` file, no installation required.

**Platform:** Windows 11+ · Portable EXE  
**Screen readers:** NVDA · JAWS · Narrator

---

## Features

### Available now

- **Record internet radio streams** — supports ICY/Icecast/SHOUTcast (MP3, AAC)
- **Automatic track splitting** — splits recordings into individual tracks based on stream metadata
- **ID3 / M4A tags** — automatically written to each recorded file
- **Live playback** — listen to a stream while recording, with volume control and audio device selection
- **Wishlist & Ignorelist** — automatically save only the tracks you want
- **Stream Browser** — search and add stations from the Radio Browser community directory
- **Saved Songs Manager** — browse, play, and edit tags of your recorded files
- **System Tray** — minimize to tray, balloon notifications, tray menu
- **Settings** — recording folder, file naming templates, reconnection policy, global hotkeys, audio output device
- **Profile Manager** — create, switch, rename, duplicate, delete profiles; import/export `.tapirprofile` files

### Planned

| Feature | Status |
|---------|--------|
| Scheduler — timed and recurring recordings | Planned |
| CLI arguments | Planned |
| Post-processing — run external tools after recording | Planned |
| High Contrast theme, autostart, log rotation | Planned |

---

## Requirements

- Windows 11 (x64)
- No additional software needed — WebView2 runtime is bundled

---

## Getting Started

1. Download `tapir.exe` from the [Releases](../../releases) page *(not yet available — in development)*
2. Place it in any folder (e.g. `C:\Tools\Tapir\`)
3. Run `tapir.exe`

All data (settings, profiles, recordings) is stored in a `data\` subfolder next to the executable. The app never writes to `AppData`, the registry, or any system-wide location.

---

## Recording a Stream

1. Open the **Streams** section
2. Use the *Add Stream* button to add a radio station URL
3. Select the stream in the list and press **Space** or **Enter** to start recording
3. Recorded files appear in `data\recordings\<Station Name>\` by default

Track splits happen automatically whenever the stream metadata changes — each song becomes a separate file with artist/title tags.

---

## Wishlist & Ignorelist

### Wishlist — record only the tracks you want

Add patterns to your wishlist and Tapir will alert you (and your screen reader will announce) whenever a matching track starts playing. The track is recorded normally — you don't miss it even if you're not watching.

**Example:** add `Tycho*` to your wishlist → next time the stream plays any Tycho track, your screen reader announces *"Desired track found: Tycho - Dive"*.

### Ignorelist — skip tracks you don't want

Add patterns to the ignorelist and Tapir will not start a new file for those tracks. The previous track finishes cleanly; the unwanted track is simply not recorded.

**Example:** add `*jingle*` → "Station Jingle 3", "Promo Jingle" and similar tracks are silently skipped.

Each stream also has its own per-stream ignorelist (right-click → Edit), useful for station-specific intros, ads, or news breaks.

### Pattern syntax

| Pattern | Matches |
|---------|---------|
| `Tycho*` | "Tycho - Dive", "Tycho - Awake", "Tycho Live" |
| `*jingle*` | "Station Jingle 3", "Intro Jingle", "daily jingle" |
| `T?cho - *` | "Tycho - Dive", "Ticho - Anything" |
| `Portishead - Glory Box` | Exactly this track |

- `*` — any number of characters (including none)
- `?` — exactly one character
- Matching is **case-insensitive**

### Priority

When a track matches multiple rules, the order is:

1. Per-stream ignorelist — track is skipped
2. Global ignorelist — track is skipped
3. Wishlist — track is recorded, screen reader announces
4. No match — track is recorded normally

---

## Keyboard Navigation

Tapir is fully keyboard-operable.

**In-app shortcuts:**

| Action | Shortcut |
|--------|----------|
| Activate focused item (start/stop recording, play, etc.) | Space or Enter |
| Open settings | Ctrl+, |
| Command palette | Ctrl+K |
| Move between UI zones (Activity Bar ↔ Content) | Tab / Shift+Tab |
| Navigate between sections in Activity Bar | ↑ / ↓ arrows |
| Close a dialog | Escape |

**Global hotkeys** (active system-wide, configurable in Settings → Hotkeys):

| Action | Default |
|--------|---------|
| Toggle recording (selected stream) | Ctrl+Shift+R |
| Toggle playback | Ctrl+Shift+P |
| Volume up | Ctrl+Shift+↑ |
| Volume down | Ctrl+Shift+↓ |
| Show / hide window | Ctrl+Shift+H |

---

## Accessibility

Tapir is tested with NVDA, JAWS, and Windows Narrator. All interactive elements have proper ARIA roles, names, and states. Live regions announce track changes, recording status, and errors. Dialogs implement focus traps, and destructive actions require confirmation.

If you encounter an accessibility issue, please [open an issue](../../issues).

---

## For Developers

See [AGENTS.md](AGENTS.md) for architecture overview, build instructions, and coding conventions.
