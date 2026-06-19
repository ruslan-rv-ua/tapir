## Task 2: Extract the `LiveDecoder` trait (no behavior change)

**Files:**
- Modify: `src-tauri/src/player/engine.rs` (`LiveSource` ~457–556)

- [ ] **Step 1: Write the regression test first**

  Add a `#[test]` (gated `#[cfg(test)]`) that feeds a small in-memory **AAC-LC** (or MP3) byte buffer through a `SymphoniaDecoder` built from an `rtrb` consumer pre-filled with the bytes, and asserts it yields a non-empty first PCM block with a plausible spec (rate > 0, channels ≥ 1). This pins current symphonia behavior before the refactor. (Use a committed tiny fixture under `src-tauri/tests/fixtures/`.)

  Run: `cargo test --manifest-path src-tauri/Cargo.toml symphonia_decoder` → FAIL (type doesn't exist yet).

- [ ] **Step 2: Define the trait + move symphonia behind it**

  ```rust
  trait LiveDecoder: Send {
      /// Decode the next chunk of interleaved f32 samples, or None at end/fatal error.
      fn next_pcm(&mut self) -> Option<Vec<f32>>;
      fn spec(&self) -> SignalSpec;
  }
  ```
  Rename the current decode internals into `struct SymphoniaDecoder { format, decoder, track_id, spec }` implementing `LiveDecoder` (its `next_pcm` is today's `decode_next_packet` body, returning the `SampleBuffer` samples instead of pushing to a `VecDeque`). `LiveSource` keeps the `VecDeque<f32>` buffer and a `Box<dyn LiveDecoder>`; `Iterator::next` pulls from the buffer, refilling via `decoder.next_pcm()`.

- [ ] **Step 3: Keep `LiveSource::new` signature; build a `SymphoniaDecoder` inside it**

  `LiveSource::new(consumer, hint_mime)` stays the public entry; internally it constructs `SymphoniaDecoder::new(consumer, hint_mime)?` and wraps it. No routing yet.

- [ ] **Step 4: Verify** — `cargo test --manifest-path src-tauri/Cargo.toml` (full suite) → PASS, including the new regression test. `cargo clippy` clean.

- [ ] **Step 5: Commit**
  ```bash
  git add src-tauri/src/player/engine.rs src-tauri/tests/fixtures
  git commit -m "refactor(player): LiveDecoder trait behind LiveSource (symphonia unchanged)"
  ```

---

