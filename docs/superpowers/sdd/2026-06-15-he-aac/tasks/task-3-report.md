# Task 3 Report — `MfAacDecoder` (Media Foundation HE-AAC decoder)

**Status: DONE** — the decoder really decodes the HE-AACv2 capture to correct PCM (validated offline against the real `gs16.aac`).

## What was built

A Windows-only `MfAacDecoder` (`src-tauri/src/player/mf_aac.rs`) implementing the
`LiveDecoder` trait, backed by `IMFSourceReader` over a **custom `IMFByteStream`
that wraps the `rtrb::Consumer<u8>` ring** — the one new piece the spike didn't
cover. The spike's decode loop (PCM16 output, read-back negotiated spec,
`ReadSample` → `ConvertToContiguousBuffer` → `Lock`/`Unlock` → S16→f32) ported
directly; the work was making the byte-stream wrapper behave so MF's ADTS source
accepts it.

### Files changed
- **NEW** `src-tauri/src/player/mf_aac.rs` — the decoder + byte stream.
- **MOD** `src-tauri/src/player/mod.rs` — `#[cfg(windows)] #[allow(dead_code)] mod mf_aac;` (dead_code allowed only until Task 4 routes to it).
- **MOD** `src-tauri/src/player/engine.rs` — one token: `trait LiveDecoder` → `pub(crate) trait LiveDecoder` (cross-module impl). No behavior change.
- **MOD** `src-tauri/Cargo.toml` — added `windows` features `Win32_Media_MediaFoundation`, `Win32_System_Com`, `Win32_System_Com_StructuredStorage`, `Win32_System_Variant` (the last two are needed by `IMFAttributes_Impl`'s `PROPVARIANT`), and added **`windows-core = "0.62"` as a direct dependency** (the `#[implement]` macro emits absolute `::windows_core::` paths that must resolve).
- **MOD** `src-tauri/Cargo.lock` — the one-line `windows-core 0.62.2` addition.

## IMFByteStream method set, and which the source actually called

Implemented **all 17** `IMFByteStream_Impl` methods. Determined empirically (trace
logging) which the MF ADTS source calls during open + decode of `gs16.aac`:

| Method | Called? | Behavior |
|---|---|---|
| `GetCapabilities` | **yes** | `IS_READABLE \| IS_SEEKABLE \| IS_REMOTE \| IS_PARTIALLY_DOWNLOADED` |
| `GetLength` | **yes, heavily** | reports bytes-available-so-far (see below) |
| `GetCurrentPosition` | yes | running logical position |
| `SetCurrentPosition` | **yes** | sets position (seeks served from history) |
| `Seek` | **yes** | computes target from origin+offset, sets position |
| `Read` | **yes** | blocking read from history/ring |
| `IsEndOfStream` | yes | drained + abandoned + empty |
| `BeginRead` / `EndRead` | **no** (not called for this stream) | implemented anyway: synchronous read + `MFCreateAsyncResult`+`MFInvokeCallback`; `EndRead` returns the byte count stashed by `BeginRead` |
| `SetLength`/`Write`/`BeginWrite`/`EndWrite` | no | return failure (`MF_E_BYTESTREAM_UNKNOWN_LENGTH`) |
| `Flush`/`Close` | no/at-teardown | `Ok(())` |

The source uses **synchronous `Read`**, not the async `Begin/EndRead` pair, so the
async path is implemented-but-not-exercised-by-this-stream; it completes
synchronously and signals the callback per the documented `MFInvokeCallback`
pattern, so it is correct if a future source ever calls it.

### The two non-obvious problems (and fixes)
The spike used `MFCreateSourceReaderFromURL` over a `.aac` **file**; a raw byte
stream has neither URL nor length, which broke source resolution in two stages:

1. **`MF_E_UNSUPPORTED_BYTESTREAM_TYPE` (0xC00D36C4)** at `MFCreateSourceReaderFromByteStream`. The resolver can't sniff a URL-less stream. **Fix:** the byte stream **also implements `IMFAttributes`** (delegating to a real internal `MFCreateAttributes` store) and pre-seeds `MF_BYTESTREAM_CONTENT_TYPE = "audio/aac"`; the resolver QIs the stream for `IMFAttributes`, reads that, and picks the ADTS source.
2. **`MF_E_BYTESTREAM_NOT_SEEKABLE` (0xC00D36EE)** next. The ADTS source requires seekability at open. **Fix:** advertise `IS_SEEKABLE` and back seeks with a replay `history: Vec<u8>` of all bytes pulled. But with `GetLength` returning *unknown*, the source then read-ahead-seeked to `262144` (256 KB) **past the live tail** → instant EOF, 0 samples. **Final fix:** `GetLength` reports *bytes-available-so-far* (history + whatever is currently in the ring), which clamps the source's read-ahead to data we actually have. With that, it reads strictly sequentially and decodes the whole stream.

## COM/MF lifecycle guard (chosen approach + why)

- **COM:** `CoInitializeEx(None, COINIT_MULTITHREADED)` per decoder, on its owning thread. `S_FALSE` (already-init, same mode) counts as owned → balanced by one `CoUninitialize` on drop. `RPC_E_CHANGED_MODE` (thread already STA) is tolerated, **not** propagated, and we do **not** `CoUninitialize` (we didn't own it). MF works from STA too.
- **MF:** a **process-wide `AtomicUsize` refcount** (`MfStartupGuard`). The first live decoder calls `MFStartup`; the last to drop calls `MFShutdown`. Chosen over `std::sync::Once` / "leave MF up for process lifetime" because the app can have **multiple concurrent decoders** (e.g. play + record two AAC streams), and a refcount guarantees one decoder never shuts MF down while another is mid-decode, while still releasing MF when idle. Startup failure rolls the count back so a later instance can retry.
- All MF objects (reader, byte stream, samples) are created and used on the single owning thread; `unsafe impl Send` documents the contract that Task 4 moves the value onto one `spawn_blocking` thread before any decode call and never shares the COM pointers.

## VALIDATION (the gate) — PASSED

Offline, no network, no audio device. Read `target/spike/gs16.aac` (42 524 bytes,
the real groovesalad-16-aac HE-AACv2 capture) into an `rtrb` ring, dropped the
producer, built `MfAacDecoder` over the consumer, drained `next_pcm()` to
exhaustion (via a temporary `#[ignore]`d test, since removed — not committed, and
the committed tree does not depend on the gitignored fixture):

```
RESULT samples=1359872 rate=32000 ch=2
decoded 1359872 f32 samples across 44 blocks
```

- **Spec: 32000 Hz / 2 channels** — matches the spike exactly: the 16 kHz mono ADTS core was SBR-doubled to 32 kHz and PS-synthesized to stereo, proving the full HE-AACv2 chain ran (not just the LC core).
- **1 359 872 f32 samples** / 2 ch / 32000 Hz ≈ **21.25 s** of audio, matching the spike's "21.25 s in → 21.25 s out".
- No `CURRENTMEDIATYPECHANGED` fired mid-stream (spec constant from frame 0), consistent with the spike; the defensive re-read handler is retained anyway.

The validation was re-run after a defensive hardening of the read loop (loop
`fill_history` until past a forward seek or EOF) — identical result, no regression.

## Build / clippy

- `cargo build --manifest-path src-tauri/Cargo.toml` from a clean `tapir` rebuild: **0 warnings**.
- `cargo clippy --manifest-path src-tauri/Cargo.toml`: **no findings reference `mf_aac.rs` or `player/mod.rs`**. (The crate's ~31 clippy warnings are pre-existing `collapsible_if`-style lints in unrelated files from the current toolchain; verified present on the base commit and untouched by this task.)
- `cargo test --lib`: **308 passed** (no regressions from the `engine.rs` visibility change).

## Concerns

1. **`history` grows unbounded.** To support backward seeks the byte stream retains every byte ever pulled. For a multi-hour live stream that is a slow memory leak (16 kbps ≈ 7 MB/hr; higher-bitrate AAC proportionally more). The format-probe seeks all land in the first few KB, so a bounded design is viable: keep history until the source stops seeking (or a small ring of the last N KB) then switch to pure passthrough. **Recommend Task 4/5 bound this.** Functionally correct as-is.
2. **`GetLength` drains the entire ready ring into `history` on each call.** Combined with (1), this means the whole stream accumulates in `history`. It is also what makes the source read sequentially instead of overshooting — so the drain-on-GetLength is load-bearing, not incidental. A bounded-history redesign must preserve "GetLength reports available bytes."
3. **`BeginRead`/`EndRead` are unexercised by this stream** (the ADTS source used synchronous `Read`). They are implemented correctly per docs but have not been validated against a source that actually calls them.
4. **`dead_code` is allowed on the `mf_aac` module** only because nothing constructs `MfAacDecoder` yet — Task 4 wires it into `LiveSource::new`'s routing and should remove the attribute.
5. **MF availability:** decode requires the OS AAC decoder (absent on Win "N" editions without the Media Feature Pack); `MfAacDecoder::new` returns `Err` there, which Task 4's fallback-to-symphonia / Task 6 typed error must handle.

## Fix pass (review findings)

Addresses the Critical soundness bug and the two Important issues from review. The
decode logic (IMFSourceReader, PCM16-out + read-back spec, S16→f32, the rtrb-backed
IMFByteStream with the content-type hint + GetLength-reports-bytes-so-far tricks) is
**unchanged**; the fix is about *where* the COM work runs.

### New thread architecture (Critical: cross-apartment COM → soundness)
`MfAacDecoder` no longer holds any COM pointer. `new()` spawns **one dedicated decode
thread** (`mf-aac-decode`) that it owns and moves the `rtrb::Consumer<u8>` onto. That
thread runs the **entire COM/MF lifecycle**: `CoInitializeEx(MTA)` + `MFStartup`
(refcount guard), builds the byte stream + `IMFSourceReader`, sets the PCM16 output
type, reads back the negotiated `SignalSpec`, then loops `ReadSample` → S16→f32 →
push `Vec<f32>` into a **bounded** `sync_channel` (cap 16 blocks ≈ a few hundred ms;
`send` blocks when full so decode paces to playback instead of buffering the whole
stream into RAM). Handles ENDOFSTREAM→close, CURRENTMEDIATYPECHANGED→log, empty-PCM→
continue, as before.

Init is a **rendezvous handshake**: a `sync_channel::<Result<SignalSpec>>(0)` on which
`new()` blocks until the thread reports `Ok(spec)` or the init `Err`. So `new()` returns
`Ok(Self{..})` only after the reader exists and the spec is known — the reader is **not**
deferred to first pull, preserving the existing `play_live` probe/timeout contract
(`new()` wrapped in `PROBE_TIMEOUT`; `stop_session` only after success).

`next_pcm(&mut self)` is now `pcm_rx.recv().ok()` — a pure channel recv, **no COM**, so
it is safe to call from cpal's audio-callback thread (a different apartment). `spec()`
returns the cached spec captured during `new()`.

### `unsafe impl Send` removed (yes)
The struct now holds only `Send` things: `Option<Receiver<Vec<f32>>>`, `SignalSpec`,
`Arc<AtomicBool>` (stop flag), `Option<JoinHandle<()>>`. It is **naturally `Send`** —
confirmed by the compiler, since `MfAacDecoder` impls `LiveDecoder: Send` and the crate
builds. The `unsafe impl Send` and its false "moved onto one spawn_blocking thread"
contract are gone.

### Teardown order, on the owning thread
The decode thread tears down in the required order — **reader `Release` → `MFShutdown`
(guard drop) → `CoUninitialize`** — all on the one thread that created them (function
`teardown`). The previous bug (Drop body ran `CoUninitialize` *before* fields dropped,
on whatever thread held the last ref) is gone: `MfAacDecoder::drop` does no COM at all.

### Shutdown without hang/deadlock
Two things can block the decode thread: a `ReadSample` whose byte stream waits on the
ring, and a `send` into a full bounded PCM channel. `Drop` resolves both before joining:
it sets the shared `stop: Arc<AtomicBool>` (the byte stream's `fill_history` checks it
and returns synthetic EOF, so a `ReadSample` waiting on the live tail completes), **then
drops the receiver** (a blocked `send` returns `Err` → thread exits), **then joins**.
Neither block can outlive Drop. The original cancel path (writer drops the rtrb producer
→ consumer abandoned → byte-stream EOF → ReadSample ENDOFSTREAM → thread exits) still
works unchanged. Validated by a temporary watchdog test (below).

### `history` now bounded (+ GetLength high-water change)
`RtrbByteStreamInner` gained `history_base: u64` (absolute offset of `history[0]`) and
`total_pulled: u64` (every byte ever pulled). **`GetLength` now reports `total_pulled`**,
not `history.len()` — the load-bearing "report bytes-available-so-far" behavior is
preserved while `history` itself is trimmed. `trim_history` (called after each ring
pull) drops replay bytes below `min(HISTORY_RETAIN_FLOOR=64 KB, position)`: every
backward seek the ADTS source issues during format detection lands in the first few KB,
so the 64 KB floor never strands a replay target, and `history` is capped at roughly
that floor instead of growing with the stream. `blocking_read`/`IsEndOfStream`/`Seek`
were reworked to use absolute offsets (`history_base`/`total_pulled`) and a guard logs
loudly if a read ever falls below the retained base (never observed). Decode
re-validated identical after the change (same sample count).

### CROSS-THREAD re-validation (the gate) — PASSED
Two temporary `#[ignore]`d tests against the real `target/spike/gs16.aac` (42 524 bytes,
HE-AACv2), run ad-hoc and **not committed** (they read the gitignored fixture):

1. `xthread_decode_gs16`: constructs `MfAacDecoder` on the test thread, then drains
   `next_pcm()` from a **separate `std::thread::spawn`** thread (mimicking rodio/cpal).
   Result — `RESULT samples=1359872 blocks=44 rate=32000 ch=2`. Matches the original
   single-thread run **exactly** (1 359 872 f32 @ 32000 Hz / 2 ch ≈ 21.25 s), proving
   the apartment-bound MF objects are only ever touched on the decode thread while the
   pull happens on a different thread.
2. `xthread_drop_no_hang`: fills the bounded PCM channel (never pulls) with the rtrb
   producer kept **alive** (no natural EOF), waits 200 ms, then drops the decoder on a
   watchdog thread — `DROP OK (no hang)`, completing well under the 5 s timeout. Proves
   Drop unblocks a thread stuck on a full `send` and joins cleanly.

### Build / clippy / test
- `cargo build`: clean, 0 warnings.
- `cargo clippy`: **no findings reference `mf_aac.rs` or `player/mod.rs`** (the crate's
  ~35 pre-existing `collapsible_if`/`io_other_error`/same-type-cast lints in unrelated
  files are untouched).
- `cargo test --lib`: **308 passed** (no regressions; the temporary x-thread tests were
  removed before the final run).

### Deps / Minor
- **No dependency changes** — `Cargo.toml`/`Cargo.lock` untouched. Only `mf_aac.rs` is
  modified.
- The Minor suggestion (move the content-type hint to reader attributes and drop the
  byte-stream `IMFAttributes` surface + the `windows-core` dep) was **not taken**: it is
  load-bearing for URL-less source resolution and not trivially safe to change without
  risking the working decode. Left as-is, deps unchanged, per the task's guidance.

## Fix pass 2 (history bounding)

### The bug that pass 1 missed
`trim_history` computed `keep_from = HISTORY_RETAIN_FLOOR.min(position)` -- an
**absolute** 64 KB floor. The moment `position` passed 64 KB (within the first second
of any real stream) `keep_from` pinned at 64 KB forever, so trimming only ever dropped
the first 64 KB and `history` retained `[64 KB, total_pulled)` = the **entire rest of
the stream**. An unbounded leak, despite pass 1's "history now bounded" claim. The 21 s
/ 42 KB offline validation stayed under the floor, so it never trimmed and never exposed
this.

### The bounding rule chosen (and why it's correct)
Replaced the absolute floor with a **trailing window behind the live read position**:

    keep_from = position.saturating_sub(HISTORY_RETAIN_WINDOW)   // HISTORY_RETAIN_WINDOW = 256 KiB

with the old 64 KB renamed `HISTORY_PROBE_REGION` (the upper bound on how far back the
ADTS source ever seeks, used only to size the window: `WINDOW >= PROBE_REGION`).

**Invariant -- `history.len()` is O(1)-bounded, independent of duration:** after every
fill, `trim_history` drops everything below `position - WINDOW`, so
`history.len() = total_pulled - history_base <= WINDOW + (total_pulled - position)`.
The read-ahead gap `total_pulled - position` is itself bounded (one read buffer; `GetLength`
reports bytes-so-far so the source never overshoots the live tail). The bound does **not**
grow with how long the stream has played.

**Why no sought offset is ever trimmed:** the ADTS source seeks *backward* only during the
initial format probe, and those seeks land below `PROBE_REGION` (< WINDOW). While probing,
the source's own read `position` is still inside the first few KB, so
`position - WINDOW` saturates to 0 -> `keep_from = 0` -> nothing is dropped and the whole
probe prefix stays replayable. The prefix only begins to drop once `position` has advanced
strictly forward a full `WINDOW` (256 KiB) past the start -- far beyond the probe region --
after which the source reads only forward and never seeks back into the dropped range.

### Loud-failure guard (hardening)
Extracted the read's serve path into `serve_from_history(&mut inner, buf) -> windows::core::Result<usize>`.
If a read/seek targets an offset below `history_base` (an offset already trimmed away -- which
must never happen under the bound above), it now sets a latching `fatal` flag, logs an
`error!`, and returns `Err(E_FAIL)` instead of the old silent `return 0`. `blocking_read`
propagates that, and both `Read` and `BeginRead` use `?`, so `ReadSample` surfaces a real
error HRESULT and the decode loop ends the stream **with an error** rather than MF mistaking
a 0-length read for benign mid-stream EOF (which would silently truncate/corrupt playback).
Once `fatal` latches, every subsequent read keeps failing -- the stream stays poisoned.

### Committed unit tests (pure Rust, no MF/COM -- run in plain `cargo test`)
`#[cfg(test)] mod tests` drives `RtrbByteStreamInner` + the static
`fill_history`/`trim_history`/`serve_from_history` helpers over a real `rtrb` ring with a
synthetic, offset-addressable byte pattern (no dependency on `target/spike/*`):

- **`history_stays_bounded_and_probe_seeks_resolve`** -- issues an early *backward* probe
  seek to offset 13 (inside the probe region) and asserts it replays the correct bytes with
  nothing trimmed (`history_base == 0`); then reads strictly forward pulling **4 MiB**
  (16x the window), asserting `history.len()` never exceeds `WINDOW + chunk = 262144 + 16384
  = 278528` bytes throughout (tracked max). **Observed max = 278528 bytes for a 4 MiB pull**
  (vs. the old code, which would have retained ~4 MiB). Also asserts trimming actually
  occurred (`history_base` advanced past the probe region: final `history_base = 3915776`)
  so the bound isn't vacuous.
- **`read_below_retained_base_fails_loudly`** -- drives forward reads until the prefix is
  trimmed, then a read below `history_base` returns `Err` (not `Ok(0)`), latches `fatal`,
  and a subsequent in-range read also fails (stream stays poisoned).

### Real-decode re-confirmation
Ad-hoc `#[ignore]`d test (uncommitted; removed before commit) decoding
`target/spike/gs16.aac` through the real `MfAacDecoder`: **1,359,872 f32 @ 32000/2** -- no
regression. (The 42 KB fixture stays under the probe region so it never trims; the bounding
is proven by the committed unit test instead.)

### Build / clippy / test
- `cargo build`: clean, 0 warnings.
- `cargo clippy --all-targets`: **no findings reference `mf_aac.rs`** (pre-existing lints in
  `manager.rs`/`profile.rs`/etc. are untouched).
- `cargo test` full suite: **310 passed**, 0 failed (308 prior + the 2 new bounding tests).
- **No dependency changes** -- only `mf_aac.rs` modified.
