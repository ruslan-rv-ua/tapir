## Streams

The Streams screen holds your station list — everything you record or listen to starts here.

### Adding a stream

Press `Ctrl+N` or use **Add stream**, then paste the address into **Stream URL**. **Name (optional)** can stay empty: Tapir takes the station's own name from the air. A playlist address (`.pls`, `.m3u`) works too — Tapir reads the real stream address out of it.

The first time you submit, Tapir checks the address and reports what it finds. Nothing here refuses a stream: if it does not respond, if the address is already in the profile, or if the name would collide with another station, you see the warning once and a second submit adds it anyway. Take the name collision seriously, though — two streams under one name record into the same folder.

### Keeping the list in order

Filter with **All**, **Recording** and **With errors**; sort **By name** or **By date added**. There is no search box on this screen — press `Ctrl+K` and type a few letters of the name.

**Import…** and **Export…** move whole lists as `M3U8` or `PLS`. On import Tapir checks every stream and marks those already in the profile; they are skipped, never duplicated.

`F2` edits the name and address. While a stream is recording its address is locked — stop the recording and the field opens. When the station reports a name of its own, the dialog offers **Use the official name**.

`Delete` removes the focused stream or the whole selection, always after confirmation.

### Recording from the list

**Record all** starts every stream in the profile, **Stop recording** stops them. Select rows first and both buttons narrow to that selection: **Record selected (N)** and **Stop selected (N)**.

The row menu adds **Copy URL**, **Open in media player**, **Copy to profile…** and **Move to profile…**. A stream that is recording is never moved away.

### Keys on this screen

- `Enter` — the row's main action: start or stop recording, unless you changed **Action on stream activation (Enter or double-click)** in the app settings
- `Ctrl+Enter` records and `Shift+Enter` listens, whatever that setting says
- `F2` — edit the stream
- `F5` / `Shift+F5` — copy or move to another profile; both act on the whole selection
- `Ctrl+N` — add a stream

General list and navigation rules are in the section "Getting around".
