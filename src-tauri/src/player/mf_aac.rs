//! Windows-only Media Foundation HE-AAC / HE-AACv2 live decoder.
//!
//! `symphonia` decodes **AAC-LC only**; SomaFM's low-bitrate AAC streams
//! (`groovesalad-16-aac`, 16 kbps) are HE-AACv2 (SBR + parametric stereo) and
//! never yield a decodable frame. This module decodes them via Windows Media
//! Foundation's built-in ADTS source + AAC decoder, which transparently applies
//! SBR and PS — the 16 kHz mono ADTS core surfaces as 32 kHz stereo PCM.
//!
//! ## Approach (decided by the Task 1 spike)
//! Use `IMFSourceReader`, **not** the raw AAC Decoder MFT. MF's ADTS byte-stream
//! handler parses the headers and instantiates the decoder internally, so we set
//! **zero** input media type. We only declare the desired PCM16 *output* type
//! (leaving rate/channels unset) and read back what MF negotiates — that is how
//! the post-SBR/PS spec (32000/2) reveals itself.
//!
//! The spike read from a file via `MFCreateSourceReaderFromURL`. The live path's
//! bytes arrive over an `rtrb::Consumer<u8>` ring, so the genuinely new piece
//! here is [`RtrbByteStream`]: a custom `IMFByteStream` (via `#[implement]`) that
//! wraps the consumer and blocks-reads exactly like `engine.rs`'s `RtrbReader`.
//! The reader is created with `MFCreateSourceReaderFromByteStream`.
//!
//! ## COM / threading — the decoder owns one dedicated decode thread
//! COM objects (`IMFSourceReader`, the byte stream, samples) are apartment-bound:
//! they may only be touched from the apartment that created them. The decoder is
//! constructed on a tokio `spawn_blocking` thread but pulled (`next_pcm`) by
//! rodio/cpal on *its own* audio-callback thread — a different apartment. Calling
//! the MF objects across that boundary without marshalling is undefined behavior.
//!
//! So `MfAacDecoder` does **not** hold any COM pointer. Instead [`MfAacDecoder::new`]
//! spawns **one dedicated decode thread** that it owns; that thread:
//!   * `CoInitializeEx(MTA)` + `MFStartup` (refcount guard),
//!   * builds the byte stream + `IMFSourceReader`, sets the PCM16 output type,
//!     reads back the negotiated [`SignalSpec`],
//!   * sends the spec (or the init error) back to `new()` over a rendezvous
//!     channel — `new()` blocks until init is confirmed, preserving the existing
//!     probe/timeout contract (`play_live` wraps `new()` in `PROBE_TIMEOUT`),
//!   * then runs the `ReadSample` loop, converts S16→f32, and pushes `Vec<f32>`
//!     blocks into a **bounded** channel (backpressure paces decode to playback),
//!   * on teardown releases the reader, then `MFShutdown` (guard), then
//!     `CoUninitialize` — in that order, all on this one thread.
//!
//! `MfAacDecoder` then holds only `Send` things (the PCM `Receiver`, the cached
//! `SignalSpec`, a stop flag, and the `JoinHandle`), so it is naturally `Send`
//! and `next_pcm` (a channel `recv`) is apartment-agnostic — safe from cpal.
//!
//! ## Shutdown (no hang, no deadlock)
//! Two things can block the decode thread: a `ReadSample` whose byte stream is
//! waiting on the ring, and a `send` into a full bounded PCM channel. Drop must
//! be able to unblock both and then `join`:
//!   * a shared `Arc<AtomicBool> stop` flag is checked by the byte stream's
//!     fill loop, so a `ReadSample` blocked waiting for live bytes returns EOF;
//!   * dropping the PCM `Receiver` makes a blocked `send` return `Err`, which the
//!     thread treats as "consumer gone → exit".
//!
//! Drop sets `stop`, drops the receiver, then joins — neither block can outlive
//! it. The original cancel path (writer task drops the rtrb producer → consumer
//! abandoned → byte-stream EOF → `ReadSample` ENDOFSTREAM → thread exits) still
//! works unchanged.
//!
//! ## MF lifecycle guard
//! `MFStartup`/`MFShutdown` are process-global and reference-counted by MF
//! itself, but we additionally guard with a process-wide counter so concurrent
//! decoders (e.g. play + record of two AAC streams) never tear MF down out from
//! under each other: the **first** decoder calls `MFStartup`, the **last** to
//! drop calls `MFShutdown`. The guard now lives and dies entirely on the decode
//! thread that created it.

use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, SyncSender, sync_channel};

use anyhow::{Context, Result, anyhow};
use symphonia::core::audio::{Channels, SignalSpec};
use windows::Win32::Foundation::{E_FAIL, RPC_E_CHANGED_MODE};
use windows::Win32::Media::MediaFoundation::{
    IMFAsyncCallback, IMFAsyncResult, IMFAttributes, IMFAttributes_Impl, IMFByteStream,
    IMFByteStream_Impl, IMFSourceReader, MF_ATTRIBUTE_TYPE, MF_ATTRIBUTES_MATCH_TYPE,
    MF_BYTESTREAM_CONTENT_TYPE, MF_E_BYTESTREAM_UNKNOWN_LENGTH, MF_MT_AUDIO_BITS_PER_SAMPLE,
    MF_MT_AUDIO_NUM_CHANNELS, MF_MT_AUDIO_SAMPLES_PER_SECOND, MF_MT_MAJOR_TYPE, MF_MT_SUBTYPE,
    MF_SOURCE_READER_FLAG, MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED,
    MF_SOURCE_READERF_ENDOFSTREAM, MF_SOURCE_READER_ENABLE_ADVANCED_VIDEO_PROCESSING,
    MF_SOURCE_READER_FIRST_AUDIO_STREAM, MF_VERSION, MFAudioFormat_PCM,
    MFBYTESTREAM_IS_PARTIALLY_DOWNLOADED, MFBYTESTREAM_IS_READABLE, MFBYTESTREAM_IS_REMOTE,
    MFBYTESTREAM_IS_SEEKABLE, MFBYTESTREAM_SEEK_ORIGIN, MFCreateAsyncResult, MFCreateAttributes,
    MFCreateMediaType, msoBegin, msoCurrent,
    MFCreateSourceReaderFromByteStream, MFInvokeCallback, MFMediaType_Audio, MFSTARTUP_FULL,
    MFShutdown, MFStartup,
};
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx, CoUninitialize};
use windows::core::{BOOL, PCWSTR, PWSTR, Ref, implement};

use super::engine::LiveDecoder;

/// Bound on the PCM block channel between the decode thread and `next_pcm`.
/// Small enough to provide real backpressure (the decode thread blocks on `send`
/// once this many blocks are buffered, pacing decode to playback instead of
/// decoding the whole stream into RAM), large enough to absorb cpal's pull jitter.
/// Each block is one MF sample worth of f32 (~hundreds of frames), so this is a
/// few hundred ms of audio.
const PCM_CHANNEL_CAP: usize = 16;

