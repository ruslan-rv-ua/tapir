## Profiles

A profile holds its own set of streams and its own recording rules, so that "evening broadcast" and "overnight archive" never get in each other's way.

Besides streams, a profile carries your wanted and ignored tracks, the schedule, and every recording, playback and interface setting. Exactly one profile is active at a time; the rest wait on disk.

### Switching

Switching stops everything running — recordings and playback alike. Tapir asks before it stops recordings, naming any scheduled one among them along with the time it was due to run until; playback stops without asking. The schedule moves too: entries in the newly active profile run, and entries in the one you left will not fire until you come back — see the section "Schedule".

The **Profiles** screen (`Alt+0`) is where you manage them. The top button of the side panel, **Profile**, shows the active name and leads here — it does not switch profiles itself.

### Create, copy, rename, delete

`Ctrl+N`, or **New profile**, creates an empty one. **Duplicate** copies streams, rules and schedule along with it.

To **Rename** or **Delete** a profile, switch to another one first: the active profile cannot be changed, and deleting several selected profiles quietly leaves it in place. The `Default` profile can never be renamed or deleted, and the name itself cannot be taken.

A profile name becomes a file name, so `\ / : * ? " < > |` are not allowed in it, nor is a leading or trailing space or dot. When a name will not do, Tapir says so instead of saving it.

### Moving a profile to another computer

**Export** writes the profile to a single file, streams, rules and schedule included. **Import** reads such a file and offers the name that was inside it.

If a profile by that name already exists, the import does not happen: Tapir overwrites nothing and adds no number to the name. Type a different name and the profile appears alongside the old one.

### Settings for any profile

Settings are not limited to the active profile. The row menu on this screen has **Profile settings…**, so you can prepare the folder and file name templates for a profile you will use later, without stopping what is recording now. `Ctrl+Shift+,` always opens the settings of the active one.

Resuming playback on startup is switched on per profile — that setting lives here too, on the **Playback** tab.

### Keys on this screen

- `Enter` — switch to the focused profile
- `Ctrl+N` — new profile
- `Shift+F10`, or the ⋯ button — the row menu, where profile settings live

General list and navigation rules are in the section "Getting around".
