## Streams

The Streams screen holds your station list — everything you record or listen to starts here.

Each row is one station: its name, and what it is doing right now. The row is also where you start a recording, start listening, and reach every action that belongs to that one station. What the status words on a row mean — connecting, recording, reconnecting, error — is explained in "How recording works"; this section is about the list itself.

### Adding a stream

Press `Ctrl+N` or use **Add stream**, then paste the address into **Stream URL**. **Name (optional)** can stay empty: Tapir takes the station's own name from the air. A playlist address (`.pls`, `.m3u`) works too — Tapir reads the real stream address out of it.

The first time you submit, Tapir checks the address and reports what it finds. Nothing here refuses a stream: if it does not respond, if its codec is not one Tapir records, if the address is already in the profile, or if the name would collide with another station, you see the warning once and a second submit adds it anyway. Take the name collision seriously, though — two streams under one name record into the same folder.

A stream added despite a warning behaves exactly like any other; the warning was about the moment of adding, not a mark on the row. An address that did not respond may simply have been a station off the air, and it will record tomorrow. A codec Tapir does not record is the one warning worth acting on: the stream will sit in the list, and pressing record on it stops with a message naming the codec.

### Keeping the list in order

Filter with **All**, **Recording** and **Needs attention**; sort **By name** or **By date added**. Each filter button carries the number of streams behind it, so a glance tells you whether anything is in trouble. **Needs attention** collects two different cases together: the stream that has already given up after every reconnect attempt, and the one still making them. A station that dropped a minute ago therefore lands under the button straight away, instead of forty minutes later when there is nothing left to save. What happened to a particular row is what the row itself says: **Reconnecting** with the attempt number, or the reason the recording stopped. The **Needs attention** metric above the list shows the same count. **All** brings the whole list back; if a filter leaves nothing at all, the empty list says so and offers **Reset filter** in its place. There is no search box on this screen — press `Ctrl+K` and type a few letters of the name.

The filter is also the fastest way to aim a bulk action, because selecting all takes the visible rows only. A list imported from somewhere else is usually worked through like this: import it, try recording everything, switch to **Needs attention**, and either fix the address with `F2` or delete the rows that are dead — the rest of the list is untouched while you do it.

**Import…** and **Export…** move whole lists as `M3U8` or `PLS`. On import Tapir checks every stream and marks those already in the profile; they are skipped, never duplicated. A stream whose codec Tapir does not record is marked too — but stays selected: nothing stops you adding it. With rows selected, the export button narrows to **Export selected (N)…**, which is how you hand someone three stations instead of the whole profile.

`F2` edits the name and address. While a stream is recording its address is locked — stop the recording and the field opens. When the station reports a name of its own, the dialog offers **Use the official name**.

`Delete` removes the focused stream or the whole selection, always after confirmation. Deleting a stream does not touch anything it has already recorded, and it does not warn you about schedule entries pointing at it — those stay, and report a deleted stream at their next run; see "Schedule".

### Recording from the list

**Record all** starts every stream in the profile, **Stop recording** stops them. Select rows first and both buttons narrow to that selection: **Record selected (N)** and **Stop selected (N)**.

Tapir answers with two numbers rather than a bare success: how many recordings started, and how many rows were skipped because they were already recording. A run of "started 4, skipped 2" over six selected rows is the normal outcome of pressing record twice, not an error.

The row menu adds **Copy URL**, **Open in media player**, **Copy to profile…** and **Move to profile…**. A stream that is recording is never moved away — it is reported as skipped, and stays where it is. In the target list you can also pick **+ New profile…** and create the destination on the spot; if there is no other profile yet, the menu says so instead of opening an empty picker.

### Keys on this screen

- `Enter` — the row's main action: start or stop recording, unless you changed **Action on stream activation (Enter or double-click)** in the app settings
- `Ctrl+Enter` records and `Shift+Enter` listens, whatever that setting says
- `F2` — edit the stream
- `F5` / `Shift+F5` — copy or move to another profile; both act on the whole selection
- `Ctrl+N` — add a stream

General list and navigation rules are in the section "Getting around".