/// Offset below which the ADTS source's format-probe backward seeks all land.
/// During open MF sniffs ADTS headers by seeking backward into the first few KB;
/// every observed probe seek targets an offset well under this. It is *not* an
/// absolute retention floor (that was the leak — see [`RtrbByteStreamInner`]); it
/// is only the upper bound on how far back the source ever seeks, used to size
/// [`HISTORY_RETAIN_WINDOW`] so a probe seek is always still resolvable.
// Documents the probe-seek bound and is asserted by the history-bounding test;
// only read from `#[cfg(test)]`, so allow dead_code for non-test builds.
#[allow(dead_code)]
const HISTORY_PROBE_REGION: u64 = 64 * 1024;

/// Trailing replay window kept *behind* the live read position. `trim_history`
/// drops everything below `position - HISTORY_RETAIN_WINDOW`, so `history` is
/// O(1)-bounded by this constant regardless of stream duration (it does **not**
/// grow with how long the stream has played). It is deliberately ≥
/// [`HISTORY_PROBE_REGION`]: while the source is still in the probe phase its read
/// position is itself within the first few KB, so `position - HISTORY_RETAIN_WINDOW`
/// saturates to 0 and the whole probe region stays retained; only once the source
/// has read strictly forward well past the window does the prefix get dropped, by
/// which point the source never seeks back into it. See [`RtrbByteStreamInner`].
const HISTORY_RETAIN_WINDOW: u64 = 256 * 1024;

// ── MF lifecycle guard ──────────────────────────────────────────────────────

/// Process-wide count of live `MfAacDecoder` instances. The first one starts MF;
/// the last one to drop shuts it down. Prevents one decoder from calling
/// `MFShutdown` while another is still mid-decode.
static MF_REFCOUNT: AtomicUsize = AtomicUsize::new(0);

/// RAII guard for the process-wide `MFStartup`/`MFShutdown` pair.
struct MfStartupGuard;

impl MfStartupGuard {
    fn acquire() -> Result<Self> {
        // fetch_add returns the previous value; 0 means we are the first.
        if MF_REFCOUNT.fetch_add(1, Ordering::SeqCst) == 0 {
            // SAFETY: MFStartup is safe to call once per process before MF use;
            // the refcount ensures exactly one active startup at a time.
            if let Err(e) = unsafe { MFStartup(MF_VERSION, MFSTARTUP_FULL) } {
                // Roll the count back so a later instance can retry startup.
                MF_REFCOUNT.fetch_sub(1, Ordering::SeqCst);
                return Err(e).context("MFStartup failed");
            }
        }
        Ok(MfStartupGuard)
    }
}

impl Drop for MfStartupGuard {
    fn drop(&mut self) {
        if MF_REFCOUNT.fetch_sub(1, Ordering::SeqCst) == 1 {
            // We were the last instance — shut MF down.
            // SAFETY: balanced against the MFStartup in `acquire`.
            unsafe {
                let _ = MFShutdown();
            }
        }
    }
}

// ── RtrbByteStream: IMFByteStream over an rtrb consumer ──────────────────────

/// A live `IMFByteStream` backed by the player's `rtrb` byte ring.
///
/// MF's ADTS source pulls bytes through this stream. Reads block-spin exactly
/// like `engine.rs`'s `RtrbReader`: yield 1 ms while the ring is empty but the
/// producer is alive; return 0 (EOF) once it is abandoned **or** the decoder's
/// `stop` flag is set (so Drop can unblock a `ReadSample` that is waiting on the
/// live tail).
///
/// It is seekable (the ADTS source requires seekability at open) and backs
/// backward seeks with a replay buffer (`history`). `GetLength` reports
/// bytes-available-so-far (via a high-water counter) so the source clamps its
/// read-ahead to data we actually have and reads strictly sequentially.
///
/// It **also** implements `IMFAttributes`: a raw byte stream has no URL/extension,
/// so MF's source resolver cannot guess the format and fails with
/// `MF_E_UNSUPPORTED_BYTESTREAM_TYPE`. The resolver QIs the byte stream for
/// `IMFAttributes` and reads `MF_BYTESTREAM_CONTENT_TYPE`; we pre-seed that with
/// `audio/aac` (delegating all attribute ops to a real internal store).
#[implement(IMFByteStream, IMFAttributes)]
struct RtrbByteStream {
    inner: Mutex<RtrbByteStreamInner>,
    /// Set by `MfAacDecoder::drop` to unblock a fill loop that is waiting on the
    /// live tail. When set, `fill_history` returns 0 (synthetic EOF) so the
    /// pending `ReadSample` completes and the decode thread can exit + join.
    stop: Arc<AtomicBool>,
    /// Byte count returned by the most recent `BeginRead`, handed back by the
    /// matching `EndRead`. Begin/End are always paired and serialized by the
    /// source, so a single slot is sufficient.
    last_async_read: Mutex<u32>,
    /// Backing attribute store (holds `MF_BYTESTREAM_CONTENT_TYPE`). All
    /// `IMFAttributes` methods delegate here.
    attributes: IMFAttributes,
}

struct RtrbByteStreamInner {
    consumer: rtrb::Consumer<u8>,
    /// Replay buffer for backward seeks. The ADTS source seeks backward (to small
    /// offsets) while detecting the format; a raw forward-only ring cannot satisfy
    /// that, so we replay from here.
    ///
    /// **O(1)-bounded:** `history` is *not* the whole stream and does **not** grow
    /// with stream duration. `history_base` is the absolute stream offset of
    /// `history[0]`. `trim_history` keeps only the trailing window
    /// `[position - HISTORY_RETAIN_WINDOW, …)` (see [`HISTORY_RETAIN_WINDOW`]),
    /// dropping the prefix below it. Because the window is ≥ [`HISTORY_PROBE_REGION`]
    /// and the source's backward seeks only happen during the probe phase — when its
    /// position is still in the first few KB, so the window floor is still 0 — no
    /// offset the source ever seeks to is trimmed away. `total_pulled` (below) — not
    /// `history.len()` — is the GetLength high-water mark.
    history: Vec<u8>,
    /// Absolute stream offset of `history[0]`. `history` covers
    /// `[history_base, history_base + history.len())`.
    history_base: u64,
    /// Total bytes ever pulled from the ring (high-water mark). This is what
    /// `GetLength` reports — it must keep growing even as `history` is trimmed,
    /// otherwise the source would think the stream shrank.
    total_pulled: u64,
    /// Current logical read position (`GetCurrentPosition`).
    position: u64,
    /// Set once a read/seek has targeted an offset already trimmed out of `history`
    /// (below `history_base`). This must never happen with a correct bound, so it is
    /// a hard, fatal error rather than a silent short read: once set, reads fail with
    /// a real error HRESULT so `ReadSample` surfaces it and the stream ends with an
    /// error instead of MF mistaking a 0-length read for benign mid-stream EOF.
    fatal: bool,
}

