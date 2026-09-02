## Listening

One panel plays two things: a station on air and a file you already recorded. Most controls are shared; the differences follow.

### Broadcast and file

Press `Shift+Enter` on a stream to hear it live, or `Enter` on a recording to play it.

A live broadcast cannot be usefully paused — you would replay a stale buffer while the station moves on — so its main button stops it. A file pauses instead, keeps its position, and resumes from there.

### Volume and position

On the volume slider `↑` and `↓` move the level by one step: 5%, unless you change **Volume step (keys, %)** in the app settings, tab **Audio** (1 to 10). The global volume keys use the same step, and Tapir names the level you stop on: "Volume 45%". Hold a key and the level keeps moving, but the number comes once — the level you let go at.

Muting has its own button on the player, or press `Ctrl+M` anywhere in the window while something is playing. Both are the same toggle, and Tapir says what came of it: "Sound off" or "Sound on". The level is remembered and comes back when you unmute.

On the position slider `↑` and `↓` seek five seconds at a time. A broadcast has no position and gets no slider — the air cannot be rewound.

On both sliders `←` and `→` move to the next player control instead of changing the value; `Home` and `End` jump to the first and last.

### Previous and next

Both stay inside whatever is playing: streams during a broadcast, recordings during a file. Tapir never crosses between them. The order is the one on the matching screen right now, so filtering or sorting Recordings changes where **Next track** lands. While you listen to a station in the Station Browser, both are unavailable.

When the neighbouring track fails to play — the station refuses, or the connection breaks — Tapir names what did not play and why, and playback stays where it was: next means one step, not a search for the first one that works. With the window in the background the message arrives as a system notification.

**Previous track** normally steps back. Set **“Previous” restarts the track if played longer than (seconds, 0 = off)** in the app settings, tab **Audio**, and past that point it restarts the current file instead. Broadcasts ignore it.

When a file ends, **Auto-play next track** — profile settings, tab **Playback**, on by default — starts the next one. At the end of the list playback stops; Tapir does not loop.

### The panel

**Now playing** names the source and marks what it is: **LIVE** for a station on air, **File** for one of your recordings.

To hear that without walking into the player zone, press `F9` — anywhere in the window, and the focus stays where it is. For a broadcast Tapir names the station and the current track (when the station sends one), for a file the name and the position, and when nothing plays it says so. The volume closes the answer: its level, or, when the sound is off, that instead.

The position in a file and the volume level stand as numbers beside their bars — 2 min 14 sec and 45%. The position is there even when the file's duration is unknown and there is no bar.

**Output** shows the current device. Change it, or rescan after plugging something in, in the app settings, tab **Audio**.

When nothing is playing, Tapir can pick up whatever you listened to last: a station goes back on air, while a file resumes from its saved position or starts over — that choice is **Resume file** in the profile settings, tab **Playback**. It does not do so by default: to have it pick up the last source at startup, switch on **Resume last playback on startup** on the same tab. This never affects a pause: a paused file continues where it stopped.

Listening to one station while another records is normal.
