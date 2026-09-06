## Recordings

Everything Tapir has saved lands here: one list of track files, whatever stream or day they came from.

This list is the recordings folder seen from inside Tapir, not a separate catalogue of its own. Tapir builds it by reading the folder, so a file you moved or deleted in Explorer is gone from here too, and a file you copied in appears. The station column comes from the folder a file sits in — one that lies loose in the root of the recordings folder shows a dash instead of a station name.

After an overnight recording the usual first move is to sort **By date**, see what the night produced, and delete the two or three files you do not want. Playing a track to check it does not take you off this screen.

### Finding a track

Type into the search box to match artist, track or album; `Ctrl+F` puts focus there from anywhere on the screen. **Station** narrows the list to one station, and **Sort** orders it by date, title, artist or size. Whenever you change the query, the station or the sort the list starts over: your next entry into it lands on the first row. Each row reads out as title, artist, station, size and the date it was recorded, so the sort you choose is also the thing you compare rows by.

A row marked **incomplete** is a track Tapir did not see the start or the end of — the first track after a recording began, or the one that was running when it stopped. The mark comes from the file name: Tapir gives such files a name ending in `_incomplete`. Rename that ending away and the mark goes with it. The naming itself is covered in the section "Files & names".

### Playing and opening

`Enter` plays the focused recording and stops it again; the same button sits on the row.

`Alt+Enter` hands the file to whatever program Windows associates with it, and `Ctrl+Enter` opens its folder with the file selected. Both act on the focused row only, never on the selection. If the file cannot be opened, Tapir says why — usually no program is registered for that file type, or the file has been moved since the list was built.

### Renaming, tags and deleting

Both editors open from the keyboard: `F2` renames the focused row, `F4` opens its tags. Either key acts on the focused row alone, even when several rows are selected.

**Rename…** changes the name only — Tapir keeps the extension, so renaming cannot change the format. Windows forbids `< > : " / \ | ? *` in file names, and while any of them is present the dialog will not save. If a file of that name already exists, Tapir appends `_2` and tells you the name it actually used.

**Edit tags…** sets artist, title, album and genre inside the file itself. Tags are what the search matches, so correcting a misspelt artist here also makes the track findable — the file name is a separate thing, and `F2` is what changes that.

**Delete** moves files to the Recycle Bin after a confirmation, so nothing is lost outright. The file currently playing is protected, and the two paths differ: deleting it on its own fails and asks you to stop playback first, while deleting a selection that contains it quietly skips that one file and removes the rest.

### Keys on this screen

- `Enter` — play the recording, or stop it if it is already playing
- `F2` — rename the focused recording
- `F4` — edit the tags of the focused recording
- `Alt+Enter` — open the file in the associated program
- `Ctrl+Enter` — show the file in its folder
- `Delete` — move the focused recording, or the whole selection, to the Recycle Bin

General list and navigation rules are in the section "Getting around".
