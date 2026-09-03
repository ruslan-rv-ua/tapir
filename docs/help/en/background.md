## Running in the background

Tapir can work with no window open — recording, keeping the schedule and answering keys while you are busy with something else.

That is why closing the window does not end the program. The window hides, while recordings, schedule and playback carry on; Tapir stays as an icon in the system tray. To quit, use the exit item in the icon's menu — or simply close the window, if you turn off **Minimize to tray instead of closing** in the app settings, on the **General** tab. The window's minimise button does not hide Tapir to the tray; closing it does.

If anything is recording when you quit, Tapir says how many recordings are active, names any scheduled one among them, and asks whether you really mean to leave.

### The tray icon

A left click hides the window when it is visible and brings it back when it is not. Hover over the icon to see what is playing and how many streams are recording, without opening the window at all.

The icon's menu changes with the state. From it you can control playback — just as the player's primary control does — stop all recordings, show or hide the window, and quit. Items with nothing to act on are either hidden or left inactive: there is nothing to stop while nothing is playing.

Tapir can also raise a notification when the track changes — that is switched on per profile, in its settings on the **Interface** tab. The checkbox next to it governs notifications about scheduled recordings; those belong to the section "Schedule".

### Global hotkeys

Eight combinations work in any application, not only in Tapir: toggle recording, toggle playback, change the volume, show or hide the window, stop all recording, and skip to the previous or next. The current combinations are listed in the app settings, on the **Hotkeys** tab, which is also where you assign them.

Another program may take a combination first; Tapir then never receives it and the action simply does nothing. Tapir says so once when it starts, naming the combination and the action, and on the **Hotkeys** tab that row reads “taken by another program”. The cure is to assign a different combination.

The system media keys on your keyboard and the buttons on a headset control playback exactly as the player buttons do. Turn off **System media keys integration** in the app settings, on the **Audio** tab, and Tapir disappears from the system playback overlay, handing the keys back to whichever player had them before.

### Starting with Windows

**Launch with Windows** creates an entry in the Windows registry — the only thing Tapir leaves outside its own folder. Turn the option off and the entry goes away. **Launch minimized** goes with it: Tapir starts straight into the tray instead of taking your attention at the beginning of a session.

The entry holds the full path to `tapir.exe`, so moving the Tapir folder elsewhere stops autostart from working. Once you start Tapir from its new place it notices, switches autostart off and tells you so — switch it back on.

A second launch does not open a second window; it brings the open one to the front instead.

### Starting with parameters

A shortcut to `tapir.exe` can carry parameters, so that one icon on the desktop does what you need straight away. The parameters fall into two groups.

The first only applies when Tapir is not yet running, because it decides how it starts:

- `--profile "News"` — start in this profile
- `--minimize` — start straight into the tray

A shortcut for startup might read: `tapir.exe --profile "News" --minimize`.

The second group always applies, including to a Tapir that is already running — the command is carried out in the open window:

- `--record "Jazz FM"` — start recording a stream
- `--play "Jazz FM"` — start playing a stream
- `--stop-recording` — stop all recording
- `--stop-playback` — stop playback
- `--wish-add "*jazz*"` — add a pattern to the wanted tracks
- `--wish-remove "*jazz*"` — remove a pattern from them

For example: `tapir.exe --record "Jazz FM"`.

A stream is found by its exact name or its exact address — part of a name is not enough. And remember that Tapir writes nothing to the console: it reports the result of every command in its own window.