impl RtrbByteStream {
    /// Build the byte stream, seeding the attribute store with the content-type
    /// hint MF's resolver needs to select the ADTS source.
    fn new(consumer: rtrb::Consumer<u8>, content_type: &str, stop: Arc<AtomicBool>) -> Result<Self> {
        // SAFETY: MFCreateAttributes allocates a fresh store; we set one string.
        let attributes = unsafe {
            let mut attrs = None;
            MFCreateAttributes(&mut attrs, 1).context("MFCreateAttributes (byte stream) failed")?;
            let attrs = attrs.ok_or_else(|| anyhow!("MFCreateAttributes returned null"))?;
            let wide: Vec<u16> = content_type.encode_utf16().chain(std::iter::once(0)).collect();
            attrs
                .SetString(&MF_BYTESTREAM_CONTENT_TYPE, windows::core::PCWSTR(wide.as_ptr()))
                .context("set MF_BYTESTREAM_CONTENT_TYPE failed")?;
            attrs
        };
        Ok(Self {
            inner: Mutex::new(RtrbByteStreamInner {
                consumer,
                history: Vec::new(),
                history_base: 0,
                total_pulled: 0,
                position: 0,
                fatal: false,
            }),
            stop,
            last_async_read: Mutex::new(0),
            attributes,
        })
    }

    /// Pull `want` more bytes from the ring into `history`, blocking like
    /// `engine.rs`'s `RtrbReader` until data arrives or the producer is dropped.
    /// Returns the number actually appended (0 == upstream EOF or stop). Caller
    /// holds the lock. Also bumps `total_pulled` (the GetLength high-water mark).
    fn fill_history(inner: &mut RtrbByteStreamInner, want: usize, stop: &AtomicBool) -> usize {
        if want == 0 {
            return 0;
        }
        loop {
            if stop.load(Ordering::Relaxed) {
                return 0; // Drop signalled — synthesize EOF.
            }
            let available = inner.consumer.slots();
            if available == 0 {
                if inner.consumer.is_abandoned() {
                    return 0; // producer dropped — EOF
                }
                std::thread::sleep(std::time::Duration::from_millis(1));
                continue;
            }
            let n = available.min(want);
            let chunk = match inner.consumer.read_chunk(n) {
                Ok(c) => c,
                Err(_) => return 0,
            };
            let (head, tail) = chunk.as_slices();
            inner.history.extend_from_slice(head);
            inner.history.extend_from_slice(tail);
            chunk.commit(n);
            inner.total_pulled += n as u64;
            Self::trim_history(inner);
            return n;
        }
    }

    /// Drop replay bytes the source can no longer seek back to, keeping only a
    /// **trailing window** of [`HISTORY_RETAIN_WINDOW`] bytes behind the current
    /// read position. This caps `history` at a constant size (the window plus any
    /// read-ahead the source has pulled past `position`, itself clamped by
    /// `GetLength`) **independent of stream duration** — closing the unbounded leak
    /// where an absolute floor pinned the kept range to `[floor, total_pulled)`.
    ///
    /// Correctness — no offset the source actually seeks to is ever trimmed:
    /// * The ADTS source only seeks **backward** during the initial format probe,
    ///   and those seeks land below [`HISTORY_PROBE_REGION`].
    /// * While probing, the source's own read position is still within the first
    ///   few KB (≤ the probe region), so `position - HISTORY_RETAIN_WINDOW`
    ///   saturates to 0 (the window is ≥ the probe region) and nothing is dropped.
    /// * The prefix only starts being dropped once `position` has advanced strictly
    ///   forward past `HISTORY_RETAIN_WINDOW` — i.e. far beyond the probe region —
    ///   after which the source reads only forward and never seeks back into the
    ///   dropped range. (`GetLength` reports bytes-so-far, so read-ahead never
    ///   overshoots into territory that would need a backward seek.)
    fn trim_history(inner: &mut RtrbByteStreamInner) {
        // Lowest offset we must still be able to serve: a fixed window behind the
        // live read position. Saturating to 0 keeps the whole probe-region prefix
        // until the position has moved a full window past it.
        let keep_from = inner.position.saturating_sub(HISTORY_RETAIN_WINDOW);
        if keep_from <= inner.history_base {
            return;
        }
        let drop_n = (keep_from - inner.history_base) as usize;
        if drop_n == 0 || drop_n > inner.history.len() {
            return;
        }
        inner.history.drain(..drop_n);
        inner.history_base += drop_n as u64;
    }

    /// Blocking read of up to `buf.len()` bytes starting at the current logical
    /// position. Serves replayed bytes from `history` and pulls fresh bytes from
    /// the ring as needed.
    ///
    /// Returns `Ok(n)` with `n` bytes read (`Ok(0)` == benign EOF at the live tail
    /// / stop), or a fatal `Err` if the read targets an offset already trimmed out
    /// of `history`. The error is propagated (not swallowed as a 0-length read) so
    /// `ReadSample` surfaces it and the stream ends with an error: a 0-length read
    /// would be (mis)read by MF as mid-stream EOF, silently truncating playback.
    fn blocking_read(&self, buf: &mut [u8]) -> windows::core::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());

        // `rel` is the offset into `history` we want to read from. If we're at or
        // past the live tail, pull more bytes until we have data beyond `pos`
        // (a forward seek may sit past the current tail) or hit EOF. Each
        // fill_history blocks for at least one chunk, so this does not spin.
        let pos = inner.position;
        loop {
            // The fatal guard (pos < history_base) is checked inside the loop body's
            // exit too, but a trimmed position never reaches the live tail, so check
            // it up front before any blocking fill: see `serve_from_history`.
            if inner.fatal || pos < inner.history_base {
                break;
            }
            let history_end = inner.history_base + inner.history.len() as u64;
            if pos < history_end {
                break;
            }
            let need = (pos - history_end) as usize + buf.len();
            if Self::fill_history(&mut inner, need, &self.stop) == 0 {
                return Ok(0); // genuine EOF (producer dropped / stop) or trim race
            }
        }

        Self::serve_from_history(&mut inner, buf)
    }

    /// Copy bytes for the current `position` out of the already-filled `history`,
    /// advancing `position`. Pure logic over [`RtrbByteStreamInner`] (no ring/COM)
    /// so it is unit-testable directly.
    ///
    /// Returns `Ok(n)` (`Ok(0)` == nothing available at/after the live tail), or a
    /// fatal `Err` if `position` is below `history_base` — i.e. the source asked for
    /// an offset we already trimmed. That must never happen with the trailing-window
    /// bound (its only backward seeks are probe seeks issued while `position` is
    /// still inside the probe region, where the window floor is 0 and nothing has
    /// been trimmed). If the assumption is ever violated we fail HARD and LOUD via
    /// the `fatal` flag + an error HRESULT — never serve garbage or a benign-looking
    /// short read that MF would treat as EOF and silently truncate playback.
    fn serve_from_history(
        inner: &mut RtrbByteStreamInner,
        buf: &mut [u8],
    ) -> windows::core::Result<usize> {
        // A prior trimmed-offset read already poisoned the stream — keep failing.
        if inner.fatal {
            return Err(E_FAIL.into());
        }
        let pos = inner.position;
        if pos < inner.history_base {
            inner.fatal = true;
            log::error!(
                "[RtrbByteStream] FATAL: read at {pos} below retained base {} \
                 (history trimmed past a sought offset); failing the stream",
                inner.history_base
            );
            return Err(E_FAIL.into());
        }

        let rel = (pos - inner.history_base) as usize;
        let avail = inner.history.len().saturating_sub(rel);
        if avail == 0 {
            return Ok(0);
        }
        let n = avail.min(buf.len());
        buf[..n].copy_from_slice(&inner.history[rel..rel + n]);
        inner.position += n as u64;
        Ok(n)
    }
}

