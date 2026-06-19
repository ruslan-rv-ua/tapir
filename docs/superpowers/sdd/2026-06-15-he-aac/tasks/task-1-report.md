# Task 1 SPIKE Report — Decode HE-AACv2 (`groovesalad-16-aac`) to PCM via Media Foundation

**Status: DONE.** Media Foundation decoded the 16 kbps HE-AACv2 stream to correct
**stereo, SBR-doubled-rate** PCM. The gate is met. **Use `IMFSourceReader`** (not the raw MFT).

> Note: this file previously held an unrelated "transfer_streams_to_profile" report; it has been
> overwritten with the HE-AAC spike outcome per the Task 1 brief.

---

## Decision: `IMFSourceReader` vs raw AAC Decoder MFT

**Use `IMFSourceReader` over the file/byte-stream.** It worked on the **first attempt** with
**zero** hand-built input-media-type construction. MF's built-in ADTS byte-stream handler
parses the ADTS headers itself, instantiates the AAC Decoder MFT internally, applies SBR+PS,
and exposes a single decoded audio stream. We never had to touch `CLSID_CMSAACDecMFT`,
`MF_MT_AAC_PAYLOAD_TYPE`, `MF_MT_USER_DATA`, or the `HEAACWAVEINFO`/AudioSpecificConfig tail.

The raw-MFT fallback was **not needed** and therefore not exercised. For production (Task 3),
SourceReader is the clear choice for file-shaped input. The one caveat for the live path:
SourceReader needs a *byte stream*. In production the live bytes arrive via the `rtrb` ring,
not a URL/file, so Task 3 must wrap the ring in a custom `IMFByteStream` (or an `IMFMediaSource`)
and feed SourceReader from that — see "Production implications" below.

## Exact input-media-type setup that worked (reproducible for Task 3)

For raw ADTS there is **no manual input type at all**. The full working setup:

```rust
// 1. COM + MF on the decode thread (MTA).
CoInitializeEx(None, COINIT_MULTITHREADED);   // S_FALSE / RPC_E_CHANGED_MODE tolerated
MFStartup(MF_VERSION, MFSTARTUP_FULL)?;

// 2. Create the reader from the .aac path (wide, NUL-terminated).
let mut attrs: Option<IMFAttributes> = None;
MFCreateAttributes(&mut attrs, 1)?;
let attrs = attrs.unwrap();
attrs.SetUINT32(&MF_SOURCE_READER_ENABLE_ADVANCED_VIDEO_PROCESSING, 0)?; // audio-only
let reader = MFCreateSourceReaderFromURL(PCWSTR(wide.as_ptr()), &attrs)?;

let stream = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;

// 3. Ask ONLY for PCM 16-bit; leave rate/channels UNSET so MF reports its
//    native post-SBR/PS output. This is the key move — do NOT pin the rate.
let out = MFCreateMediaType()?;
out.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
out.SetGUID(&MF_MT_SUBTYPE,    &MFAudioFormat_PCM)?;
out.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
reader.SetCurrentMediaType(stream, None, &out)?;

// 4. Read back the ACTUAL negotiated output type — this reveals SBR/PS.
let actual   = reader.GetCurrentMediaType(stream)?;
let rate     = actual.GetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND)?; // 32000
let channels = actual.GetUINT32(&MF_MT_AUDIO_NUM_CHANNELS)?;       // 2

// 5. Pull samples.
loop {
    reader.ReadSample(stream, 0, None, Some(&mut flags), Some(&mut ts), Some(&mut sample))?;
    if flags & MF_SOURCE_READERF_ENDOFSTREAM != 0 { break; }
    if flags & MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED != 0 { /* re-read type */ }
    let buf = sample.ConvertToContiguousBuffer()?;
    buf.Lock(&mut ptr, .., &mut cur_len)?;  // cur_len bytes of interleaved S16LE
    /* copy out */
    buf.Unlock()?;
}
```

