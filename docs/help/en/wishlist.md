## Wishlist

This screen holds two lists and a record of what they caught. **Desired tracks** tells you when the track you have been waiting for goes on air — it filters nothing, and the recording carries on exactly as usual. **Ignored tracks** is the one that changes what you keep: adverts and jingles matched here are not saved as tracks.

### Writing a pattern

A pattern is matched against the whole title, not against a part of it. `Tycho` does not match `Tycho - Dive`, while `Tycho*` does. This single rule decides whether a list works at all.

The title Tapir compares is "artist - title", built from the broadcast metadata — never the file name, the station name or the genre. A station that announces only one of the two gives you that half alone, and one that sends no metadata matches nothing at all.

`*` stands for any number of characters, `?` for exactly one, and case is ignored:

- `*news*` — any title with "news" somewhere inside it
- `Tycho - Dive` — that one track and nothing else
- `Tycho*` — everything announced under that artist
- `Radio ?` — `Radio 1` or `Radio 2`, one character only

### Desired tracks

A match here announces the track and nothing more: it is cut and saved exactly like any other one.

Tapir checks the broadcast against your patterns **only while a stream is recording**. A stream you are merely listening to is never matched — that is the most common reason a list seems to stay silent.

A match is reported as it happens, and it leaves a trace on the **On-air matches** tab: time, station, track and pattern, newest first. That record lives until you quit the program — it is never written to disk, and switching profiles clears it, because every profile keeps its own list of desired tracks. Stopping a recording does not clear it. Rows there carry no actions: at the moment of a match the file may not exist yet, and whatever was saved lives in the "Recordings" section.

### Ignored tracks

A match here is not saved as a track file. If you also keep the whole broadcast as one file, the ignored track is still inside it — that file takes everything. When a track matches both lists, the ignored one wins.

While such a track is on air, its stream row on the **Streams** screen shows the title marked as ignored.

### Adding patterns

`Ctrl+N`, or **Add pattern**, adds to the tab that is open, so pick the tab first. On the **On-air matches** tab there is nothing to add to, so `Ctrl+N` opens **Desired tracks**. `Enter` on a row edits the pattern, `Delete` removes it, and **Delete selected (N)** clears several at once.

While a stream is on air, its row menu on the **Streams** screen offers **Add to wishlist** and **Add to ignorelist** for the track playing right now. Both land in these same two lists.

An empty list offers **Add example**, which seeds a small ready-made set — two entries for desired tracks, five for ignored ones, and pressing it twice adds nothing new. They arrive in English and Ukrainian at once, because the metadata comes from the station, not from the language you read this in.

### Keys on this screen

- `Enter` — edit the focused pattern
- `Ctrl+N` — add a pattern to the open tab
- `←` / `→` — switch between **Desired tracks**, **Ignored tracks** and **On-air matches**

General list and navigation rules are in the section "Getting around".
