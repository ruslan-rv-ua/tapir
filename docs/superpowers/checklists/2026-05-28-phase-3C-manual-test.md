# Phase 3C — Saved Songs Manager: Manual NVDA Acceptance Test

> Run with NVDA active. Fill in date/version when tested.

## Pre-conditions

- [ ] `data/recordings/` contains at least 3 MP3 files across 2 stations
- [ ] At least one file has `_incomplete` suffix (or simulate by renaming)
- [  ] Tapir built and launched (`pnpm tauri dev`, or release: `pnpm tauri build` then `src-tauri/target/release/tapir.exe`)

## Navigation

- [ ] Tab from ActivityBar → Songs filter zone → Songs list zone → Player → StatusBar → cycles back
- [ ] Shift+Tab reverses the cycle
- [ ] F6 / Shift+F6 jumps zones as expected
- [ ] Clicking "Збережені пісні" in the ActivityBar opens the Songs panel

## Filter bar

- [ ] Search input filters list as typed; NVDA reads the result count
- [ ] Sort dropdown changes order (verify date desc / title asc / artist asc / size desc)
- [ ] Station chip "Усі станції" + per-station chips toggle filter; `aria-pressed` reflected by NVDA
- [ ] Searching for an empty string restores the full list

## List

- [ ] Up/Down moves between rows; NVDA reads the full row aria-label (`{title}, виконавець {artist}, станція {station}, {sizeMb} МБ, записано {date}`)
- [ ] Left/Right walks segments (track / tech / Play / Menu)
- [ ] For incomplete rows, the status segment "незавершений" appears first
- [ ] Shift+F10 on a row opens the context menu on that row
- [ ] Right-click on a row opens the context menu

## Context menu

- [ ] Грати → playback begins; PlayerPanel reflects the file
- [ ] Відкрити в Explorer → Explorer opens with the file highlighted
- [ ] Перейменувати… → dialog opens, current name selected (focus on input)
- [ ] Редагувати теги… → dialog opens, title field focused
- [ ] Видалити → ConfirmDialog opens with focus on Cancel (default)
- [ ] ESC closes the menu without action

## Tag editor

- [ ] Editing artist/title/album/genre and Save → toast "Теги оновлено"; list row updates without rescan
- [ ] ESC cancels without saving
- [ ] Submitting with empty album/genre clears the corresponding frame in the file

## Rename

- [ ] New name with collision → file saved with suffix (`_2`, `_3`); toast announces new filename
- [ ] Empty input → Save button disabled
- [ ] Same-name input → no-op (file stays as-is, no `_2` suffix)
- [ ] ESC cancels

## Delete

- [ ] Confirm → file moved to Recycle Bin; toast + announce "Пісню видалено"
- [ ] Verify file appears in Windows Recycle Bin and can be restored
- [ ] Cancel keeps the file
- [ ] File open by Tapir player → toast surfaces OS error (cannot delete in-use file)

## Incomplete files

- [ ] Files ending in `_incomplete` show status badge "незавершений"
- [ ] Play / Tags / Rename / Delete actions all available for incomplete files

## Loading & errors

- [ ] First open of section announces "Завантаження пісень…" then renders the list
- [ ] `output_dir` empty / missing → "Поки що немає записаних пісень" displayed
- [ ] Corrupt MP3 in directory → skipped silently, others load (check console for the warn)

## Refresh behavior

- [ ] Start a new recording in Streams panel; let it finalize; switch to Songs → new file appears (triggered by `recording-completed`)
- [ ] External delete via Explorer → list does NOT auto-refresh (acceptable; next section open refreshes)

## Windows High Contrast

- [ ] Activate Windows High Contrast mode
- [ ] Filter chips, list rows, action buttons, menu items, and all dialogs remain readable
- [ ] `aria-pressed` state of station chip is visually distinguishable in HC
- [ ] Status badge "незавершений" uses `[Mark]/[MarkText]` colors

## Sign-off

- Tested by: _____
- Date: _____
- NVDA version: _____
- Tapir build hash: _____
- Notes: _____