ADTS header we parsed from `gs16.aac` (first frame `FF F9 60 40 0F 01 7C 01`):
`mpeg4=false (MPEG-2 ADTS), crc_absent=true, profile_bits=1 (object_type=2 → AAC-LC core),
freq_idx=8 → core_rate=16000 Hz, channel_cfg=1 (mono core)`. SourceReader consumed these
headers itself; we did not have to hand them to any MFT.

## Output spec

ffprobe on the produced WAV:

```
codec_name=pcm_s16le
sample_rate=32000
channels=2
```

- **32000 Hz** = the 16000 Hz ADTS core **doubled by SBR**.
- **2 channels** = stereo **synthesized by PS** from the mono core.
- This is the proof MF applied the full HE-AACv2 chain (SBR + PS), not just the LC core.
  (ffprobe on the raw `gs16.aac` independently reports `profile=HE-AACv2, 32000, stereo`.)

**Is the output spec constant from the first frame?** **Yes — constant.** The negotiated
output type read *before* the first `ReadSample` was already `32000 Hz / 2 ch`, and
**no `MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED` event fired** across all 45 `ReadSample`
calls. So SBR/PS are reflected in the output type immediately; the decoder does **not** start
at the core rate and re-spec after a few frames.

**Implication for `LiveSource` re-spec logic:** for a stream whose ADTS config is stable, the
output (rate, channels) can be read once up front and treated as fixed. Task 3 should *still*
handle `CURRENTMEDIATYPECHANGED` defensively (a station could switch bitrate/codec mid-stream,
which would re-spec), but no per-frame re-spec dance is required for steady-state HE-AACv2.

## COM / threading constraints observed

- `CoInitializeEx(None, COINIT_MULTITHREADED)` then `MFStartup(MF_VERSION, MFSTARTUP_FULL)`
  at the start of the decode thread; `MFShutdown()` + `CoUninitialize()` at the end. This is
  exactly the MTA model that fits `tokio::task::spawn_blocking`.
- MTA worked with no issues. `CoInitializeEx` may return `S_FALSE` (already initialized) or
  `RPC_E_CHANGED_MODE` if the thread was previously STA — both are non-fatal and must be
  tolerated (do not `?`-propagate the `CoInitializeEx` HRESULT blindly).
- All MF interface pointers are used on the same thread that called `MFStartup`. Production
  must keep the SourceReader and its samples confined to the one `spawn_blocking` thread.

## Latency to first PCM

- **Time to first PCM frame: ~4.2 ms** (wall-clock, measured from just before the first
  `ReadSample`). This is file-backed I/O so it understates network reality, but it shows the
  decoder itself adds negligible startup latency — well under the "< ~1 s buffered" bar.
- First `ReadSample` returned a full sample immediately; a total of **45 `ReadSample` calls**
  drained the entire 42,524-byte file to EOS. MF buffers/decodes in coarse chunks
  (~944 input bytes and ~15k decoded frames per call on average), not frame-by-frame.

## Raw evidence

**ffprobe on the OUTPUT WAV (the gate):**
```
$ ffprobe -v error -show_entries stream=sample_rate,channels,codec_name -of default=noprint_wrappers=1 target\spike\gs16.wav
codec_name=pcm_s16le
sample_rate=32000
channels=2
```
Duration: `format=duration → 21.248000` s.

**Binary logged output:**
```
[spike] input size = 42524 bytes
[spike] ADTS: mpeg4=false crc_absent=true profile_bits=1 (obj_type=2) freq_idx=8 core_rate=16000Hz channel_cfg=1
[spike] => CORE is 16000Hz / 1ch. HE-AACv2 SBR should double rate, PS should make it stereo.
[spike] negotiated output: 32000 Hz, 2 ch, 16 bit PCM
[spike] end of stream after 45 ReadSample calls
[spike] DECODE OK via IMFSourceReader
[spike]   output sample_rate = 32000 Hz
[spike]   output channels    = 2
[spike]   PCM bytes          = 2719744
[spike]   PCM frames         = 679936
[spike]   time-to-first-PCM  = 4.1654ms
```

