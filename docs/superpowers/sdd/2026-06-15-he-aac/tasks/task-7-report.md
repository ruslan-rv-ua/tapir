## Task 7 Report: i18n for unsupported-stream-format message

### Keys added

- **`player_error_unsupported_format`**
  - `uk.json`: `"Формат потоку не підтримується для відтворення"`
  - `en.json`: `"This stream format can't be played"`
  - Placed immediately after `player_recording_badge` in both files (near all `player_*` keys).

### StreamItem.tsx change

`handlePlayToggle` catch block updated in `src/components/streams/StreamItem.tsx`:

```tsx
// Before:
} catch (err) {
  addToast(String(err), "error");
}

// After:
} catch (err) {
  const msg =
    String(err) === "UnsupportedStreamFormat"
      ? m.player_error_unsupported_format()
      : String(err);
  addToast(msg, "error");
}
```

The token-equality check `String(err) === "UnsupportedStreamFormat"` maps the exact error token from Task 6's Rust backend to the localized message. All other errors fall back to `String(err)`. The other catch sites in the file (`handleRecordToggle`, `onSubmit` for pattern dialog) were NOT changed.

### Paraglide

Did NOT stage or commit `src/i18n/paraglide/`. Confirmed via `git status` before staging — only 3 source files were staged. `target/` remains untracked.

### Gate results

**pnpm vite:build**: SUCCESS
- `[paraglide-js] Compilation complete (message-modules)` — new key generated.
- Vite built in 21.65s, 3615 modules transformed.
- Pre-existing chunk-size warning (> 700 kB) present — known pre-existing condition, not a regression.

**pnpm test**: SUCCESS
- 53 test files, 463 tests, all passed. Duration ~45s.

### Files committed (commit `1ca5a27`)

1. `src/i18n/messages/uk.json`
2. `src/i18n/messages/en.json`
3. `src/components/streams/StreamItem.tsx`

### Concerns

None.
