<!--
  AUDIENCE: end users.
  Keep this file in plain language, focused on what Tapir does for the person
  using it. Technical detail — protocols, CLI flags, pattern syntax, build
  instructions, repo layout — belongs in DEVELOPERS.md.
  Agent/contributor guidelines live in AGENTS.md.
-->

# Tapir

<p align="center">
  <img src="public/logo.svg" alt="Tapir" width="600">
</p>

> **Status: Early release — expect rough edges.** Tapir works and is used daily, but it is
> young; if something is off, [open an issue](../../issues).

Tapir is a friendly, easy-to-use Windows app for listening to and recording internet radio. Not only can you record your favorite broadcasts, but Tapir also recognizes when a new song starts—automatically splitting the recording into individual tracks with the correct artist and title tags. No installation is required; just download and run!

**Platform:** Windows 11+ · Portable EXE  
**Screen readers:** NVDA · JAWS · Narrator

---

## What can Tapir do?

- **Listen and Record** — Enter the link to your favorite station and listen live. You can adjust the volume or mute it while it records in the background.
- **Automatic track splitting** — Tapir automatically "slices" the recording into individual songs and adds the artist and title information based on the radio station's data.
- **Wishlist & Ignorelist** — Build a list of your favorite artists, and Tapir will let you know when they play on the radio. Or, add keywords to the Ignorelist to stop recording annoying ads or unwanted songs.
- **Stream Browser** — Find and add new radio stations in a single click using the community-driven Radio Browser directory.
- **Saved Songs Manager** — All your recorded tracks are kept in one place. You can listen to them, delete them, or edit their information.
- **Scheduler** — Want to record a Saturday night show? Set a timer, and Tapir will do it automatically—either once or every week.
- **Profiles** — Create different settings profiles, like "Relax Radio" or "News," and switch between them easily.
- **System Tray** — Hide the app so it doesn't get in your way. A small tray menu lets you control recording and playback.
- **Start with Windows** — Optionally launch Tapir at sign-in, minimized to the tray if you like, and pick up the last station or file where you left it.
- **Global Hotkeys** — Control music and recordings from your keyboard, even while working in other apps!

### Coming soon

- **Post-processing** — Ability to send recorded files to other apps for further editing.

---

## Getting Started

There are two ways to get Tapir. Both give you the same single file.

### Download

1. Open the [Releases](../../releases/latest) page and download `tapir-v<version>-x64.exe`.
2. Place it in any folder you like (e.g., your Desktop or a USB drive). You may rename it to `tapir.exe`.
3. Run it.

**The first run shows a Windows SmartScreen warning**, because the file is not code-signed
(signing needs a paid certificate tied to a person; see the [decision](docs/decisions/2026-09-07-release-is-one-bare-exe.md)).
To get through it with the keyboard or a screen reader: on the *Windows protected your PC*
dialog, press **Tab** to the **More info** link and activate it with **Enter**; a **Run anyway**
button appears — **Tab** to it and press **Enter**. Windows remembers the choice for that file.

Beside the exe you will find `tapir-v<version>-x64.exe.sha256` — the file's SHA-256 checksum,
if you want to verify the download.

### Scoop

If you use [Scoop](https://scoop.sh), this path shows no SmartScreen warning and updates with
the rest of your apps:

```powershell
scoop bucket add ruslan-rv-ua https://github.com/ruslan-rv-ua/scoop-bucket
scoop install tapir
```

Later, `scoop update tapir` brings the next version; your settings and recordings survive the
update.

### Where things go

All your recordings will go into a `recordings\` folder, and your settings will be saved in `data\`. Both folders appear right next to the app, so moving Tapir to another computer is just copying its folder — nothing is installed. Windows itself keeps a cache for the page engine that draws the app's window, so a little data does stay behind in your user profile.

---

## How to Listen and Record

1. Open the **Streams** section.
2. Click the *Add Stream* button and paste the radio link.
3. Select the station from the list and press **Space** or **Enter** to start recording or listening.
4. Find your music in `recordings\<Station Name>\`.

---

## Keyboard Navigation ⌨

Tapir works perfectly without a mouse!

**In-app shortcuts:**

| Action | Shortcut |
|--------|----------|
| Activate focused item (play / record) | Space or Enter |
| Open settings | Ctrl+, |
| Command palette | Ctrl+K |
| Move between UI zones | Tab / Shift+Tab |
| Navigate menus on the left | ↑ / ↓ arrows |
| Close dialog | Escape |

**Global hotkeys** (works anywhere in Windows, change in Settings):

| Action | Default |
|--------|---------|
| Start/Stop recording | Ctrl+Shift+R |
| Play/Pause radio | Ctrl+Shift+K |
| Volume up | Ctrl+Alt+↑ |
| Volume down | Ctrl+Alt+↓ |
| Show / hide window | Ctrl+Shift+H |
| Stop all recordings | Ctrl+Shift+S |
| Previous track / radio | Ctrl+Alt+← |
| Next track / radio | Ctrl+Alt+→ |

---

## Accessibility

Tapir is built from the ground up for NVDA, JAWS, and Windows Narrator. 
Your screen reader will always announce what button you are on, if recording started, what song is playing, or if an error occurred. It will also ask for confirmation before you delete any music.

We care deeply about making Tapir accessible for everyone! If you find any issues, please [open an issue](../../issues).

---

## For Developers & Advanced Users

If you are looking for technical details, such as supported protocols, CLI arguments, advanced Wishlist syntax, or build instructions, please read **[DEVELOPERS.md](DEVELOPERS.md)**.

---

## License

Tapir is released under the **MIT License** — see [LICENSE](LICENSE). Use it, change it, ship it; keep the copyright notice, and it comes with no warranty.
