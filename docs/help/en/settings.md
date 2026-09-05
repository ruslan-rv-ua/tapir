## Settings

There are two sets of settings, and the dialog a control sits in is what its scope is.

`Ctrl+,` opens the **app settings** — whatever concerns this computer and Tapir itself: the sound device, the things Tapir registers with the system, and what pressing a key does. `Ctrl+Shift+,` opens the **profile settings** — whatever describes a scenario: which data, written where, shown how. Nothing is labelled with its scope, because the boundary already runs between the dialogs.

Both save themselves the moment you change something: there is no Save button, and the footer of the dialog says so rather than reporting each save. Close the dialog with `Escape` and nothing is lost — there is nothing to confirm and nothing to discard.

So when you are hunting for a setting, ask which of the two questions it answers. "Which speakers should the sound come out of" and "what should this key do" are about the computer, and live behind `Ctrl+,`. "Where should these recordings go, how should they be named, how long should Tapir keep trying" are about the scenario, and live behind `Ctrl+Shift+,` — separately for every profile, which is what makes a second profile worth having at all. Pressing `Ctrl+Shift+,` always opens the settings of the profile that is active; to reach another profile's settings, use the row menu on the **Profiles** screen.

### App settings

The **General** tab is built from sections. **Interface** holds **Language** and **Theme**. **Tray** holds **Minimize to tray instead of closing**. **Behaviour** holds **Show track name in window title** and **Action on stream activation (Enter or double-click)** — whether a stream row starts recording or playback. **Autostart** holds **Launch with Windows** and **Launch minimized**, the second becoming available only once the first is on. **Logging** holds **Detailed logging for diagnostics**, and under the collapsed **Advanced** block, **Log level** and **Max log file size (MB)**. **About** holds the version line, the project address and **Open project page**, which opens it in your browser.

The **Audio** tab starts with the **Output device** and a **Refresh device list** button — this is where sound moves to other speakers or headphones. Then **Media integration**, with the **System media keys integration** switch, and **Controls**, with two numbers: **“Previous” restarts the track if played longer than (seconds, 0 = off)** and **Volume step (keys, %)**.

The **Hotkeys** tab holds eight combinations that work even while the Tapir window is hidden. By default those are **Recording (toggle)** — `Ctrl+Shift+R`, **Playback (toggle)** — `Ctrl+Shift+K`, **Volume up** and **Volume down** — `Ctrl+Alt+↑` and `Ctrl+Alt+↓`, **Show/hide window** — `Ctrl+Shift+H`, **Stop all recording** — `Ctrl+Shift+S`, **Previous track** and **Next track** — `Ctrl+Alt+←` and `Ctrl+Alt+→`.

### Assigning your own combination

Press the button on the row of the action you want, then press the keys; `Escape` cancels the recording. A combination is `Ctrl` or `Alt` (with `Shift` added if you like) plus a letter, a digit, an arrow, `Space` or an `F` key — any other key is refused with a note of what does work. `Shift` on its own does not count as a modifier: `Shift` plus a letter is just a capital letter. Only `Pause` and `F13`–`F24` work without modifiers: no other program holds them, so they are safe system-wide; a bare key of any other kind is refused with a request for `Ctrl` or `Alt`.

Two kinds of combination are refused straight away, with a reason: those reserved for actions inside the window (such as `F1`, `Ctrl+N` or `Ctrl+K`), and those already given to another action in the same list. **Reset to defaults** restores the standard values for all eight at once; the cross on a row does not restore anything, it clears the combination and leaves the action without a hotkey.

### Profile settings

The **Recording** tab holds **Output & templates** (**Recording folder**, **Track file name template**, **Incomplete file template**, **Stream file template**), **Stream file** (**Save stream file**), **Track filters** (**Skip first incomplete track**, **Minimum track duration (sec)**, **Auto-correct case**, **Disk threshold (GB)**) and **Scheduler** (**Start earlier, min**, **Stop later, min**). At the end sits the collapsed **Reconnection** block with four fields: **Max reconnection attempts**, **Retry interval (sec)**, **Backoff multiplier** and **Max interval (sec)**. What all of these do is described in the sections "How recording works" and "Schedule".

The **Playback** tab holds **Resume last playback on startup**, **Resume file** and **Auto-play next track**; those belong to the section "Listening". The **Interface** tab holds the stream list **Sort** order and two independent checkboxes: **Tray notifications for track changes** and **Tray notifications for scheduled recordings**.

The **Post-processing** tab is empty for now: running an external program over a finished file is not available yet, and the tab stays in place so you know it is coming.

A changed profile setting takes effect from the next thing Tapir does with it: a new file name template names the next file written, not the ones already on disk, and a changed reconnection limit applies the next time a connection drops. Nothing you change here stops a recording that is already running — the one exception in the program is editing a schedule entry while it records, and that belongs to "Schedule".
