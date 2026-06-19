## Task 1: Spike — decode `groovesalad-16-aac` to PCM via Media Foundation

**Goal:** De-risk Option 1 before any refactor. Prove we can turn this stream's bytes into correct PCM, and pick MFT-vs-SourceReader. Throwaway code on a spike branch.

- [ ] **Step 1: Add MF Cargo features** (temporarily, on the spike branch)

  In `src-tauri/Cargo.toml`, add to the `windows` feature list:
  ```toml
  "Win32_Media_MediaFoundation",
  "Win32_System_Com",
  ```

- [ ] **Step 2: Capture a real sample**

  With the app (or a one-off `reqwest` snippet), save ~10 s of raw bytes from `https://ice1.somafm.com/groovesalad-16-aac` to `target/spike/gs16.aac` (strip ICY metadata using the same metaint logic as `engine.rs`, or request without `Icy-MetaData: 1`). Also grab a known **AAC-LC** sample (e.g. fip-hifi) and an **MP3** sample for regression.

- [ ] **Step 3: Prototype decode (binary or `#[ignore]` test)**

  Write `src-tauri/src/bin/spike_mf.rs` that:
  1. `MFStartup`, creates the AAC Decoder MFT (or `IMFSourceReader` over the file),
  2. configures input type from the ADTS header (profile, sample rate index, channel config) — for raw ADTS, set `MF_MT_AAC_PAYLOAD_TYPE` / build the `HEAACWAVEINFO` `MFT_INPUT_TYPE` from the AudioSpecificConfig,
  3. pulls PCM out, writes `target/spike/gs16.f32` (or a WAV),
  4. logs the **output** sample rate + channel count.

- [ ] **Step 4: Verify the output is HE-AACv2-correct**

  Confirm: decode succeeds; output is **stereo** and **upsampled** (SBR doubles the effective rate, PS synthesizes stereo) — i.e. the MFT actually applied SBR+PS, not just the LC core. Sanity-listen or inspect with `ffprobe`/Audacity. Confirm latency to first PCM is acceptable (< ~1 s of audio buffered).

- [ ] **Step 5: Record the decision** in this file under a new "## Spike Outcome" section:
  - MFT vs SourceReader (and why),
  - exact input-media-type setup that worked for raw ADTS,
  - output spec handling (does it stay constant after SBR kicks in, or change after the first frames? — drives `LiveSource` re-spec logic),
  - any threading/COM-apartment constraints (MTA via `CoInitializeEx(COINIT_MULTITHREADED)` inside the `spawn_blocking` decode thread).

- [ ] **Step 6: Commit the spike notes only** (discard prototype code or park it under `docs/`):
  ```bash
  git add docs/superpowers/plans/2026-06-15-he-aac-playback.md
  git commit -m "docs(player): HE-AAC spike outcome — MF decode validated"
  ```

> **Gate:** Do not proceed if the spike can't produce correct stereo PCM from the 16 kbps stream. If MF proves unworkable, fall back to Option 4 (Tasks 6–7) and stop.

---

