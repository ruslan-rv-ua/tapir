## Task 3: `MfAacDecoder` (Media Foundation), Windows-only

**Files:**
- New: `src-tauri/src/player/mf_aac.rs`
- Modify: `src-tauri/src/player/mod.rs` (`mod mf_aac;` under `#[cfg(windows)]`)
- Modify: `src-tauri/Cargo.toml` (the two `windows` features from Task 1, made permanent)

- [ ] **Step 1: Add the module + features** (carry over Task 1 Cargo edits).

- [ ] **Step 2: Implement `MfAacDecoder: LiveDecoder`** per the spike outcome:
  - `new(consumer: rtrb::Consumer<u8>, content_type: Option<&str>) -> anyhow::Result<Self>`: `CoInitializeEx(MTA)` + `MFStartup` (idempotent guard), create the decoder, configure input/output media types (PCM float or S16→f32 convert), parse the leading ADTS header to set the input type.
  - `next_pcm`: read bytes from the `rtrb` consumer (reuse the existing `RtrbReader` blocking-read semantics), push to the MFT, drain output samples to `Vec<f32>`; handle `MF_E_TRANSFORM_NEED_MORE_INPUT` by reading more, EOF when the consumer is abandoned.
  - `spec`: from the negotiated output type (post-SBR rate, post-PS channels).
  - On `Drop`: `MFShutdown` only if this instance started MF (refcount/`Once` guard — don't shut down MF out from under another decoder).

- [ ] **Step 3: COM threading** — all MF calls run on the `spawn_blocking` thread that owns the decoder (same thread that today runs `LiveSource::new`). Document the apartment requirement at the top of the file.

- [ ] **Step 4: Build gate** — `cargo build` + `cargo clippy` (no automated decode unit test here; MF needs the OS + real data → covered by Task 5 manual verification and the Task 1 spike).

- [ ] **Step 5: Commit**
  ```bash
  git add src-tauri/src/player/mf_aac.rs src-tauri/src/player/mod.rs src-tauri/Cargo.toml
  git commit -m "feat(player): Media Foundation HE-AAC decoder (MfAacDecoder)"
  ```

---

