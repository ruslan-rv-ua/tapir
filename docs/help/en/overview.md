## Overview & first steps

Tapir listens to internet radio, records the broadcast, splits it into separate tracks using stream metadata, and sets tags. You point it at a station address, tell it to record, and get a folder of individual songs with the artist and title already filled in — instead of one long file you would have to cut up by hand.

The application is portable and requires no installation: the system AppData folder is not used, and the `data\` and `recordings\` folders are created right next to the `tapir.exe` file. Everything Tapir knows — your streams, profiles, schedule, and saved tracks — lives inside those two folders. Copy the whole folder to another disk or another computer and Tapir starts there with the same streams and the same recordings. The one thing Tapir puts outside its own folder is the Windows startup entry, and only if you turn on **Start with Windows** — see the "Running in the background" section.

### First launch

Start by adding a station. There are three ways in, and the first recording works the same after any of them.

Add a stream by hand: press `Ctrl+N` on the **Streams** screen, paste the address, and give it a name. The address can also be a `.pls` or `.m3u` playlist — Tapir opens it and takes the real stream address out of it. Before saving, Tapir checks whether the address actually responds; if it does not, you are told so and can still add the stream, because a station that is off the air right now may be back tomorrow.

Find a station in the catalogue: go to the **Station Browser**, type part of the name, and add what you find. The catalogue holds tens of thousands of stations with their country, language, and codec, so you never have to hunt for an address on a web page.

Or take the shortcut on an empty list: the **Add example streams** button adds a handful of working stations so you can try recording immediately, before deciding which stations you actually want.

Now record. On the **Streams** screen, move to the stream and press `Enter` — by default that starts recording; `Ctrl+Enter` always records, whatever the default is. The row changes to show what is happening: connecting, then recording. Within a minute or two the first file appears in `recordings\`, inside a folder named after the station. The first track after the start is almost always cut off in the middle, so by default Tapir does not keep it. To stop, press the same key again. If the station goes off the air, recording stops and the row shows an error — by default Tapir does not reconnect on its own; how to turn reconnection on is described in "How recording works".

### Application screens

- **Profiles:** group streams, settings, and schedules into separate sets and switch between them. Only one profile is active at a time.
- **Streams:** add stations, control recording and playback. This is the screen you will spend most time on.
- **Station Browser:** search for stations in the community directory, listen to a preview, and add what you like to the active profile.
- **Wishlist:** define patterns for tracks you want to be notified about, or ignore ads and jingles so they never become separate files.
- **Schedule:** plan automatic recording starts for specific times and days, so a programme is recorded while you are away.
- **Recordings:** browse and play saved tracks, rename them, and edit their tags.

### Quick access

Press `F1` to open this help. Use `Alt` with a digit to switch between screens — `Alt+0` is Profiles, `Alt+1` Streams, and so on down the left-hand bar. Press `Ctrl+K` to open the command palette, which finds actions and streams by name without navigating anywhere.

Settings live in two places, and which one you want depends on what you are changing: `Ctrl+,` opens the settings of the application on this computer, `Ctrl+Shift+,` the settings of the active profile. The "Settings" section explains where the line runs.

Everything else is reached with the keyboard as well: moving between the areas of the window, selecting several rows at once, and opening a row's menu are the same everywhere, and the "Getting around" section explains them once.

Tapir works with NVDA, JAWS, and Narrator.
