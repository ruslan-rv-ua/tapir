# Retry Counter Display in StreamItem

**Date:** 2026-05-29  
**Branch:** feature/retries-counter  
**Scope:** Frontend only — no Rust/backend changes

## Problem

During the `reconnecting` state, `StreamItem` shows "Reconnecting..." in both the status icon tooltip and the status cell. `StreamStatus.reconnectAttempt` already carries the current attempt number, but it is never displayed. Users have no way to know how many attempts have been made or how many remain.

## Goal

Show "Attempt 3 of 10" (or "Attempt 3" when unlimited) wherever "Reconnecting..." currently appears — in the status cell (column 5) and the status icon's accessible label/title (column 1).

## Data sources

- `StreamStatus.reconnectAttempt: number | null` — current attempt number; `null` when not reconnecting
- `ReconnectConfig.maxRetries: number` — `0` means unlimited; lives in `$recordingSettings` store

## i18n changes

Two new keys added to both `en.json` and `uk.json`:

| Key | EN | UK |
|---|---|---|
| `status_reconnecting_attempt` | `Attempt {attempt} of {max}` | `Спроба {attempt} з {max}` |
| `status_reconnecting_attempt_unlimited` | `Attempt {attempt}` | `Спроба {attempt}` |

Selection logic (derives `retryLabel`):

```
reconnectAttempt !== null && maxRetries > 0  →  status_reconnecting_attempt({ attempt, max })
reconnectAttempt !== null && maxRetries === 0 →  status_reconnecting_attempt_unlimited({ attempt })
reconnectAttempt === null                     →  status_reconnecting()   // fallback
```

The existing `"reconnecting"` key (used for live-region announcements in `App.tsx`) is unchanged.

## Component changes

### `StreamList.tsx`

Subscribe to `$recordingSettings` once; read `maxRetries`; pass as new `maxRetries: number` prop to `<StreamItem>`:

```tsx
const recordingSettings = useStore($recordingSettings);
const maxRetries = recordingSettings?.reconnect.maxRetries ?? 0;
// …
<StreamItem … maxRetries={maxRetries} />
```

### `StreamItem.tsx`

1. Add `maxRetries: number` to the `Props` interface.
2. Derive `retryLabel` from `status.reconnectAttempt` and `maxRetries` using the logic above.
3. Replace both occurrences of `m.status_reconnecting()` (lines 117 and 125) with `retryLabel`.

No other files change.

## Files affected

| File | Change |
|---|---|
| `src/i18n/messages/en.json` | +2 keys |
| `src/i18n/messages/uk.json` | +2 keys |
| `src/components/streams/StreamList.tsx` | subscribe to `$recordingSettings`; pass `maxRetries` prop |
| `src/components/streams/StreamItem.tsx` | accept `maxRetries` prop; derive and use `retryLabel` |

## Edge cases

- `reconnectAttempt === null` while state is `"reconnecting"` (brief transient): falls back to "Reconnecting..."
- `maxRetries === 0` (unlimited): shows "Attempt N" with no max
- `$recordingSettings` not yet loaded (`null`): defaults `maxRetries` to `0` → unlimited display
