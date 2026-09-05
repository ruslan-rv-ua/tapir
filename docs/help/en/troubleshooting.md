## Troubleshooting

Find your symptom below: each one names the likely cause and what to do about it. Where the mechanism behind it matters, the section that explains it is named at the end.

### A stream will not connect, or keeps reconnecting

Stations move their addresses without warning. Check whether the stream plays outside Tapir: open the row menu and choose **Open in media player**. If nothing plays there either, the station is the problem, and only a new address will help — stop the recording, then press `F2` to edit it. A stream that is recording, reconnecting included, keeps its address locked.

Once the reconnection attempts run out, the recording stops. Raise **Max reconnection attempts** in the profile settings, tab **Recording**, inside the collapsed **Reconnection** block. How the attempts are spaced is in the section "How recording works".

### Everything records as one long file, with no tracks

The station sends no broadcast metadata, so Tapir has nothing to cut on. There is no setting for this and no other way to split the sound. You can tell before you look at the files: if Tapir never shows the name of the current track, the metadata is not there.

Some stations announce on one address and not on another, so if the station publishes several it is worth trying a different one. Otherwise the continuous file is what you get, and the "Files & names" section is where you make its name carry the date and time instead of an artist that will never arrive.

### Fewer tracks were saved than were on air

Two filters are on by default, and both drop tracks without saying so. **Skip first incomplete track** removes the one that was already playing when the recording began, and **Minimum track duration (sec)** — 30 by default — drops everything shorter, which is most jingles and adverts. Both are in the profile settings, tab **Recording**, under **Track filters**.

### The disk is running out of space

Below **Disk threshold (GB)** — 1 GB by default — no new recording starts. Anything already recording carries on, and if the disk genuinely fills up it ends with an error. Free some space, or point **Recording folder** at a larger disk.

### A scheduled recording did not start

The entry's own row carries the reason. Three of them come up most: Tapir was not running at the time, the entry belongs to a profile that is not the active one, or the stream was already recording when the window opened. What each result means is in the section "Schedule".

### A station records but will not play

Tapir plays MP3 and AAC. A station whose codec is `AAC+` records perfectly well but stays silent inside Tapir — playback waits a while and gives up. The recording itself is sound: open it in another program with `Alt+Enter` on the Recordings screen.

You can see this coming. The Station Browser shows a **Codec** column for every station, and the **Codec** filter narrows a search to the values you want. Tapir records exactly two of them: `MP3` and `AAC`. A station with any other codec — `OGG`, say — will not record at all: rather than a file whose contents do not match its name, Tapir says it cannot do this, and the stream's row then shows the codec followed by "not supported".

### Playback runs but there is no sound

The simplest cause is that the sound is off. The button on the player panel shows the state, and `F9` names it from anywhere in the window; `Ctrl+M` brings the sound back. Next most common is a very low level: 3% is not silence, so the sound does not count as off, yet you still hear nothing. `F9` names the level too, and the global volume keys raise it. If the level is fine, the cause is most likely the output device.

### Sound goes to the wrong device

The player panel only shows the current device. Choose a different one in the app settings, tab **Audio**.

### Sound stopped after unplugging a device

Tapir remembers the output device by name and never falls back on its own, so unplugging the headphones it was pointed at leaves playback silent. Open the app settings, tab **Audio**, and pick another device or **System default**. If what you want is missing from the list, plug it in and press **Refresh device list**.

### A file will not open in another program

Tapir names the reason. Usually Windows has no program registered for that kind of file, or the file has been moved, renamed or deleted outside Tapir since the list was built.

For the first, set a default program for `.mp3` or `.aac` files in Windows and try again. For the second, `Ctrl+Enter` opens the folder the file should be in, which settles in one step whether it is still there.

### A global hotkey did nothing

Another program claimed the combination before Tapir, and a combination held elsewhere never reaches Tapir at all.

Tapir says so once at startup, naming the combination and the action that will not work. Afterwards the evidence is on the **Hotkeys** tab of the app settings: the row of that action is marked **taken by another program**.

Opening that tab also checks every combination again, so if the program that was holding it has since been closed, the mark goes away by itself and the key works. If it stays, assign a different combination on the same row.

### The station catalogue is unreachable

The Station Browser searches an outside service, and that service is sometimes slow or down. It is not a fault in Tapir — try again later. Streams already in your profile do not depend on the catalogue.

### Tapir closed unexpectedly

Recordings that were running resume by themselves at the next start, and Tapir tells you how many. Whatever had already been written stays on disk, so a night of recording survives as everything up to the moment it stopped plus everything after the restart.

The recordings come back; playback does not, and neither does a scheduled window that ended while Tapir was down — that entry reports itself as missed.

### If none of this helped

Tapir keeps a log at `data\logs\tapir.log`, in the folder beside `tapir.exe`.

To capture a problem in it, turn on **Detailed logging for diagnostics** in the app settings, tab **General**. Then restart Tapir: the setting is read once, when the program starts, so a log written before the restart will not carry the extra detail. With Tapir running again, do the thing that goes wrong, and do it in as few steps as you can — a short log around one failure is far easier to read than an hour of ordinary use.

If the problem only shows up once in a while, raise **Max log file size (MB)** before you start, in the collapsed **Advanced** block in the same place. The log has a fixed size, and once it is full the oldest entries are pushed out; with a small size and a rare problem, the interesting part is gone before you notice the failure. **Log level**, in the same block, decides how much is written — the diagnostics checkbox above already sets it high enough for a report.

The folder may hold two files: the log Tapir is writing now and the one before it. Take both. The failure often sits at the end of the older one, just before the restart that split them.

Send them with your report on the project page. **Open project page** in the app settings, tab **General**, section **About**, opens it in your browser, and the same section shows the version — name it in the report, because the answer to most questions starts with knowing which version produced the log.

If your screen reader does not announce something, or you cannot reach it from the keyboard, that is a fault in Tapir rather than a setting on your side — it belongs in the same report.
