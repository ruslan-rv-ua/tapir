## How recording works

Recording captures a stream to disk and cuts it into separate track files as the station announces them.

### Starting and stopping

Press `Ctrl+Enter` on a stream, or `Enter` if you have not changed the stream activation setting. The action panel on the Streams screen starts and stops whole groups, and the global shortcut — `Ctrl+Shift+R` unless you reassigned it — works even while the window is hidden. Several streams can record at the same time.

The row itself tells you where things stand: waiting, connecting, recording — with the time elapsed since it started — recording and playing at once, reconnecting with the attempt number, or an error.

### Broadcast metadata

Along with the sound, a station sends **broadcast metadata** — the artist and title of whatever is on air right now. This is the only signal Tapir has: when the metadata changes, the current file is closed and the next track begins. Artist and title also go into the saved file as tags.

A station that sends no metadata still records — as one continuous file, with no split into tracks.

### What gets saved

The first track after you start is almost always missing its beginning, and by default it is not kept. Tracks under 30 seconds are dropped too, and titles arriving in capitals are corrected. All three are profile settings, tab **Recording**.

Turn on **Save stream file** and Tapir additionally keeps the whole broadcast as one continuous file, alongside the tracks.

### When something interrupts it

By default Tapir does not reconnect: a dropped connection ends the recording. To have it recover on its own, set **Max reconnection attempts** in the profile settings. The first retry then waits 5 seconds, each further wait is multiplied by 1.5, and the wait never exceeds 300 seconds.

Free space is checked before a recording starts — whether you started it, the schedule did, or it was resumed after a crash. Below the threshold (1 GB by default, 0 turns the check off) the recording does not start. A recording already under way is not stopped by the threshold; if the disk genuinely fills up, that recording ends with an error.

If Tapir is closed unexpectedly, recordings that were running resume by themselves on the next start, and Tapir reports how many.

Where the files land and how they are named is in the section "Files & names".