#[allow(non_snake_case)]
impl IMFByteStream_Impl for RtrbByteStream_Impl {
    fn GetCapabilities(&self) -> windows::core::Result<u32> {
        // Readable + seekable (the ADTS source requires seekability at open or
        // fails with MF_E_BYTESTREAM_NOT_SEEKABLE) + REMOTE + PARTIALLY_DOWNLOADED
        // (live network stream, not a fully-available file). Backward seeks are
        // satisfied from `history`; GetLength reports bytes-so-far to clamp the
        // source's read-ahead to data we actually have.
        Ok(MFBYTESTREAM_IS_READABLE
            | MFBYTESTREAM_IS_SEEKABLE
            | MFBYTESTREAM_IS_REMOTE
            | MFBYTESTREAM_IS_PARTIALLY_DOWNLOADED)
    }

    fn GetLength(&self) -> windows::core::Result<u64> {
        // Report how many bytes have ever been available (the high-water mark:
        // everything pulled into history plus whatever is sitting in the ring
        // right now). The ADTS source clamps its read-ahead seeks to this, so it
        // never overshoots the live tail; as more audio streams in, the reported
        // length grows. We use `total_pulled` rather than `history.len()` because
        // `history` is now trimmed and would otherwise under-report.
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let ready = inner.consumer.slots();
        if ready > 0 {
            RtrbByteStream::fill_history(&mut inner, ready, &self.stop);
        }
        Ok(inner.total_pulled)
    }

    fn SetLength(&self, _qwlength: u64) -> windows::core::Result<()> {
        Err(MF_E_BYTESTREAM_UNKNOWN_LENGTH.into())
    }

    fn GetCurrentPosition(&self) -> windows::core::Result<u64> {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        Ok(inner.position)
    }

    fn SetCurrentPosition(&self, qwposition: u64) -> windows::core::Result<()> {
        log::trace!("[RtrbByteStream] SetCurrentPosition({qwposition})");
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.position = qwposition;
        Ok(())
    }

    fn IsEndOfStream(&self) -> windows::core::Result<BOOL> {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        // EOF iff we've consumed past everything pulled AND no more is coming.
        let drained = inner.position >= inner.total_pulled;
        let eof = drained && inner.consumer.is_abandoned() && inner.consumer.slots() == 0;
        Ok(eof.into())
    }

    fn Read(&self, pb: *mut u8, cb: u32, pcbread: *mut u32) -> windows::core::Result<()> {
        log::trace!("[RtrbByteStream] Read({cb})");
        // SAFETY: MF guarantees `pb` points to at least `cb` writable bytes; we
        // build a slice of exactly that length and never read past it.
        let buf = unsafe { std::slice::from_raw_parts_mut(pb, cb as usize) };
        // A fatal (trimmed-offset) read propagates as an error HRESULT so the
        // source surfaces it instead of treating a 0-length read as mid-stream EOF.
        let n = self.blocking_read(buf)?;
        if !pcbread.is_null() {
            // SAFETY: out-pointer supplied by MF.
            unsafe { *pcbread = n as u32 };
        }
        Ok(())
    }

    fn BeginRead(
        &self,
        pb: *mut u8,
        cb: u32,
        pcallback: Ref<IMFAsyncCallback>,
        punkstate: Ref<windows::core::IUnknown>,
    ) -> windows::core::Result<()> {
        log::trace!("[RtrbByteStream] BeginRead({cb})");
        // Complete the read synchronously: do the blocking read now, capture the
        // byte count for EndRead, then signal completion through the supplied
        // callback (the MFCreateAsyncResult + MFInvokeCallback pattern). MF's
        // IMFAsyncResult only carries a state object + HRESULT, so the actual
        // byte count is passed to EndRead via `last_async_read` instead.
        // SAFETY: MF guarantees `pb` points to >= `cb` writable bytes.
        let buf = unsafe { std::slice::from_raw_parts_mut(pb, cb as usize) };
        // A fatal (trimmed-offset) read fails the BeginRead so the source surfaces
        // an error instead of completing a 0-length read it would treat as EOF.
        let n = self.blocking_read(buf)?;
        *self.last_async_read.lock().unwrap_or_else(|e| e.into_inner()) = n as u32;

        if let Some(callback) = pcallback.as_ref() {
            // SAFETY: MFCreateAsyncResult + MFInvokeCallback are the documented
            // way to complete a synchronous Begin/End pair.
            unsafe {
                let result: IMFAsyncResult =
                    MFCreateAsyncResult(None, callback, punkstate.as_ref())?;
                MFInvokeCallback(&result)?;
            }
        }
        Ok(())
    }

    fn EndRead(&self, _presult: Ref<IMFAsyncResult>) -> windows::core::Result<u32> {
        // Return the byte count captured by the matching BeginRead.
        let n = *self.last_async_read.lock().unwrap_or_else(|e| e.into_inner());
        Ok(n)
    }

    fn Write(&self, _pb: *const u8, _cb: u32) -> windows::core::Result<u32> {
        Err(MF_E_BYTESTREAM_UNKNOWN_LENGTH.into())
    }

    fn BeginWrite(
        &self,
        _pb: *const u8,
        _cb: u32,
        _pcallback: Ref<IMFAsyncCallback>,
        _punkstate: Ref<windows::core::IUnknown>,
    ) -> windows::core::Result<()> {
        Err(MF_E_BYTESTREAM_UNKNOWN_LENGTH.into())
    }

    fn EndWrite(&self, _presult: Ref<IMFAsyncResult>) -> windows::core::Result<u32> {
        Err(MF_E_BYTESTREAM_UNKNOWN_LENGTH.into())
    }

    fn Seek(
        &self,
        seekorigin: MFBYTESTREAM_SEEK_ORIGIN,
        llseekoffset: i64,
        _dwseekflags: u32,
    ) -> windows::core::Result<u64> {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let base = if seekorigin == msoCurrent {
            inner.position as i64
        } else {
            // msoBegin (and any unexpected origin) are relative to the start.
            debug_assert!(seekorigin == msoBegin);
            0i64
        };
        let target = (base + llseekoffset).max(0) as u64;
        log::trace!("[RtrbByteStream] Seek(origin={}, off={llseekoffset}) -> {target}", seekorigin.0);
        inner.position = target;
        Ok(target)
    }

    fn Flush(&self) -> windows::core::Result<()> {
        Ok(())
    }

    fn Close(&self) -> windows::core::Result<()> {
        Ok(())
    }
}

