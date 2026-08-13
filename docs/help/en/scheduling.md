## Schedule

The Schedule records a programme for you, so you do not have to sit by the computer when it goes out.

### Creating an entry

`Ctrl+N`, or **Add schedule**, opens the form: a **Name**, the **Stream** to record and a **Type** — **Recurring** with **Days of week**, or **One-time** with a single **Date**. Then **Start time** and **End time**.

An end earlier than the start means the recording crosses midnight: `22:30` to `00:30` records two hours of the night. The two times may not be equal, so one entry can never cover a whole day.

### What Tapir needs to run it

Two conditions, and both are easy to miss:

- Tapir has to be running. A window that passes while the app is closed counts as missed. Start Tapir in the middle of a window, though, and the recording begins immediately and captures the rest of it — the result then says it started late.
- Only the active profile is scheduled. Entries in a profile you are not using never run, and are not even marked as missed until you switch to it.

### When a recording does not happen

Whoever takes the stream first keeps it until the window ends:

- If the stream is already recording when the window opens, the scheduled recording is skipped for that window — and it stays skipped even if you stop the other recording a minute later.
- If you stop a scheduled recording yourself, it does not come back in that window either.
- If the recording drops on its own and reconnection gives up, Tapir starts it again and records the rest of the window.

Your own actions are final for the window; a failure is not.

Every entry shows the result of its last run — the minutes recorded, or why nothing was. A missed run names its reason: Tapir was not running, the recording failed to start, or the clock changed. Deleting a stream leaves its entries behind, marked **stream removed**; at their hour they fail to start, which is where that second reason usually comes from.

Tapir announces the start, the finish and every failure. The tray balloon for those follows the **Notifications on track change** checkbox in the profile settings, on the **Interface** tab: despite its name, it governs schedule notifications too.

### Changing an entry

To skip an entry for a while, turn it off rather than delete it: it keeps its place and shows no next run until you turn it back on.

Take care while an entry is recording: changing its stream, time, days, date or length stops that recording, and so do turning it off and deleting it. Renaming is safe. Once stopped this way, the recording does not resume in the same window.

A one-time entry switches itself off after it has run and stays in the list with its result. You cannot switch it back on, because its date has passed — give it a future date, or create a new entry.

### Extra time before and after

**Start earlier, min** and **Stop later, min**, in the profile settings on the **Recording** tab, widen every window in the profile. Both are `0` by default and stop at `30` and `60`; larger numbers are quietly reduced. They apply to all entries at once, so a single programme cannot get padding of its own.

### Keys on this screen

- `Enter` — edit the focused entry
- `Space` — turn the entry on or off
- `Ctrl+N` — add an entry

General list and navigation rules are in the section "Getting around".