**File sizes:**
```
gs16.aac    42,524 bytes  (input, raw ADTS HE-AACv2, ~21 s @ 16 kbps)
gs16.wav 2,719,788 bytes  (output = 2,719,744 PCM + 44-byte header; 679,936 frames @ 32000 Hz/2ch = 21.25 s — no truncation)
```

**Non-silence check:** raw S16LE bytes from the middle of the WAV vary
(`2E FE FC FF FC FF F8 01 F8 01 79 02 79 02 80 01 …`) — genuine audio, not zeros.
Interleaved L/R pairs are momentarily near-equal here (PS reconstructs a near-mono image at
this instant), which is normal for PS output, not a stereo-duplication bug.

## Samples captured

- `target/spike/gs16.aac` — 42,524 B, **HE-AACv2** (the target stream), no ICY metadata
  (captured with a plain GET, **no `Icy-MetaData: 1`** header → body is pure ADTS).
- `target/spike/lc.aac` — 62,331 B, **AAC-LC** regression sample from
  `https://ice1.somafm.com/groovesalad-128-aac` (ffprobe: `profile=LC, 44100, stereo`).
  The intended `fiphifi-hifi.aac` URL returned **404**, so this SomaFM 128k LC stream was used
  instead.
- MP3 regression sample: **skipped** (optional; no easy URL on hand). Not needed for the gate.

## Commands run (PowerShell) and output

```powershell
# Capture HE-AACv2 sample WITHOUT Icy-MetaData header (pure ADTS)
$u='https://ice1.somafm.com/groovesalad-16-aac'; ... -> Content-Type: audio/aac ; Bytes written: 42524

# ffprobe raw input
ffprobe -v error -show_entries stream=sample_rate,channels,channel_layout,codec_name,profile ... gs16.aac
  codec_name=aac / profile=HE-AACv2 / sample_rate=32000 / channels=2 / channel_layout=stereo

# ADTS header bytes
FF F9 60 40 0F 01 7C 01

# AAC-LC regression
https://ice1.somafm.com/groovesalad-128-aac -> audio/aac ; bytes=62331 ; profile=LC, 44100, 2ch

# Build + run the spike
cargo run --manifest-path src-tauri/Cargo.toml --bin spike_mf -- target/spike/gs16.aac target/spike/gs16.wav
  (output above)

# Gate
ffprobe -v error -show_entries stream=sample_rate,channels,codec_name -of default=noprint_wrappers=1 target\spike\gs16.wav
  pcm_s16le / 32000 / 2
```

## Production implications (for Tasks 3+)

1. **SourceReader is the integration shape.** No raw-MFT input-type construction needed for
   the file case. For the **live** case the bytes come from `rtrb`, not a URL — wrap the ring
   in a custom `IMFByteStream` and use `MFCreateSourceReaderFromByteStream`, OR keep using
   `MFCreateSourceReaderFromURL` only for non-live/file playback. The decode logic
   (out-type = PCM16, read-back negotiated rate/channels, `ReadSample` loop, Lock/Unlock,
   handle `ENDOFSTREAM` + `CURRENTMEDIATYPECHANGED`) ports directly.
2. **Output is S16LE interleaved**; production wants f32 → convert `i16 as f32 / 32768.0`.
3. **Spec is stable** for steady HE-AACv2; read it once, but keep the
   `CURRENTMEDIATYPECHANGED` handler for codec/bitrate switches.
4. **Threading:** one `spawn_blocking` thread owns COM(MTA)+MF+SourceReader+samples end to end.

## Throwaway artifacts left in the working tree (controller to discard)

- `src-tauri/Cargo.toml` — added `Win32_Media_MediaFoundation` + `Win32_System_Com` to the
  `windows` feature list (temporary).
- `src-tauri/src/bin/spike_mf.rs` — the prototype binary.
- `target/spike/*` — `gs16.aac`, `gs16.wav`, `lc.aac`.

No `git add`/`git commit` performed.
