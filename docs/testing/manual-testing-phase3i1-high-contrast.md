# Phase 3I-1 — High Contrast Manual Testing Checklist

> This checklist requires a sighted tester with Windows High Contrast mode enabled.

## Setup

1. Enable Windows High Contrast: Settings → Accessibility → Contrast themes → Select a theme (e.g., "High Contrast Black")
2. Launch Tapir
3. Verify each item below

## Checklist

### Status Indicators (StreamRow)
- [ ] Recording dot visible with border
- [ ] REC label text visible
- [ ] Connecting/reconnecting dots visible with animation
- [ ] Error dot visible
- [ ] Idle dot visible (dimmer than active dots)

### Action Buttons (StreamRow)
- [ ] Play button visible (inactive state: border)
- [ ] Play button playing state: highlighted background
- [ ] Record button visible (inactive state: border)
- [ ] Record button recording state: highlighted background
- [ ] Row hover shows highlight

### Toasts (ToastContainer)
- [ ] Error toast: visible border, readable text
- [ ] Warning toast: visible border, readable text
- [ ] Success toast: visible border, readable text
- [ ] Info toast: visible border, readable text
- [ ] Dismiss button visible

### Sliders (PlaybackPosition, VolumeSlider)
- [ ] Slider track visible with border
- [ ] Slider thumb visible
- [ ] Live stream pulse bar visible
- [ ] Volume slider track and thumb visible

### Buttons (StreamsPanel)
- [ ] "Add stream" button visible with border
- [ ] "Stop all" button text visible
- [ ] Empty state "Add" button visible

### Focus Ring
- [ ] Focus ring visible on buttons (Tab key)
- [ ] Focus ring visible on table rows
- [ ] Focus ring visible on inputs
- [ ] Focus ring uses Highlight color

### Tabs (SettingsDialog)
- [ ] All settings tabs visible
- [ ] Selected tab has highlighted border
- [ ] Selected tab text highlighted

### Command Palette
- [ ] Palette container has visible border
- [ ] Input field visible with border
- [ ] Selected item highlighted
- [ ] Unselected items have readable text

### Activity Bar
- [ ] Active section button highlighted
- [ ] Disabled buttons dimmed (GrayText)
- [ ] Normal buttons visible
- [ ] Hover shows highlight
- [ ] Settings button visible

### Dialogs (AddStreamDialog, AddPatternDialog, ConfirmDialog)
- [ ] Dialog border visible
- [ ] Input fields have borders
- [ ] Error text readable (not relying on red color)
- [ ] Cancel/submit buttons visible
- [ ] Delete button visible with border

### Context Menu (StreamContextMenu)
- [ ] Delete item text readable (not relying on red)

### Tables (PatternTable, StreamTable)
- [ ] Row hover shows highlight
- [ ] Table header border visible

### Player (PlayerPanel)
- [ ] Disabled play/pause button dimmed
- [ ] Disabled stop button dimmed

### Settings Tabs
- [ ] Disabled checkboxes dimmed (GeneralTab)
- [ ] Error/warning text readable (HotkeysTab)
- [ ] Key recorder buttons visible (KeyRecorder)
- [ ] Input fields have borders (RecordingTab, ReconnectionTab)
- [ ] Browse/refresh buttons visible
- [ ] Device select visible (AudioTab)

### Wishlist (WishlistPanel)
- [ ] Add pattern buttons visible with border

### Layout
- [ ] Status bar border and text visible
- [ ] Section header border visible
- [ ] Command palette button visible

### Error Boundary
- [ ] Error heading readable (not relying on red)
