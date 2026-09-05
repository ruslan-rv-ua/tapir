## Station Browser

The Station Browser searches a community catalogue of internet radio, so you can add a station without hunting down its address.

A whole trip through this screen is short: search, listen to one or two candidates, add what you liked, and go to **Streams** — the station is already there, and recording it is one more keypress. Nothing you do here starts a recording; the Browser only fills the list you record from.

### Searching

Type a station name or genre into the search box. `Ctrl+F` puts focus in that box from anywhere on the screen, and pressing it again selects what you already typed, so the next character starts a fresh query. **Country**, **Language**, **Codec** and **Min bitrate (kbps)** narrow the results further, and each takes effect as you set it. Whenever the query changes the list starts over: your next entry into it lands on the first result.

Two gestures clear things, and they clear different amounts. Clearing the search box — `Escape` or its clear button — removes the text only; country, language, codec and bitrate stay, and the list stays filtered by them. **Reset filters** drops everything and returns you to the popular list; it appears only while a filter is set.

Without filters the screen shows **Popular Stations** — a fixed list, with nothing more to load. Search results arrive in batches instead, and **Load more** sits at the end of the list for as long as the catalogue still holds a station past the ones on screen.

**Load more** is the last stop in the list, one step below the final result: `↓` from that result reaches it, `↑` goes back. `End` still means "the last result", so from the middle of the list that is `End`, then `↓`. Pressing it leaves the results where they are — only the button itself reports that it is working — and then puts the cursor on the first station of the new batch, with everything you already had above it. If the catalogue turns out to have nothing left, Tapir says so, the cursor goes back to the last result, and the button disappears.

### Listening before you commit

`Shift+Enter`, or the listen button on the row, plays a station without adding it. Press it again to stop. In the player this is ordinary live radio: Tapir does not remember the station, and the previous and next controls do nothing while it plays.

A row marked **Unavailable** either failed the catalogue's own last check, or failed to play for you just now. The first is external information and may be out of date — the station may work fine. The second lasts only until the list reloads. Either way you can still add it.

### Adding stations

`Enter` adds the focused station to the active profile. If that address is already there, Tapir says so and does not add a second copy.

To add several, select the rows and use **Add selected (N)**. Duplicates are dropped — both stations already in your profile and repeats inside the selection itself, since one station often appears in the catalogue several times. Tapir then reports both numbers: how many were added and how many were skipped.

Every added station is checked in the background, and Tapir tells you if one did not respond. It stays in your list either way.

Besides the name, a row carries what the catalogue knows about the station: country, language, codec, bitrate, genre and how often other people have opened it. The codec is the one worth reading before a long selection rather than after, because it decides whether Tapir can record the station at all — a codec Tapir does not record is marked **not supported** right in that cell. "How recording works" says which codecs are recorded, and "Troubleshooting" covers the case of a station that records but will not play.

The catalogue is an outside service. When it is slow or unreachable, that is not a fault in Tapir — try later.

### Keys on this screen

- `Enter` — add the station to the active profile
- `Shift+Enter` — listen to the station without adding it
- **Add selected (N)** — add everything you have selected

General list and navigation rules are in the section "Getting around".