// `IMFAttributes` for the byte stream — pure delegation to the internal store so
// the source resolver can read `MF_BYTESTREAM_CONTENT_TYPE`. Every method just
// forwards to `self.attributes`; the concrete `IMFAttributes` getters are
// `unsafe`, hence the per-call `unsafe` blocks.
#[allow(non_snake_case)]
impl IMFAttributes_Impl for RtrbByteStream_Impl {
    fn GetItem(&self, key: *const windows_core::GUID, value: *mut PROPVARIANT) -> windows::core::Result<()> {
        unsafe { self.attributes.GetItem(key, (!value.is_null()).then_some(value)) }
    }
    fn GetItemType(&self, key: *const windows_core::GUID) -> windows::core::Result<MF_ATTRIBUTE_TYPE> {
        unsafe { self.attributes.GetItemType(key) }
    }
    fn CompareItem(&self, key: *const windows_core::GUID, value: *const PROPVARIANT) -> windows::core::Result<BOOL> {
        unsafe { self.attributes.CompareItem(key, value) }
    }
    fn Compare(&self, theirs: Ref<IMFAttributes>, match_type: MF_ATTRIBUTES_MATCH_TYPE) -> windows::core::Result<BOOL> {
        unsafe { self.attributes.Compare(theirs.as_ref(), match_type) }
    }
    fn GetUINT32(&self, key: *const windows_core::GUID) -> windows::core::Result<u32> {
        unsafe { self.attributes.GetUINT32(key) }
    }
    fn GetUINT64(&self, key: *const windows_core::GUID) -> windows::core::Result<u64> {
        unsafe { self.attributes.GetUINT64(key) }
    }
    fn GetDouble(&self, key: *const windows_core::GUID) -> windows::core::Result<f64> {
        unsafe { self.attributes.GetDouble(key) }
    }
    fn GetGUID(&self, key: *const windows_core::GUID) -> windows::core::Result<windows_core::GUID> {
        unsafe { self.attributes.GetGUID(key) }
    }
    fn GetStringLength(&self, key: *const windows_core::GUID) -> windows::core::Result<u32> {
        unsafe { self.attributes.GetStringLength(key) }
    }
    fn GetString(&self, key: *const windows_core::GUID, value: PWSTR, size: u32, length: *mut u32) -> windows::core::Result<()> {
        let buf = unsafe { std::slice::from_raw_parts_mut(value.0, size as usize) };
        unsafe { self.attributes.GetString(key, buf, (!length.is_null()).then_some(length)) }
    }
    fn GetAllocatedString(&self, key: *const windows_core::GUID, value: *mut PWSTR, length: *mut u32) -> windows::core::Result<()> {
        unsafe { self.attributes.GetAllocatedString(key, value, length) }
    }
    fn GetBlobSize(&self, key: *const windows_core::GUID) -> windows::core::Result<u32> {
        unsafe { self.attributes.GetBlobSize(key) }
    }
    fn GetBlob(&self, key: *const windows_core::GUID, buf: *mut u8, size: u32, blobsize: *mut u32) -> windows::core::Result<()> {
        let slice = unsafe { std::slice::from_raw_parts_mut(buf, size as usize) };
        unsafe { self.attributes.GetBlob(key, slice, (!blobsize.is_null()).then_some(blobsize)) }
    }
    fn GetAllocatedBlob(&self, key: *const windows_core::GUID, buf: *mut *mut u8, size: *mut u32) -> windows::core::Result<()> {
        unsafe { self.attributes.GetAllocatedBlob(key, buf, size) }
    }
    fn GetUnknown(&self, key: *const windows_core::GUID, riid: *const windows_core::GUID, ppv: *mut *mut core::ffi::c_void) -> windows::core::Result<()> {
        // Delegate at the vtable level: the safe wrapper is generic over the
        // requested interface, but the source resolver passes a raw IID + out-ptr.
        unsafe {
            (windows_core::Interface::vtable(&self.attributes).GetUnknown)(
                windows_core::Interface::as_raw(&self.attributes),
                key,
                riid,
                ppv,
            )
            .ok()
        }
    }
    fn SetItem(&self, key: *const windows_core::GUID, value: *const PROPVARIANT) -> windows::core::Result<()> {
        unsafe { self.attributes.SetItem(key, value) }
    }
    fn DeleteItem(&self, key: *const windows_core::GUID) -> windows::core::Result<()> {
        unsafe { self.attributes.DeleteItem(key) }
    }
    fn DeleteAllItems(&self) -> windows::core::Result<()> {
        unsafe { self.attributes.DeleteAllItems() }
    }
    fn SetUINT32(&self, key: *const windows_core::GUID, value: u32) -> windows::core::Result<()> {
        unsafe { self.attributes.SetUINT32(key, value) }
    }
    fn SetUINT64(&self, key: *const windows_core::GUID, value: u64) -> windows::core::Result<()> {
        unsafe { self.attributes.SetUINT64(key, value) }
    }
    fn SetDouble(&self, key: *const windows_core::GUID, value: f64) -> windows::core::Result<()> {
        unsafe { self.attributes.SetDouble(key, value) }
    }
    fn SetGUID(&self, key: *const windows_core::GUID, value: *const windows_core::GUID) -> windows::core::Result<()> {
        unsafe { self.attributes.SetGUID(key, value) }
    }
    fn SetString(&self, key: *const windows_core::GUID, value: &PCWSTR) -> windows::core::Result<()> {
        unsafe { self.attributes.SetString(key, *value) }
    }
    fn SetBlob(&self, key: *const windows_core::GUID, buf: *const u8, size: u32) -> windows::core::Result<()> {
        let slice = unsafe { std::slice::from_raw_parts(buf, size as usize) };
        unsafe { self.attributes.SetBlob(key, slice) }
    }
    fn SetUnknown(&self, key: *const windows_core::GUID, unknown: Ref<windows_core::IUnknown>) -> windows::core::Result<()> {
        unsafe { self.attributes.SetUnknown(key, unknown.as_ref()) }
    }
    fn LockStore(&self) -> windows::core::Result<()> {
        unsafe { self.attributes.LockStore() }
    }
    fn UnlockStore(&self) -> windows::core::Result<()> {
        unsafe { self.attributes.UnlockStore() }
    }
    fn GetCount(&self) -> windows::core::Result<u32> {
        unsafe { self.attributes.GetCount() }
    }
    fn GetItemByIndex(&self, index: u32, key: *mut windows_core::GUID, value: *mut PROPVARIANT) -> windows::core::Result<()> {
        unsafe { self.attributes.GetItemByIndex(index, key, (!value.is_null()).then_some(value)) }
    }
    fn CopyAllItems(&self, dest: Ref<IMFAttributes>) -> windows::core::Result<()> {
        unsafe { self.attributes.CopyAllItems(dest.as_ref()) }
    }
}

// ── MfAacDecoder ─────────────────────────────────────────────────────────────

/// Media Foundation HE-AAC/HE-AACv2 live decoder implementing [`LiveDecoder`].
///
/// Holds **no COM pointer**: all MF work runs on a dedicated decode thread the
/// decoder owns (see module docs). This struct keeps only `Send` things — the
/// PCM block receiver, the cached spec, a stop flag, and the thread handle — so
/// it is naturally `Send` (no `unsafe impl Send`) and `next_pcm` is a plain
/// channel `recv` safe to call from cpal's audio thread.
pub(crate) struct MfAacDecoder {
    /// Decoded interleaved-f32 blocks from the decode thread. `None` (channel
    /// closed) means EOF or a fatal decode error.
    pcm_rx: Option<Receiver<Vec<f32>>>,
    /// Negotiated output spec, learned during `new()` (before any pull).
    spec: SignalSpec,
    /// Signals the decode thread (and its byte stream) to stop and exit.
    stop: Arc<AtomicBool>,
    /// The decode thread; joined on drop.
    handle: Option<std::thread::JoinHandle<()>>,
}

