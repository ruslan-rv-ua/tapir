## How recording works

Recording captures a stream to disk and cuts it into separate track files as the station announces them.

The whole of it, end to end: you start a stream, Tapir connects and begins writing; each time the station announces a new track, the file that was open is closed and named after the track that was in it, and a new one starts. Stop, and the file that was open at that moment is closed too. What you are left with is a folder of songs, not a recording you have to cut up. Tapir records stations broadcasting in MP3 and AAC.

### Starting and stopping

Press `Ctrl+Enter` on a stream, or `Enter` if you have not changed the stream activation setting. The action panel on the Streams screen starts and stops whole groups, and the global shortcut — `Ctrl+Shift+R` unless you reassigned it — works even while the window is hidden. Several streams can record at the same time.

The row itself tells you where things stand: waiting, connecting, recording — with the time elapsed since it started — recording and playing at once, reconnecting with the attempt number, or an error. Recording and listening are independent: you can listen to a station you are recording, or to a completely different one, and neither disturbs the other.

Nothing has to be watched. A recording keeps going with the window hidden, and the status bar at the bottom of the window carries the count of active recordings, the free space left, and how long the longest one has been running.

### Broadcast metadata

Along with the sound, a station sends **broadcast metadata** — the artist and title of whatever is on air right now. This is the only signal Tapir has: when the metadata changes, the current file is closed and the next track begins. Artist and title also go into the saved file as tags.

That single dependency explains most of what looks odd about the result. Tapir cannot know a track has started until the station says so, so a station that announces late produces files that start late; a station that repeats one line for a whole programme produces one long file. And a station that sends no metadata at all still records — as one continuous file, with no split into tracks.

### What gets saved

Three profile settings on the **Recording** tab decide what survives, and all three are on by default:

- **Skip first incomplete track** — the first track after you start is almost always missing its beginning, so it is not kept.
- **Minimum track duration (sec)** — anything shorter is dropped, `30` seconds by default. This is what quietly removes station idents and short adverts.
- **Auto-correct case** — titles arriving in capitals are written normally.

If a track you expected is not in the folder, those two filters are the first place to look; both are counted from what the station announced, not from what you heard.

**Save stream file**, also on by default, keeps the whole broadcast as one continuous file alongside the tracks — the safety net for everything the split got wrong, and the reason an hour of radio takes about twice the space you expected. Turn it off if you only want the songs.

Where the files land and how they are named is in the section "Files & names".

### When something interrupts it

By default Tapir recovers a dropped connection on its own — up to 10 attempts. The first retry waits 5 seconds, each further wait is multiplied by 1.5, and the wait never exceeds 300 seconds. The attempt count is set in **Max reconnection attempts** in the profile settings; `0` turns reconnecting off entirely — then a dropped connection ends the recording. While Tapir is retrying, the row says so and shows which attempt it is on, so a stream that reconnects every few minutes is visible as a pattern rather than as a single failure. When the attempts run out, the recording stops, the row shows an error and names the reason — **Station is not responding** — and Tapir says so out loud once; nothing that was already written is lost. Such a stream stays under the **Needs attention** filter until you start it again.

Free space is checked before a recording starts — whether you started it, the schedule did, or it was resumed after a crash. Below the threshold (1 GB by default, 0 turns the check off) the recording does not start. A recording already under way is not stopped by the threshold; if the disk genuinely fills up, that recording ends with an error.

If Tapir is closed unexpectedly, recordings that were running resume by themselves on the next start, and Tapir reports how many. They resume as new files: the interrupted one stays on disk as it was, up to the last moment that reached the disk.
