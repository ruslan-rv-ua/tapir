## Profiles

A profile holds its own set of streams and its own recording rules, so that "evening broadcast" and "overnight archive" never get in each other's way.

Besides streams, a profile carries your wanted and ignored tracks, the schedule, and every recording, playback and interface setting. Exactly one profile is active at a time; the rest wait on disk. The row of the active one is marked **active**, and its name is also on the top button of the side panel, so you can always tell which set of rules is in force.

That is the whole reason to have more than one. A single set of file name templates cannot both drop news bulletins into a dated folder and archive a night of jazz as one continuous file; two profiles can, and switching between them takes one keypress instead of a trip through settings.

### Switching

Switching stops everything running — recordings and playback alike. Tapir asks before it stops recordings, naming any scheduled one among them along with the time it was due to run until; playback stops without asking. The schedule moves too: entries in the newly active profile run, and entries in the one you left will not fire until you come back — see the section "Schedule".

The **Profiles** screen (`Alt+0`) is where you manage them. The top button of the side panel, **Profile**, shows the active name and leads here — it does not switch profiles itself.

### Create, copy, rename, delete

`Ctrl+N`, or **New profile**, creates an empty one. **Duplicate** copies streams, rules and schedule along with it.

Setting up a second profile is usually four steps: duplicate the one that is closest to what you want, rename the copy, open its settings from the row menu and change the recording folder and templates, then switch to it when you actually need it. Duplicating rather than starting empty saves re-adding the streams, and the copy is inert until you switch — nothing it contains records or plays while another profile is active.

To **Rename** or **Delete** a profile, switch to another one first: the active profile cannot be changed, and deleting several selected profiles quietly leaves it in place. Tapir says which profiles it skipped, so a count of "3 deleted" against four selected rows is an answer, not a failure. The `Default` profile can never be renamed or deleted, and the name itself cannot be taken — in any capitalisation.

A profile name becomes a file name, so `\ / : * ? " < > |` are not allowed in it, nor is a leading or trailing space or dot, and it may not exceed 64 characters. When a name will not do, Tapir says so instead of saving it.

### Moving a profile to another computer

**Export** writes the profile to a single file, streams, rules and schedule included. **Import** reads such a file and offers the name that was inside it.

If a profile by that name already exists, the import does not happen: Tapir overwrites nothing and adds no number to the name. Type a different name and the profile appears alongside the old one. This is the case worth knowing in advance, because the import simply stops and it is easy to read that as the file being broken — it is not, the name is just taken.

An exported file is also a backup. Export before a large rearrangement of streams, and the way back is an import under a different name plus one switch.

### Settings for any profile

Settings are not limited to the active profile. The row menu on this screen has **Profile settings…**, so you can prepare the folder and file name templates for a profile you will use later, without stopping what is recording now. `Ctrl+Shift+,` always opens the settings of the active one; pressing it while a settings dialog is already open closes that dialog rather than re-pointing it at another profile.

Resuming playback on startup is switched on per profile — that setting lives here too, on the **Playback** tab.

### Keys on this screen

- `Enter` — switch to the focused profile
- `Ctrl+N` — new profile
- `Shift+F10`, or the ⋯ button — the row menu, where profile settings live

General list and navigation rules are in the section "Getting around".
