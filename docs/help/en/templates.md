## Files & names

Every recorded track becomes a file on disk, and you decide where it lands and what it is called.

### Where recordings go

By default they go to the `recordings\` folder next to `tapir.exe`, and inside it each station gets a folder of its own. To move them elsewhere, open the profile settings, tab **Recording**, and set **Recording folder** — either type a path or use **Browse**. A relative path stays next to `tapir.exe`; an absolute one goes wherever you point it, including another drive.

### The three templates

Next to the folder sit three name templates:

- **Track file name template** — a finished track. Default: `%s\%a - %t`
- **Incomplete file template** — a track missing its start or end. Default: `%s\%a - %t_incomplete`
- **Stream file template** — the continuous file of the whole broadcast, when you have it switched on. Default: `%s\stream_%d_%time`

A backslash inside a template makes a folder, which is why the defaults start with `%s\` — one folder per station.

### Variables

- `%s` — station name
- `%a` — artist
- `%t` — track title
- `%n` — track number within the current recording session, padded to three digits (`001`). The count restarts every time you start recording, so it orders one session, not your whole archive
- `%d` — date, as `2026-08-13`
- `%time` — time, as `21-45-30`

Two templates to start from: `%a - %t` puts everything in one flat folder, and `%s\%d\%n - %a - %t` gives one folder per station, one per day, and tracks numbered in the order they aired.

### When a name will not do

Windows forbids `\ / : * ? " < > |` in file names, so Tapir replaces each with `_`. Trailing dots and spaces are trimmed, and names Windows reserves for devices (`CON`, `NUL`, `COM1` and the like) get an underscore in front.

If the finished name is already taken, Tapir adds `_2`, then `_3`, and so on — an existing recording is never overwritten.

What happens before the file appears is in the section "How recording works".
