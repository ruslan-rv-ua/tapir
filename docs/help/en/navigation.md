## Getting around

Tapir fully supports keyboard navigation. All major operations have keyboard shortcuts, and the same few keys mean the same thing on every screen — learn them once here, and each screen's own section only has to tell you what its rows do.

### Screen zones

The window is divided into zones. Use `F6` and `Shift+F6` to move between them forward and backward. Three zones are always present: **Sidebar**, **Player**, and **Status**. The rest depend on the current screen — a screen with a search field, a toolbar, and a list contributes three of its own — so there is no fixed number to memorise. When you enter a new zone, Tapir announces its name.

Inside a zone, use the arrow keys, `Home`, `End`, `Page Up`, and `Page Down` to move around. Pressing `Tab` moves focus out of the zone and on to the next control, which is what you want when you are heading for a button rather than another row.

In practice a whole task is two or three zone jumps: press `F6` until Tapir names the list, use the arrows to reach the row you want, act on it, then `F6` again to the action bar or the player. You never have to `Tab` through everything in between.

While a dialog is open — settings, adding a stream, a confirmation — zone movement and the list keys are switched off on purpose, so nothing happens behind your back in the window underneath. `Escape` closes the dialog and hands focus back to where you were.

### Working with lists

- Main action: press `Enter` to perform the primary action on the focused row. `Space` mostly does the same thing. `Space` acts as a true toggle only where the row has an on/off state (like in the Schedule), and it has no effect in the Station Browser.
- Modifiers with `Enter` apply only to the focused row. Their specific action depends on the screen (see the section for the respective screen). None of them means the same thing everywhere: `Shift+Enter` listens on Streams and in the Station Browser, `Alt+Enter` exists only in Recordings, and `Ctrl+Enter` records on Streams but shows the file in Explorer in Recordings.
- Selection: use `Ctrl+Space` to toggle selection for a row. `Shift+↑` or `Shift+↓` select a range, `Ctrl+A` selects all visible rows. Press `Escape` to clear the selection.
- Deletion: the `Delete` key removes the focused row or all selected rows, always asking for confirmation. In the Station Browser, this key has no effect.
- Context menu: open it with a right click, the menu key, or `Shift+F10`. Outside of lists, there are no context menus in the application, so the key does nothing there — that is deliberate, not a fault.

The asymmetry between the last three points is worth holding on to, because it decides what a keystroke will touch. `Delete` and the buttons on the action bar work on **the whole selection**; `Enter` and its modifiers always work on **the one focused row**, selection or no selection. So to record several streams at once you select them — `Ctrl+Space` on each, or `Shift+↓` for a run — and then use the action bar of that screen, which is where the bulk actions live. Pressing `Ctrl+Enter` instead would have recorded exactly one.

`Ctrl+A` takes the visible rows, not everything the screen knows about: with a filter on, it selects what the filter left. That is usually what you want, and it is the reason the filter is a safe way to aim a bulk action.

### Command palette and screens

Press `Ctrl+K` to open the command palette. It lets you find actions and streams in one search: start typing what you want to do, or the name of a stream, and press `Enter` on the result. Catalogue stations and saved tracks are not in it — those are found with the search field on their own screen.

To switch between screens, use `Alt` with a digit from `0` to `5`, in the order of the left-hand bar: `Alt+0` Profiles, `Alt+1` Streams, `Alt+2` Station Browser, `Alt+3` Wishlist, `Alt+4` Schedule, `Alt+5` Recordings.

### Search on a screen

Press `Ctrl+F` to move focus into the current screen's search field, from any of its zones. Two screens have one — the **Station Browser** and **Recordings**; elsewhere Tapir answers that this screen has no search, and focus stays where it was. If focus is already in the field, `Ctrl+F` selects the text you typed, so the next character starts a new query.

### Global windows

- `F1` — help
- `Ctrl+,` — application settings
- `Ctrl+Shift+,` — profile settings

### Status bar

At the bottom of the window is the status bar. It shows three metrics:
- how many streams are currently being recorded
- available free disk space
- duration of the longest active recording

They are there so you can check on a long recording without leaving the screen you are on: if the count is not what you expect, or free space is dropping faster than you thought, the Streams screen is one `Alt+1` away.