/// What the decode thread sends back to `new()` once init either succeeds (with
/// the negotiated spec) or fails.
type InitResult = Result<SignalSpec>;

impl MfAacDecoder {
    /// Build a decoder over the live byte ring, spawning the dedicated decode
    /// thread and blocking until it confirms the reader exists and the output
    /// spec is known (or reports an init error). `content_type` is accepted for
    /// parity with `SymphoniaDecoder::new` but unused: MF's ADTS source sniffs
    /// the format from the bytes themselves.
    pub(crate) fn new(consumer: rtrb::Consumer<u8>, _content_type: Option<&str>) -> Result<Self> {
        let stop = Arc::new(AtomicBool::new(false));
        let (pcm_tx, pcm_rx) = sync_channel::<Vec<f32>>(PCM_CHANNEL_CAP);
        // Rendezvous channel for the init handshake: `new()` blocks on recv until
        // the decode thread reports Ok(spec) or Err.
        let (init_tx, init_rx) = sync_channel::<InitResult>(0);

        let stop_thread = Arc::clone(&stop);
        let handle = std::thread::Builder::new()
            .name("mf-aac-decode".into())
            .spawn(move || {
                decode_thread_main(consumer, stop_thread, init_tx, pcm_tx);
            })
            .context("failed to spawn MF AAC decode thread")?;

        // Block until init confirmed. recv errors only if the thread died without
        // sending (e.g. panic) — surface that as an init failure.
        let spec = match init_rx.recv() {
            Ok(Ok(spec)) => spec,
            Ok(Err(e)) => {
                // Init failed on the thread; it has already torn down and will
                // exit. Join to reap it (it is not blocked on anything).
                let _ = handle.join();
                return Err(e);
            }
            Err(_) => {
                let _ = handle.join();
                return Err(anyhow!("MF AAC decode thread exited before init"));
            }
        };

        Ok(Self {
            pcm_rx: Some(pcm_rx),
            spec,
            stop,
            handle: Some(handle),
        })
    }
}

impl LiveDecoder for MfAacDecoder {
    fn next_pcm(&mut self) -> Option<Vec<f32>> {
        // Pure channel recv — no COM here, so this is safe to call from cpal's
        // audio thread (a different COM apartment than the decode thread).
        self.pcm_rx.as_ref()?.recv().ok()
    }

    fn spec(&self) -> SignalSpec {
        self.spec
    }
}

impl Drop for MfAacDecoder {
    fn drop(&mut self) {
        // Signal stop so a fill loop waiting on the live tail returns EOF...
        self.stop.store(true, Ordering::Relaxed);
        // ...and drop the receiver so a decode thread blocked on a full PCM
        // `send` unblocks (send returns Err → thread exits). Either way the
        // thread is now guaranteed to make progress to its teardown.
        self.pcm_rx = None;
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

// ── decode thread ────────────────────────────────────────────────────────────

/// Body of the dedicated decode thread. Owns the entire COM/MF lifecycle: it
/// initializes COM (MTA) + MF, builds the reader, reports the spec back through
/// `init_tx`, then runs the ReadSample → S16→f32 → bounded-send loop. On exit it
/// releases the reader, then MF (guard drop), then COM — in that order, all here.
fn decode_thread_main(
    consumer: rtrb::Consumer<u8>,
    stop: Arc<AtomicBool>,
    init_tx: SyncSender<InitResult>,
    pcm_tx: SyncSender<Vec<f32>>,
) {
    // 1. COM apartment: MTA. Tolerate S_FALSE (already init MTA) and
    //    RPC_E_CHANGED_MODE (thread already STA) — do NOT propagate either.
    // SAFETY: standard COM init on this (the decode) thread.
    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let co_initialized = if hr.is_ok() {
        true
    } else if hr == RPC_E_CHANGED_MODE {
        // Thread already STA (shouldn't happen for our own thread, but tolerate).
        log::debug!("[MfAacDecoder] CoInitializeEx returned RPC_E_CHANGED_MODE; continuing");
        false
    } else {
        let _ = init_tx.send(Err(anyhow!("CoInitializeEx failed: {hr:?}")));
        return;
    };

    // 2. MFStartup (refcounted across decoder instances), owned by this thread.
    let mf_guard = match MfStartupGuard::acquire() {
        Ok(g) => g,
        Err(e) => {
            if co_initialized {
                // SAFETY: balances our CoInitializeEx on this thread.
                unsafe { CoUninitialize() };
            }
            let _ = init_tx.send(Err(e));
            return;
        }
    };

    // 3. Build the reader + negotiate the output spec.
    let (reader, spec) = match build_reader(consumer, &stop) {
        Ok(r) => r,
        Err(e) => {
            // Teardown order: MF guard drops here, then COM below.
            drop(mf_guard);
            if co_initialized {
                // SAFETY: balances our CoInitializeEx on this thread.
                unsafe { CoUninitialize() };
            }
            let _ = init_tx.send(Err(e));
            return;
        }
    };

    // 4. Confirm init to `new()`. If the receiver is already gone (the future
    //    wrapping new() was cancelled), just tear down.
    if init_tx.send(Ok(spec)).is_err() {
        teardown(reader, mf_guard, co_initialized);
        return;
    }

    // 5. Decode loop: ReadSample → S16→f32 → bounded send. Backpressure paces
    //    decode to playback. Exits on EOF/error/stop/consumer-gone.
    decode_loop(&reader, &stop, &pcm_tx);

    // 6. Teardown on this same thread: reader Release, then MF, then COM.
    teardown(reader, mf_guard, co_initialized);
}

/// Release the reader, then MF (guard), then COM — strictly in that order, all on
/// the decode thread.
fn teardown(reader: IMFSourceReader, mf_guard: MfStartupGuard, co_initialized: bool) {
    drop(reader); // IMFSourceReader Release
    drop(mf_guard); // MFShutdown if last (guard's Drop)
    if co_initialized {
        // SAFETY: balances the CoInitializeEx performed on this same thread.
        unsafe { CoUninitialize() };
    }
}

/// Build the byte stream + `IMFSourceReader`, set the PCM16 output type, and read
/// back the negotiated `SignalSpec`. Mirrors the original `build`/`read_spec`.
fn build_reader(
    consumer: rtrb::Consumer<u8>,
    stop: &Arc<AtomicBool>,
) -> Result<(IMFSourceReader, SignalSpec)> {
    // Wrap the rtrb consumer in our IMFByteStream. The content-type hint lives on
    // the byte stream's own IMFAttributes, which is how the source resolver
    // selects the ADTS source for a raw (URL-less) byte stream.
    let byte_stream: IMFByteStream =
        RtrbByteStream::new(consumer, "audio/aac", Arc::clone(stop))?.into();

    // Reader attributes: audio-only (disable advanced video processing).
    // SAFETY: MFCreateAttributes allocates a fresh attribute store.
    let attributes = unsafe {
        let mut attrs = None;
        MFCreateAttributes(&mut attrs, 1).context("MFCreateAttributes failed")?;
        let attrs = attrs.ok_or_else(|| anyhow!("MFCreateAttributes returned null"))?;
        attrs
            .SetUINT32(&MF_SOURCE_READER_ENABLE_ADVANCED_VIDEO_PROCESSING, 0)
            .context("set ENABLE_ADVANCED_VIDEO_PROCESSING failed")?;
        attrs
    };

    // Create the source reader over our byte stream. MF's ADTS source handler
    // parses headers and instantiates the AAC decoder internally.
    // SAFETY: byte_stream and attributes are valid live COM objects.
    let reader = unsafe {
        MFCreateSourceReaderFromByteStream(&byte_stream, &attributes)
            .context("MFCreateSourceReaderFromByteStream failed (not AAC/ADTS?)")?
    };

    let stream_index = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;

    // Desired OUTPUT type: PCM, 16-bit, rate/channels UNSET. MF negotiates the
    // real post-SBR/PS rate + channel count for us.
    // SAFETY: media type is a fresh MF object; GUIDs are static.
    unsafe {
        let out_type = MFCreateMediaType().context("MFCreateMediaType failed")?;
        out_type
            .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)
            .context("set MAJOR_TYPE failed")?;
        out_type
            .SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)
            .context("set SUBTYPE failed")?;
        out_type
            .SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)
            .context("set BITS_PER_SAMPLE failed")?;
        reader
            .SetCurrentMediaType(stream_index, None, &out_type)
            .context("SetCurrentMediaType(PCM16) failed — stream not decodable?")?;
    }

    // Read back the negotiated type to learn the true spec (32000/2 for the
    // HE-AACv2 test stream).
    let spec = read_spec(&reader, stream_index)?;
    log::info!(
        "[MfAacDecoder] negotiated output: {} Hz, {} ch",
        spec.rate,
        spec.channels.count()
    );
    Ok((reader, spec))
}

