## Troubleshooting

Find your symptom below: each one names the likely cause and what to do about it. Where the mechanism behind it matters, the section that explains it is named at the end.

### A stream will not connect, or keeps reconnecting

Stations move their addresses without warning. Check whether the stream plays outside Tapir: open the row menu and choose **Open in media player**. If nothing plays there either, the station is the problem, and only a new address will help — stop the recording, then press `F2` to edit it. A stream that is recording, reconnecting included, keeps its address locked.

Once the reconnection attempts run out, the recording stops. Raise **Max reconnection attempts** in the profile settings, tab **Recording**, inside the collapsed **Reconnection** block. How the attempts are spaced is in the section "How recording works".

### Everything records as one long file, with no tracks

The station sends no broadcast metadata, so Tapir has nothing to cut on. There is no setting for this and no other way to split the sound. You can tell before you look at the files: if Tapir never shows the name of the current track, the metadata is not there.

### Fewer tracks were saved than were on air

Two filters are on by default, and both drop tracks without saying so. **Skip first incomplete track** removes the one that was already playing when the recording began, and **Minimum track duration (sec)** — 30 by default — drops everything shorter, which is most jingles and adverts. Both are in the profile settings, tab **Recording**, under **Track filters**.

### The disk is running out of space

Below **Disk threshold (GB)** — 1 GB by default — no new recording starts. Anything already recording carries on, and if the disk genuinely fills up it ends with an error. Free some space, or point **Recording folder** at a larger disk.

### A scheduled recording did not start

The entry's own row carries the reason. Three of them come up most: Tapir was not running at the time, the entry belongs to a profile that is not the active one, or the stream was already recording when the window opened. What each result means is in the section "Schedule".

### A station records but will not play

Tapir plays MP3 and AAC. A station whose codec is `AAC+` records perfectly well but stays silent inside Tapir — playback waits a while and gives up. The recording itself is sound: open it in another program with `Alt+Enter` on the Recordings screen.

You can see this coming. The Station Browser shows a **Codec** column for every station, and the **Codec** filter narrows a search to the ones Tapir can play.

### Playback runs but there is no sound

The simplest cause is that the sound is off. The button on the player panel shows the state, and `F9` names it from anywhere in the window; `Ctrl+M` brings the sound back. If the sound is on, the cause is most likely the output device.

### Sound goes to the wrong device

The player panel only shows the current device. Choose a different one in the app settings, tab **Audio**.

### Sound stopped after unplugging a device

Tapir remembers the output device by name and never falls back on its own, so unplugging the headphones it was pointed at leaves playback silent. Open the app settings, tab **Audio**, and pick another device or **System default**. If what you want is missing from the list, plug it in and press **Refresh device list**.

### A file will not open in another program

Tapir names the reason. Usually Windows has no program registered for that kind of file, or the file has been moved, renamed or deleted outside Tapir since the list was built.

### A global hotkey did nothing

Another program may have claimed the combination first, and then Tapir never receives it at all. Assign a different one in the app settings, tab **Hotkeys**.

### The station catalogue is unreachable

The Station Browser searches an outside service, and that service is sometimes slow or down. It is not a fault in Tapir — try again later. Streams already in your profile do not depend on the catalogue.

### Tapir closed unexpectedly

Recordings that were running resume by themselves at the next start, and Tapir tells you how many. Whatever had already been written stays on disk.

### If none of this helped

Tapir keeps a log at `data\logs\tapir.log`, in the folder beside `tapir.exe`.

To capture a problem in it, turn on **Detailed logging for diagnostics** in the app settings, tab **General**, then restart Tapir — the setting only takes effect on the next start — and do the thing that goes wrong.

If the problem only shows up once in a while, raise **Max log file size (MB)** first, in the collapsed **Advanced** block in the same place. Otherwise the older entries are pushed out before you manage to catch it.

The folder may hold two files, the current log and the one before it. Take both, and report the problem on the project page on GitHub with them attached.

If your screen reader does not announce something, or you cannot reach it from the keyboard, that is a fault in Tapir rather than a setting on your side — it belongs in the same report.
