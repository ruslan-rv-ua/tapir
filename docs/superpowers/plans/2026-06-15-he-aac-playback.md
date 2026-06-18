# HE-AAC Live Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 1 is a spike** — its outcome can change the code shape of Tasks 2–5; do not skip it.

**Goal:** Make live streams whose codec `symphonia` cannot decode — primarily **HE-AAC / HE-AACv2** (SomaFM's low-bitrate AAC, e.g. `groovesalad-16-aac`) — actually *play*, instead of failing the format probe. Today (after the [2026-06-15 probe-timeout fix](#relationship-to-the-2-fix)) such a stream records fine but playback ends in a "timed out probing stream format" error toast.

**Why symphonia can't:** `symphonia`'s AAC decoder implements **AAC-LC only**. HE-AAC (SBR) and HE-AACv2 (SBR+PS) are explicitly unsupported, so a 16 kbps SomaFM stream (which *must* be HE-AACv2 to be listenable at that bitrate) never yields a decodable frame. The probe then misroutes the ADTS bytes to the MP3 demuxer (overlapping `0xFFF` sync markers), which spins on "skipping junk" forever. Recording is unaffected because it never decodes — it writes raw bytes.

## Decision: which decoder

| Option | HE-AACv2 | Bundling cost | Licensing | Verdict |
|--------|----------|---------------|-----------|---------|
| **1. Windows Media Foundation AAC decoder** | ✅ | **None** (OS component on Win10/11) | OS-provided | **Recommended** |
| 2. `fdk-aac` (libfdk-aac) | ✅ (best) | Native C lib in the EXE + build toolchain | Fraunhofer FDK license — patent/field-of-use caveats | Rejected — conflicts with single clean portable EXE |
| 3. ffmpeg / `ffmpeg-next` | ✅ | Heavy; large binary | LGPL/GPL build+bundle work | Overkill |
| 4. Graceful-only (detect + localized "unsupported" message, suggest LC variant) | ❌ (doesn't play) | None | — | Keep as a *fallback layer*, not the solution |

**Recommendation — Option 1 (Media Foundation).** It is the only option that satisfies the **portable, no-installer, no-bundled-DLL** constraint (AGENTS.md) *and* decodes HE-AACv2. The `windows` crate is already a dependency (SMTC, tray AUMID, Recycle-Bin delete), so this adds Cargo features, not a new ecosystem. The app is Windows-only, so no cross-platform decoder is required. Option 4 stays as the last-resort error path under the #2 timeout.

> If the user prefers to defer native decoding, **Option 4 alone** is a much smaller plan: localize the #2 error, sniff HE-AAC, and point the user at the station's MP3/AAC-LC variant. Tasks 6–7 below already cover that layer; Tasks 1–5 are the actual-playback work.

### Why not just upgrade symphonia? (checked 2026-06-15)

Tempting, but it does **not** solve this. As of the latest release (symphonia **0.6.0**, May 2026; `0.6.0-alpha.1` was March 2026), HE-AAC is still unimplemented:
- The codec-support table in Symphonia's `master` README lists `HE-AAC (AAC+, aacPlus)` and `HE-AACv2 (eAAC+, aacPlus v2)` with decode status **`-`** (in-work / not started), default **No**. Only `AAC-LC` is **`Great`**.
- The `he-aac` / `he-aac-v2` cargo features exist only as **reserved stubs** — enabling them does not decode SBR/PS, so the 16 kbps SomaFM stream still won't play.
- No 0.5.x or 0.6.0 release notes mention SBR or parametric stereo landing.
- No licensing/doc prohibition on upgrading — the blocker is purely that the feature isn't built yet (and a 0.6 bump is a breaking API change; `rodio` 0.22 still pins symphonia 0.5, so the two would coexist as a dual-version tree — confirmed via `cargo tree`).

**Revisit trigger:** if a future symphonia flips `he-aac-v2` to a real status, the simplest fix becomes "bump symphonia + enable `he-aac-v2`" and most of Task 3 (the MF decoder) can be dropped. Until then, Media Foundation is the path.

**Architecture:**
- Introduce a `LiveDecoder` trait — `next_pcm(&mut self) -> Option<(Vec<f32>, SignalSpec)>` (interleaved f32 + spec) — so `LiveSource` becomes a thin `rodio::Source` adapter over *a* decoder rather than being hard-wired to symphonia. Today's symphonia logic moves behind `SymphoniaDecoder: LiveDecoder` with **zero behavior change** for MP3 / AAC-LC.
- Add `MfAacDecoder: LiveDecoder` in a new `src-tauri/src/player/mf_aac.rs` (Windows-only, `#[cfg(windows)]`), backed by the AAC Decoder MFT (`CLSID_CMSAACDecMFT`) fed parsed ADTS frames, or `IMFSourceReader` over a custom `IMFByteStream` wrapping the `rtrb` consumer — **the spike decides which.**
- `LiveSource::new` routes by `content_type` + a cheap sniff: `audio/aac`,`audio/aacp`,`audio/mp4` → MF; `audio/mpeg` → symphonia (unchanged); unknown → try symphonia, then MF. The #2 `PROBE_TIMEOUT` stays as the safety net around whichever decoder initializes.

**Tech Stack:** Rust, `windows` crate (`Win32_Media_MediaFoundation`, `Win32_System_Com`), `symphonia` (retained), `rodio` Source trait, `rtrb`, tokio `spawn_blocking`.

**Gates (per repo convention):** Rust — `cargo test`, `cargo clippy`. Frontend — `pnpm test` + `pnpm vite:build` (only if i18n keys touched in Task 7). NOT `tsc` (≈51 pre-existing untyped-paraglide errors).

### Relationship to the #2 fix

This plan builds on `fix/player-decode-failure` (the #2 work): `play_live` now keeps the current session alive until a successful probe, and bounds the probe with `PROBE_TIMEOUT` (`src-tauri/src/player/engine.rs`). #1 makes the probe *succeed* for HE-AAC so the timeout is never hit in the normal case; the timeout remains as the guard for genuinely undecodable input.

---

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

## Spike Outcome (2026-06-18)

**Gate: PASSED.** Media Foundation decoded `groovesalad-16-aac` (16 kbps HE-AACv2) to correct **stereo, SBR-doubled-rate** PCM. ffprobe on the decoded WAV (controller-verified, not just self-reported): `codec_name=pcm_s16le, sample_rate=32000, channels=2` — the 16000 Hz mono ADTS core was doubled to 32000 Hz by SBR and made stereo by PS, confirming the full HE-AACv2 chain ran (not just the LC core). 21.25 s in → 21.25 s out, non-silent. **Proceed with Media Foundation (Tasks 2–5).**

**Decision: use `IMFSourceReader`, not the raw AAC Decoder MFT.** SourceReader worked on the first attempt with **zero** hand-built input media type — MF's built-in ADTS byte-stream handler parses the ADTS headers, instantiates the AAC decoder internally, and applies SBR+PS. We never touched `CLSID_CMSAACDecMFT`, `MF_MT_AAC_PAYLOAD_TYPE`, `MF_MT_USER_DATA`, or the `HEAACWAVEINFO`/AudioSpecificConfig tail. This eliminates the plan's biggest risk (raw-ADTS input-type construction, risk #2) entirely.

**Exact setup that worked (reproducible for Task 3):**
1. `CoInitializeEx(None, COINIT_MULTITHREADED)` then `MFStartup(MF_VERSION, MFSTARTUP_FULL)` on the decode thread. Tolerate `S_FALSE` / `RPC_E_CHANGED_MODE` from `CoInitializeEx` (do not `?`-propagate it).
2. `MFCreateAttributes` → set `MF_SOURCE_READER_ENABLE_ADVANCED_VIDEO_PROCESSING = 0` (audio-only) → create the reader.
3. Set the **output** media type to PCM with `MF_MT_AUDIO_BITS_PER_SAMPLE = 16` and **leave rate/channels UNSET** (the key move — do not pin them), then `SetCurrentMediaType`.
4. **Read back** the negotiated output type (`GetCurrentMediaType`) to learn the real post-SBR/PS `MF_MT_AUDIO_SAMPLES_PER_SECOND` (32000) and `MF_MT_AUDIO_NUM_CHANNELS` (2).
5. `ReadSample` loop → `ConvertToContiguousBuffer` → `Lock`/`Unlock` to copy interleaved **S16LE**; break on `MF_SOURCE_READERF_ENDOFSTREAM`; handle `MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED` by re-reading the type.

**Output spec stability:** **constant from the first frame.** The negotiated type was already 32000/2 *before* the first `ReadSample`, and no `CURRENTMEDIATYPECHANGED` fired across the whole stream. So `LiveSource`/`MfAacDecoder` can read the spec once up front — but Task 3 should still keep a defensive `CURRENTMEDIATYPECHANGED` handler for mid-stream codec/bitrate switches. (Resolves risk #3.)

**COM/threading:** MTA, one `spawn_blocking` thread owns COM + MF + the SourceReader + its samples end-to-end. `MFShutdown` + `CoUninitialize` on teardown, guarded so we don't shut MF down out from under another decoder.

**Latency:** negligible (~4 ms to first PCM, file-backed; well under the < ~1 s bar).

**Production caveat for Task 3 (the one new piece the spike did NOT cover):** the spike used `MFCreateSourceReaderFromURL` over a file. The live path's bytes arrive via the `rtrb` ring, not a URL/file, so Task 3 must wrap the `rtrb` consumer in a custom `IMFByteStream` and use `MFCreateSourceReaderFromByteStream`. Output is S16LE → convert to f32 via `i16 as f32 / 32768.0`. The decode loop itself ports directly.

Spike artifacts (throwaway) were discarded; only these notes were committed. Captured samples remain under `target/spike/` (gitignored): `gs16.aac` (HE-AACv2 target), `lc.aac` (AAC-LC regression, from `groovesalad-128-aac`; the planned fip-hifi URL 404'd).

---

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

## Task 5: Manual verification (the real bug)

> No automated test exercises live decode (needs network + audio device + OS codec). This task is the acceptance gate.

- [ ] **Step 1:** `just dev` (or `/run`). Add/select the SomaFM stream `https://ice1.somafm.com/groovesalad-16-aac`.

- [ ] **Step 2 — primary bug fixed:** Press Play. **Expect:** audio plays within ~2 s; the row flips to "відтворюється"; the **track** field shows the current title; NVDA announces "Playing: …". (Previously: silent hang / timeout toast.)

- [ ] **Step 3 — switching:** While an LC-AAC or MP3 stream is playing, play the 16 kbps stream. **Expect:** clean handoff — old stops, new shows "відтворюється", old row returns to idle. (This is the #2 behavior; confirm #1 didn't regress it.)

- [ ] **Step 4 — record + play same stream:** Record the 16 kbps stream, then also Play it. **Expect:** both indicators active; recording file still valid.

- [ ] **Step 5 — no regression:** MP3 (e.g. a 128k MP3 station) and AAC-LC (fip-hifi) still play exactly as before.

- [ ] **Step 6:** Note results (and any first-frame latency) in a "## Verification" section of this file; commit.

---

## Task 6: Graceful fallback for anything still undecodable (Option 4 layer)

**Files:**
- Modify: `src-tauri/src/player/engine.rs` (error message in the `play_live` probe-failure arms)

- [ ] **Step 1:** When both decoders fail (or the `PROBE_TIMEOUT` fires), return a stable, user-facing error string distinct from network errors — e.g. an error kind the frontend can map, rather than raw anyhow text. Prefer a typed `RadioError` variant (`errors.rs`) like `UnsupportedStreamFormat` so the frontend can localize it (see Task 7) instead of showing English.

- [ ] **Step 2:** `cargo test` + `cargo clippy`. Commit:
  ```bash
  git commit -am "feat(player): typed UnsupportedStreamFormat error for undecodable streams"
  ```

---

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

## Task 8: Docs

- [ ] Update `docs/tech-stack.md` (note the MF AAC path + why symphonia alone is insufficient for HE-AAC) and `docs/architecture.md` (LiveDecoder routing). Commit `docs(player): document HE-AAC decode via Media Foundation`.

---

## Open questions / risks

1. **MF availability:** Win10/11 ship the AAC decoder MFT; "N" editions without the Media Feature Pack do **not**. The Option-4 fallback (Tasks 6–7) covers this gracefully — verify the error path on an N edition if reachable.
2. **Raw ADTS input type:** the trickiest MF detail is building the input `IMFMediaType` from the ADTS header without a container. The spike (Task 1) must nail this; record the exact `HEAACWAVEINFO`/`MF_MT_*` setup.
3. **Output spec stability:** with SBR/PS the effective rate/channels differ from the ADTS core header. `LiveSource` must take its `spec` from the **decoder output**, not the ADTS header — handle a possible spec change after the first frames.
4. **Stereo from PS:** confirm parametric stereo actually yields 2 channels (Step 4); some MF configs downmix.

## Self-Review Notes (coverage map)

- Root cause (symphonia = LC-only) → Decision section + Task 1 spike validates the replacement.
- "Just upgrade symphonia?" ruled out → Decision section (checked 2026-06-15; HE-AAC still status `-` in 0.6.0) with a revisit trigger.
- Actual playback of HE-AACv2 → Tasks 2–4 (trait, MF decoder, routing) + Task 5 manual gate.
- Don't regress MP3 / AAC-LC → Task 2 regression test + Task 4 routing keeps symphonia for MP3 + Task 5 steps 3/5.
- Don't hang → reuses #2 `PROBE_TIMEOUT` (Task 4 step 2).
- Portable-no-bundle constraint → Decision (Option 1, OS codec; `windows` crate already present).
- Genuinely-undecodable streams → Tasks 6–7 (typed error + localized message), also the N-edition risk.
- Honest testing → Task 2 has a unit test; live decode is OS/network-bound, so Tasks 1 + 5 (spike + manual) are the real gates, called out explicitly.