/// Read the source reader's current output media type and build a `SignalSpec`.
fn read_spec(reader: &IMFSourceReader, stream_index: u32) -> Result<SignalSpec> {
    // SAFETY: reader is a valid source reader; stream_index is the audio stream.
    let (rate, channels) = unsafe {
        let media_type = reader
            .GetCurrentMediaType(stream_index)
            .context("GetCurrentMediaType failed")?;
        let rate = media_type
            .GetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND)
            .context("output type missing SAMPLES_PER_SECOND")?;
        let channels = media_type
            .GetUINT32(&MF_MT_AUDIO_NUM_CHANNELS)
            .context("output type missing NUM_CHANNELS")?;
        (rate, channels)
    };
    Ok(SignalSpec::new(rate, channels_from_count(channels)))
}

/// The ReadSample → S16→f32 → bounded-send loop. Runs entirely on the decode
/// thread. Returns when the stream ends, a fatal error occurs, the stop flag is
/// set, or the PCM consumer is gone (send fails).
///
/// The cached spec lives in `MfAacDecoder` (set once at init); since it cannot be
/// pushed back to the struct from this thread, a mid-stream
/// `CURRENTMEDIATYPECHANGED` is logged but not propagated — the S16→f32 path is
/// rate/channel-agnostic (it copies whatever the buffer holds), so a spec change
/// only matters for `LiveSource`'s declared `sample_rate`/`channels`, which is
/// out of scope here and was equally true of the single-threaded version.
fn decode_loop(
    reader: &IMFSourceReader,
    stop: &Arc<AtomicBool>,
    pcm_tx: &SyncSender<Vec<f32>>,
) {
    let stream_index = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;
    loop {
        if stop.load(Ordering::Relaxed) {
            return;
        }
        let mut flags: u32 = 0;
        let mut sample = None;
        // SAFETY: reader is valid; out-params are local.
        let read = unsafe {
            reader.ReadSample(
                stream_index,
                0,
                None,
                Some(&mut flags),
                None,
                Some(&mut sample),
            )
        };
        if let Err(e) = read {
            log::warn!("[MfAacDecoder] ReadSample failed: {e}");
            return;
        }

        let flags = MF_SOURCE_READER_FLAG(flags as i32);
        let has = |flag: MF_SOURCE_READER_FLAG| flags.0 & flag.0 != 0;
        if has(MF_SOURCE_READERF_ENDOFSTREAM) {
            log::info!("[MfAacDecoder] end of stream");
            return;
        }
        if has(MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED) {
            // Defensive (the spike saw the spec constant from frame 0, but a
            // mid-stream bitrate/codec change could flip it). Logged only; see
            // the function doc for why it is not propagated.
            match read_spec(reader, stream_index) {
                Ok(s) => log::info!(
                    "[MfAacDecoder] media type changed: {} Hz, {} ch",
                    s.rate,
                    s.channels.count()
                ),
                Err(e) => log::warn!("[MfAacDecoder] failed to re-read spec: {e}"),
            }
        }

        let Some(sample) = sample else {
            // No sample but not EOF (e.g. a gap / stream tick) — try again.
            continue;
        };

        // Convert the sample to one contiguous buffer of interleaved S16LE.
        // SAFETY: sample is a valid IMFSample from ReadSample.
        let pcm = unsafe {
            let buffer = match sample.ConvertToContiguousBuffer() {
                Ok(b) => b,
                Err(e) => {
                    log::warn!("[MfAacDecoder] ConvertToContiguousBuffer failed: {e}");
                    return;
                }
            };
            let mut ptr: *mut u8 = std::ptr::null_mut();
            let mut current_len: u32 = 0;
            if let Err(e) = buffer.Lock(&mut ptr, None, Some(&mut current_len)) {
                log::warn!("[MfAacDecoder] buffer Lock failed: {e}");
                return;
            }
            // Copy out S16LE and convert to f32 while the buffer is locked.
            let byte_len = current_len as usize;
            let sample_count = byte_len / 2;
            let mut out = Vec::with_capacity(sample_count);
            let s16 = std::slice::from_raw_parts(ptr as *const i16, sample_count);
            for &v in s16 {
                out.push(v as f32 / 32768.0);
            }
            let _ = buffer.Unlock();
            out
        };

        if pcm.is_empty() {
            continue;
        }
        // Bounded send: blocks when the channel is full (backpressure), so the
        // decoder paces to playback rather than buffering the whole stream. If
        // the receiver is gone (decoder dropped), send errors → exit.
        if pcm_tx.send(pcm).is_err() {
            return;
        }
    }
}

/// Map a channel count to a symphonia `Channels` mask (mono / stereo cover the
/// AAC live cases; anything else falls back to a count-bit mask).
fn channels_from_count(count: u32) -> Channels {
    match count {
        1 => Channels::FRONT_LEFT,
        2 => Channels::FRONT_LEFT | Channels::FRONT_RIGHT,
        n => Channels::from_bits_truncate((1u32 << n) - 1),
    }
}

// ── tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    //! Pure-Rust unit tests for the byte stream's history-bounding logic. These do
    //! **not** touch Media Foundation / COM — they drive [`RtrbByteStreamInner`]
    //! and the static `fill_history` / `trim_history` / `serve_from_history` helpers
    //! directly over a real `rtrb` ring, so they run in plain `cargo test` on any
    //! platform and don't violate the "no MF test in the suite" rule.

    use super::*;

    /// Build a fresh inner over an rtrb ring big enough to hold one feed chunk, and
    /// keep the producer alive so `fill_history` never blocks (we always top it up
    /// before draining). Returns (inner, producer, stop).
    fn make_inner(ring_cap: usize) -> (RtrbByteStreamInner, rtrb::Producer<u8>, Arc<AtomicBool>) {
        let (producer, consumer) = rtrb::RingBuffer::<u8>::new(ring_cap);
        let inner = RtrbByteStreamInner {
            consumer,
            history: Vec::new(),
            history_base: 0,
            total_pulled: 0,
            position: 0,
            fatal: false,
        };
        (inner, producer, Arc::new(AtomicBool::new(false)))
    }

    /// Synthetic stream byte: deterministic function of absolute offset so a read at
    /// any offset can be checked against what was produced there.
    fn byte_at(offset: u64) -> u8 {
        (offset.wrapping_mul(31).wrapping_add(7) & 0xFF) as u8
    }

    /// Feed `n` bytes (continuing the synthetic pattern from `total_pulled`) into the
    /// ring, then drain them into `history` via the real `fill_history`. Loops so
    /// `n` larger than the ring capacity still works.
    fn feed(
        inner: &mut RtrbByteStreamInner,
        producer: &mut rtrb::Producer<u8>,
        stop: &Arc<AtomicBool>,
        mut n: usize,
    ) {
        while n > 0 {
            let chunk = n.min(producer.slots());
            assert!(chunk > 0, "ring has no free slots — test ring too small");
            let start = inner.total_pulled;
            for i in 0..chunk {
                producer
                    .push(byte_at(start + i as u64))
                    .expect("ring has free slots");
            }
            let got = RtrbByteStream::fill_history(inner, chunk, stop);
            assert_eq!(got, chunk, "fill_history should drain exactly what we fed");
            n -= chunk;
        }
    }

    /// Read `len` bytes at absolute `offset` through the pure serve path (mirrors a
    /// `Seek` + `Read` with the data already present in `history`). Returns the
    /// served bytes; panics on the fatal guard so callers asserting success see it.
    fn read_at(inner: &mut RtrbByteStreamInner, offset: u64, len: usize) -> Vec<u8> {
        inner.position = offset;
        let mut out = vec![0u8; len];
        let n = RtrbByteStream::serve_from_history(inner, &mut out)
            .expect("serve_from_history unexpectedly fatal");
        out.truncate(n);
        out
    }

    #[test]
    fn history_stays_bounded_and_probe_seeks_resolve() {
        // Ring sized for one feed chunk; we top it up before every drain.
        let chunk = 16 * 1024usize;
        let (mut inner, mut producer, stop) = make_inner(chunk + 1);

        // --- Probe phase: pull the first few KB, then issue an early BACKWARD seek
        // into the probe region (header sniffing) and assert it resolves correctly.
        feed(&mut inner, &mut producer, &stop, chunk); // pulled [0, 16K)
        inner.position = chunk as u64; // forward read position so far

        // Backward probe seek to offset 13 (well inside HISTORY_PROBE_REGION).
        let probe = read_at(&mut inner, 13, 32);
        let expected: Vec<u8> = (13u64..13 + 32).map(byte_at).collect();
        assert_eq!(probe, expected, "early backward probe seek must replay correctly");
        assert_eq!(inner.history_base, 0, "nothing trimmed during probe");

        // --- Long forward read phase: pull FAR more than RETAIN_WINDOW + probe
        // region (several MB) advancing the read position forward, exactly as the
        // ADTS source does after probe settles. Track the max history size.
        let total_mb = 4 * 1024 * 1024u64; // 4 MiB — dwarfs the 256 KiB window
        let mut max_history = inner.history.len();
        let mut pos = chunk as u64;
        while inner.total_pulled < total_mb {
            feed(&mut inner, &mut producer, &stop, chunk);
            // Advance the forward read position to the live tail and serve a read,
            // which is what drives trimming via fill_history -> trim_history.
            pos = inner.total_pulled - chunk as u64;
            let got = read_at(&mut inner, pos, chunk);
            assert_eq!(got.len(), chunk, "forward read should serve a full chunk");
            // Spot-check a byte so we know we served the right offset, not garbage.
            assert_eq!(got[0], byte_at(pos));
            max_history = max_history.max(inner.history.len());
        }

        // INVARIANT: history is O(1)-bounded — independent of the 4 MiB pulled. The
        // theoretical cap is HISTORY_RETAIN_WINDOW + one read-ahead chunk; assert it
        // never exceeds window + chunk, and report the observed max.
        let cap = HISTORY_RETAIN_WINDOW as usize + chunk;
        assert!(
            max_history <= cap,
            "history grew to {max_history} bytes, exceeding bound {cap} \
             (window {HISTORY_RETAIN_WINDOW} + chunk {chunk})"
        );
        // And it really did trim (otherwise the bound would be vacuous).
        assert!(
            inner.history_base > HISTORY_PROBE_REGION,
            "history_base ({}) should have advanced past the probe region",
            inner.history_base
        );
        eprintln!(
            "history_stays_bounded: pulled {} bytes, max history = {max_history} bytes \
             (bound {cap}), final history_base = {}",
            inner.total_pulled, inner.history_base
        );

        // A normal forward read near the live tail still works post-trim.
        let tail = read_at(&mut inner, pos, 64);
        assert_eq!(tail.len(), 64);
        assert_eq!(tail[0], byte_at(pos));
    }

    #[test]
    fn read_below_retained_base_fails_loudly() {
        let chunk = 16 * 1024usize;
        let (mut inner, mut producer, stop) = make_inner(chunk + 1);

        // Pull well past the trailing window, advancing the read position forward
        // (chunk by chunk) so trim_history actually fires and drops the prefix.
        let chunks = (HISTORY_RETAIN_WINDOW as usize / chunk) + 4;
        for _ in 0..chunks {
            feed(&mut inner, &mut producer, &stop, chunk);
            // Advance position toward the tail before the next fill so trim runs.
            inner.position = inner.total_pulled.saturating_sub(chunk as u64);
        }
        assert!(inner.history_base > 0, "precondition: some prefix was trimmed");

        // Now a read targeting an offset BELOW the retained base must fail loudly
        // (hard error), NOT return a benign 0-length read.
        inner.position = inner.history_base - 1;
        let res = RtrbByteStream::serve_from_history(&mut inner, &mut [0u8; 32]);
        assert!(res.is_err(), "trimmed-offset read must be a hard error, not Ok(0)");
        assert!(inner.fatal, "fatal flag must latch");

        // And the stream stays poisoned: a subsequent in-range read also fails.
        inner.position = inner.history_base; // would otherwise be servable
        let res2 = RtrbByteStream::serve_from_history(&mut inner, &mut [0u8; 32]);
        assert!(res2.is_err(), "stream must remain fatally failed once poisoned");
    }
}
