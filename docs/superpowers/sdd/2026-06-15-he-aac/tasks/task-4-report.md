## Task 4 Report: Route AAC to Media Foundation, MP3 to Symphonia

### Files changed
- `src-tauri/src/player/engine.rs` — routing logic added
- `src-tauri/src/player/mod.rs` — removed `#[allow(dead_code)]`

---

### Routing logic added

A pure helper `decoder_kind_for_mime(hint_mime: Option<&str>) -> DecoderKind` was factored out of `LiveSource::new`. It:
1. Returns `DecoderKind::Symphonia` immediately for `None`.
2. Strips MIME parameters after `;` (e.g. `audio/aac; charset=utf-8`) and lowercases the base type.
3. On `#[cfg(windows)]`, matches `audio/aac`, `audio/aacp`, `application/aac`, `audio/x-aac`, `audio/mp4` -> `DecoderKind::Mf`.
4. Falls through to `DecoderKind::Symphonia` for `audio/mpeg`, `audio/mp3`, any unknown type, or empty string.

`LiveSource::new` matches on `decoder_kind_for_mime(hint_mime)`:
- `DecoderKind::Mf` (windows-only arm) -> calls `MfAacDecoder::new(consumer, hint_mime)`, propagates `Err` with `.context(...)` (no fallback, per OVERRIDE).
- `DecoderKind::Symphonia` -> calls `SymphoniaDecoder::new(consumer, hint_mime)` as before.

---

### cfg(windows) / cfg(not(windows)) split

- `DecoderKind` enum has the `Mf` variant behind `#[cfg(windows)]`.
- The `#[cfg(windows)]` block inside `decoder_kind_for_mime` performs the AAC match and returns early; on non-Windows the block is omitted and all MIME types fall through to `Symphonia`.
- The `use crate::player::mf_aac::MfAacDecoder` import is `#[cfg(windows)]`.
- The `DecoderKind::Mf` match arm in `LiveSource::new` is `#[cfg(windows)]`.
- `mod.rs`: `#[cfg(windows)] mod mf_aac;` with `#[allow(dead_code)]` removed.

This means the crate compiles cleanly on non-Windows with zero dead-code warnings from this module.

---

### Routing unit test added

Three unit tests in the `#[cfg(test)]` module of `engine.rs`:

1. `routing_aac_family_to_mf_on_windows` - all five AAC MIME types map to `Mf` on Windows / `Symphonia` on non-Windows; case-insensitive; `;`-param stripped.
2. `routing_mp3_to_symphonia` - `audio/mpeg`, `audio/mp3`, case variants, with params -> `Symphonia`.
3. `routing_unknown_and_missing_to_symphonia` - `None`, `""`, `application/octet-stream`, `audio/ogg`, `video/mp4` -> `Symphonia`.

Pure (no network, no OS audio, no ring buffer). Run in <1 ms.

---

### PROBE_TIMEOUT still bounds MF init

Confirmed: `play_live` wraps `LiveSource::new(consumer, mime_hint.as_deref())` inside `spawn_blocking` inside `tokio::time::timeout(PROBE_TIMEOUT, ...)`. `MfAacDecoder::new` blocks synchronously on a rendezvous channel until the decode thread signals init success or error (same contract as SymphoniaDecoder). No change to timeout machinery needed.

---

### Test + clippy results

- `cargo test`: 313 passed; 0 failed (3 new routing tests, net +3 from 310 baseline)
- `cargo clippy`: 32 warnings, 0 errors -- all pre-existing (collapsible_if, needless_borrow etc. in files not touched by this task). Zero warnings introduced by Task 4.

---

### Concerns

None. `HISTORY_PROBE_REGION` in `mf_aac.rs` is a pre-existing dead_code warning from Task 3 (kept for future seek support). All other clippy warnings are pre-existing.
