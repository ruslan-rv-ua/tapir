## Getting around

Tapir fully supports keyboard navigation. All major operations have keyboard shortcuts.

### Screen zones

The window is divided into zones. Use `F6` and `Shift+F6` to move between them forward and backward. Three zones are always present: **Sidebar**, **Player**, and **Status**. The rest depend on the current screen. When you enter a new zone, Tapir announces its name.

Inside a zone, use the arrow keys, `Home`, and `End` to move around. Pressing `Tab` moves focus out of the zone.

### Working with lists

- **Main action:** press `Enter` to perform the primary action on the focused row. `Space` mostly does the same thing. `Space` acts as a true toggle only where the row has an on/off state (like in the Schedule), and it has no effect in the Station Browser.
- **Modifiers with Enter:** these apply only to the focused row. Their specific action depends on the screen (see the section for the respective screen).
- **Selection:** use `Ctrl+Space` to toggle selection for a row. `Shift+↑` or `Shift+↓` select a range, `Ctrl+A` selects all visible rows. Press `Escape` to clear the selection.
- **Deletion:** the `Delete` key removes the focused row or all selected rows, always asking for confirmation. In the Station Browser, this key has no effect.
- **Context menu:** open it with a right click, the menu key, or `Shift+F10`. Outside of lists, there are no context menus in the application.

### Command palette and screens

Press `Ctrl+K` to open the command palette. It lets you find actions and streams in one search.

To switch between screens, use `Alt` with a digit from `0` to `5`.

### Global windows

- `F1` — help
- `Ctrl+,` — application settings
- `Ctrl+Shift+,` — profile settings

### Status bar

At the bottom of the window is the status bar. It shows three metrics:
- how many streams are currently being recorded
- available free disk space
- duration of the longest active recording
