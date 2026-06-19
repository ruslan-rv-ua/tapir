## Task 7: i18n for the unsupported-format message

**Files:**
- Modify: `src/i18n/messages/uk.json`, `src/i18n/messages/en.json`
- Modify: the player error toast mapping (`src/components/streams/StreamItem.tsx` `handlePlayToggle` catch, or central error mapper)

- [ ] **Step 1:** Add keys, e.g. `player_error_unsupported_format` — uk: "Формат потоку не підтримується для відтворення"; en: "This stream format can't be played". Map the typed error from Task 6 to this message; fall back to `String(err)` for other errors.

- [ ] **Step 2:** `pnpm vite:build` (regenerates paraglide) + `pnpm test`. Commit:
  ```bash
  git add src/i18n/messages src/i18n/paraglide src/components/streams/StreamItem.tsx
  git commit -m "i18n(player): localized unsupported-stream-format message"
  ```

---

