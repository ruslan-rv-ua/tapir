# Task 6 Report: Typed UnsupportedStreamFormat Error

## Variant and Display token

Added `RadioError::UnsupportedStreamFormat` to `src-tauri/src/errors.rs`:

```rust
#[error("UnsupportedStreamFormat")]
UnsupportedStreamFormat,
```

Exact Display token: `"UnsupportedStreamFormat"` — this is the stable contract string the frontend (Task 7) will match by string equality.

## play_live arms changed

Two arms in the `match probe { ... }` block in `PlayerEngine::play_live` (engine.rs ~line 924) were changed:

1. **`Ok(Ok(Err(e)))` — decoder rejected the format:**
   - Was: `return Err(e).context("could not decode stream (unsupported format?)")`
   - Now: logs `log::warn!("Player: stream decoder rejected the format: {e:#}")` then `return Err(crate::errors::RadioError::UnsupportedStreamFormat.into())`
   - `cancel.cancel()` kept.

2. **`Err(_elapsed)` — probe timeout:**
   - Was: `return Err(anyhow::anyhow!("timed out probing stream format after {}s (unsupported codec?)", ...))`
   - Now: logs `log::warn!("Player: format probe timed out after {}s ...")` then `return Err(crate::errors::RadioError::UnsupportedStreamFormat.into())`
   - `cancel.cancel()` kept.

## Untouched arms (confirmed)

- `Ok(Ok(Ok(src)))` — success path, unchanged.
- `Ok(Err(e))` — task panic arm, still `anyhow::anyhow!("LiveSource init task panicked: {e}")`.
- `connection::connect(...).context("failed to connect to stream")` — network/connect failure, unchanged.
- `open_device_sink(...)` / `.context("Failed to open audio output stream")` — device failure, unchanged.

These remain distinct from `"UnsupportedStreamFormat"` so network and device errors cannot be mislabeled.

## How the token reaches the frontend

`play_live` returns `anyhow::Result<()>`. `RadioError` implements `std::error::Error` so anyhow's `From<E: std::error::Error>` converts it via `.into()`. No `.context(...)` is added (which would wrap and mask the token). The Tauri command `play_stream` does `.map_err(|e| e.to_string())`, so the frontend receives the exact string `"UnsupportedStreamFormat"`.

## play_file / local files

`play_file` is a separate function and is entirely unaffected by these changes.

## Test added

In `src-tauri/src/errors.rs`, a new test `unsupported_stream_format_token` was added alongside the existing `error_display_prefixes` test:

```rust
#[test]
fn unsupported_stream_format_token() {
    // This exact token is the contract with the frontend (Task 7).
    // Do NOT change the Display without updating the frontend string-match.
    assert_eq!(
        RadioError::UnsupportedStreamFormat.to_string(),
        "UnsupportedStreamFormat"
    );
}
```

## Test + clippy results

- `cargo test`: **314 passed, 0 failed** (was 313; the new test is the +1).
- `cargo clippy`: **31 pre-existing warnings, 0 new warnings** from the changed files. No errors.

## Files changed

- `src-tauri/src/errors.rs` — added `UnsupportedStreamFormat` variant + unit test
- `src-tauri/src/player/engine.rs` — changed two arms in the `play_live` probe match

## Concerns

None. The implementation is minimal, non-breaking, and the token is stable for frontend matching.
