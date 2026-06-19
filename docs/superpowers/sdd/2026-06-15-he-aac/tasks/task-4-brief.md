## Task 4: Route AAC to MF, keep symphonia for MP3/LC fallback

**Files:**
- Modify: `src-tauri/src/player/engine.rs` (`LiveSource::new`)

- [ ] **Step 1: Decide routing from `content_type` (+ sniff)**

  In `LiveSource::new`, before building a decoder:
  - `audio/aac`, `audio/aacp`, `application/aac`, `audio/mp4`, `audio/x-aac` → `MfAacDecoder::new(...)`; on `Err`, fall back to `SymphoniaDecoder` (covers LC where MF is somehow unavailable).
  - `audio/mpeg` / MP3 → `SymphoniaDecoder` (unchanged).
  - unknown / missing → `SymphoniaDecoder` first; if it errors, try `MfAacDecoder`.

  Wrap the chosen decoder in `LiveSource`. Keep `mime_hint` plumbing from `play_live` (already passes `conn.content_type`).

- [ ] **Step 2: Confirm the #2 timeout still guards init** — `play_live`'s `tokio::time::timeout(PROBE_TIMEOUT, spawn_blocking(...))` already wraps `LiveSource::new`; MF init now happens inside it, so a hung MF init is bounded too. No change needed, but note it.

- [ ] **Step 3: Build + full Rust suite** — `cargo test` + `cargo clippy` → PASS/clean.

- [ ] **Step 4: Commit**
  ```bash
  git add src-tauri/src/player/engine.rs
  git commit -m "feat(player): route AAC live streams to Media Foundation, MP3 to symphonia"
  ```

---

