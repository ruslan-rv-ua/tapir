## Files & names

Every recorded track becomes a file on disk, and you decide where it lands and what it is called.

### Where recordings go

By default they go to the `recordings\` folder next to `tapir.exe`, and inside it each station gets a folder of its own. To move them elsewhere, open the profile settings, tab **Recording**, and set **Recording folder** — either type a path or use **Browse**. A relative path stays next to `tapir.exe`; an absolute one goes wherever you point it, including another drive.

The folder belongs to the profile, not to the program, so two profiles can write to two different disks — one archive on a large volume, one profile's worth of daily listening next to the application. Changing the folder moves nothing that is already recorded: files stay where they were written, and the "Recordings" screen shows what is in the folder set now.

### The three templates

Next to the folder sit three name templates:

- **Track file name template** — a finished track. Default: `%s\%a - %t`
- **Incomplete file template** — a track missing its start or end. Default: `%s\%a - %t_incomplete`
- **Stream file template** — the continuous file of the whole broadcast, when you have it switched on. Default: `%s\stream_%d_%time`

A backslash inside a template makes a folder, which is why the defaults start with `%s\` — one folder per station. Forward slashes work the same way. Folders that do not exist yet are created as they are needed, however many levels deep the template goes.

Do not write the extension into a template. Tapir adds it from what the station is actually broadcasting — `.mp3` or `.aac` — so the same template produces correctly named files whatever the station sends.

A changed template applies to the next file Tapir writes. Files already on disk are not renamed, so it is normal, right after a change, to have one station's folder holding both shapes of name.

### Variables

- `%s` — station name
- `%a` — artist
- `%t` — track title
- `%n` — track number within the current recording session, padded to three digits (`001`). The count restarts every time you start recording, so it orders one session, not your whole archive
- `%d` — date, as `2026-08-13`
- `%time` — time, as `21-45-30`

Anything else after a `%` is left exactly as you typed it, so a stray percent sign in a template does not break it.

Two templates to start from: `%a - %t` puts everything in one flat folder, and `%s\%d\%n - %a - %t` gives one folder per station, one per day, and tracks numbered in the order they aired.

Artist and title come from what the station announces, split at the first ` - ` in it. A station that announces just a programme name has no artist part at all, and `%a` then expands to nothing — `%a - %t` becomes a name beginning with a dash. For a station like that, a template without `%a`, such as `%s\%d %time - %t`, gives better names; templates are per profile, so a profile devoted to spoken radio can have its own.

### When a name will not do

Windows forbids `\ / : * ? " < > |` in file names, so Tapir replaces each with `_`. Trailing dots and spaces are trimmed, and names Windows reserves for devices (`CON`, `NUL`, `COM1` and the like) get an underscore in front.

This substitution is applied to the values, not to your template: a station whose name contains a slash becomes one folder with an underscore in its name, and never a chain of folders. Only the separators you type yourself make folders.

If **Auto-correct case** is on in the same settings tab, it is applied here too, to the finished name — folder names included. What it does to a title is described in "How recording works".

If the finished name is already taken, Tapir adds `_2`, then `_3`, and so on — an existing recording is never overwritten. This happens more often than it sounds: a station that plays the same track twice in an evening produces the same name twice, and both files are kept.

What happens before the file appears is in the section "How recording works".
