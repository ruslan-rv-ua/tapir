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
//! ## COM / threading
//! All MF objects are created and used on **one** thread — the `spawn_blocking`
//! thread that constructs the decoder (Task 4 owns it). That thread must be a COM
//! **MTA** apartment: [`MfAacDecoder::new`] calls
//! `CoInitializeEx(None, COINIT_MULTITHREADED)` (tolerating `S_FALSE` /
//! `RPC_E_CHANGED_MODE` — another component may already have initialized COM on
//! the thread) and `MFStartup`. The objects are not `Send`-safe to move across
//! threads, which is why everything stays local to the owning thread.
//!
//! ## MF lifecycle guard
//! `MFStartup`/`MFShutdown` are process-global and reference-counted by MF
//! itself, but we additionally guard with a process-wide counter so concurrent
//! decoders (e.g. play + record of two AAC streams) never tear MF down out from
//! under each other: the **first** decoder calls `MFStartup`, the **last** to
//! drop calls `MFShutdown`. `CoInitializeEx`/`CoUninitialize` are per-thread, so
//! we only `CoUninitialize` on the threads where *we* successfully initialized.

use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::{Context, Result, anyhow};
use symphonia::core::audio::{Channels, SignalSpec};
use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
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

/// A live, forward-only `IMFByteStream` backed by the player's `rtrb` byte ring.
///
/// MF's ADTS source pulls bytes through this stream. It is non-seekable and of
/// unknown length (a live HTTP stream): `GetCapabilities` reports readable-only,
/// `GetLength`/`Seek`/`SetLength`/`Write` fail, and `IsEndOfStream` reflects the
/// abandoned-and-drained consumer (producer dropped == upstream EOF).
///
/// Reads block-spin exactly like `engine.rs`'s `RtrbReader`: yield 1 ms while the
/// ring is empty but the producer is alive; return 0 (EOF) once it is abandoned.
///
/// It **also** implements `IMFAttributes`: a raw byte stream has no URL/extension,
/// so MF's source resolver cannot guess the format and fails with
/// `MF_E_UNSUPPORTED_BYTESTREAM_TYPE`. The resolver QIs the byte stream for
/// `IMFAttributes` and reads `MF_BYTESTREAM_CONTENT_TYPE`; we pre-seed that with
/// `audio/aac` (delegating all attribute ops to a real internal store).
#[implement(IMFByteStream, IMFAttributes)]
struct RtrbByteStream {
    inner: Mutex<RtrbByteStreamInner>,
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
    /// All bytes ever pulled from the ring, in stream order. Backs seeking: the
    /// ADTS source seeks backward (typically to small offsets) while detecting
    /// the format, which a raw forward-only ring cannot satisfy — so we replay
    /// from here. `history.len()` is the high-water byte offset pulled so far.
    ///
    /// NOTE: this grows with the stream. For a multi-hour live stream that is a
    /// real (slow) leak; Task 4/5 should bound it (e.g. only retain history
    /// until the source stops seeking, then switch to pure passthrough). Kept
    /// simple here because the decoder is correctness-first and the format
    /// probe's seeks all land in the first few KB.
    history: Vec<u8>,
    /// Current logical read position (`GetCurrentPosition`). May be < or ==
    /// `history.len()`; reads past the end pull fresh bytes from the ring.
    position: u64,
}

impl RtrbByteStream {
    /// Build the byte stream, seeding the attribute store with the content-type
    /// hint MF's resolver needs to select the ADTS source.
    fn new(consumer: rtrb::Consumer<u8>, content_type: &str) -> Result<Self> {
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
                position: 0,
            }),
            last_async_read: Mutex::new(0),
            attributes,
        })
    }

    /// Pull `want` more bytes from the ring into `history`, blocking like
    /// `engine.rs`'s `RtrbReader` until data arrives or the producer is dropped.
    /// Returns the number actually appended (0 == upstream EOF). Caller holds the
    /// lock.
    fn fill_history(inner: &mut RtrbByteStreamInner, want: usize) -> usize {
        if want == 0 {
            return 0;
        }
        loop {
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
            return n;
        }
    }

    /// Blocking read of up to `buf.len()` bytes starting at the current logical
    /// position; returns bytes read (0 == EOF at the live tail). Serves replayed
    /// bytes from `history` and pulls fresh bytes from the ring as needed.
    fn blocking_read(&self, buf: &mut [u8]) -> usize {
        if buf.is_empty() {
            return 0;
        }
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let pos = inner.position as usize;

        // If reading at/after the live tail, pull more bytes until we have data
        // beyond `pos` (a forward seek may sit past the current tail) or hit EOF.
        // Each fill_history blocks for at least one chunk, so this does not spin.
        while pos >= inner.history.len() {
            let need = pos - inner.history.len() + buf.len();
            if Self::fill_history(&mut inner, need) == 0 {
                return 0; // genuine EOF (producer dropped, nothing more coming)
            }
        }

        let avail = inner.history.len().saturating_sub(pos);
        if avail == 0 {
            return 0;
        }
        let n = avail.min(buf.len());
        buf[..n].copy_from_slice(&inner.history[pos..pos + n]);
        inner.position += n as u64;
        n
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
        // Report how many bytes are currently available (everything pulled into
        // history plus whatever is sitting in the ring right now). The ADTS
        // source clamps its read-ahead seeks to this, so it never overshoots the
        // live tail; as more audio streams in, the reported length grows.
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let ready = inner.consumer.slots();
        if ready > 0 {
            RtrbByteStream::fill_history(&mut inner, ready);
        }
        let len = inner.history.len() as u64;
        Ok(len)
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
        let drained = inner.position as usize >= inner.history.len();
        let eof = drained && inner.consumer.is_abandoned() && inner.consumer.slots() == 0;
        Ok(eof.into())
    }

    fn Read(&self, pb: *mut u8, cb: u32, pcbread: *mut u32) -> windows::core::Result<()> {
        log::trace!("[RtrbByteStream] Read({cb})");
        // SAFETY: MF guarantees `pb` points to at least `cb` writable bytes; we
        // build a slice of exactly that length and never read past it.
        let buf = unsafe { std::slice::from_raw_parts_mut(pb, cb as usize) };
        let n = self.blocking_read(buf);
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
        let n = self.blocking_read(buf);
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
/// Owns the COM/MF lifecycle (via [`MfStartupGuard`]) and the `IMFSourceReader`.
/// Construct, decode, and drop all on a single MTA thread.
pub(crate) struct MfAacDecoder {
    reader: IMFSourceReader,
    spec: SignalSpec,
    /// Whether this instance successfully `CoInitializeEx`'d its thread (and so
    /// must `CoUninitialize` on drop).
    co_initialized: bool,
    /// Keeps MF alive while this decoder exists; drops last.
    _mf_guard: MfStartupGuard,
}

// All MF objects are confined to the constructing thread; `LiveDecoder: Send`
// is required by the trait, and Task 4 moves the value onto a single
// spawn_blocking thread before any decode call. The raw COM pointers are never
// shared, so this is sound under that usage contract.
unsafe impl Send for MfAacDecoder {}

impl MfAacDecoder {
    /// Build a decoder over the live byte ring. `content_type` is accepted for
    /// parity with `SymphoniaDecoder::new` but is unused: MF's ADTS source
    /// sniffs the format from the bytes themselves.
    pub(crate) fn new(consumer: rtrb::Consumer<u8>, _content_type: Option<&str>) -> Result<Self> {
        // 1. COM apartment: MTA. Tolerate S_FALSE (already init MTA) and
        //    RPC_E_CHANGED_MODE (thread already STA) — do NOT propagate either.
        // SAFETY: standard COM init on the owning thread.
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let co_initialized = if hr.is_ok() {
            true
        } else if hr == RPC_E_CHANGED_MODE {
            // Thread is already STA (e.g. set up by another component). MF works
            // from STA too; we just must not CoUninitialize what we didn't own.
            log::debug!("[MfAacDecoder] CoInitializeEx returned RPC_E_CHANGED_MODE (thread is STA); continuing");
            false
        } else {
            return Err(anyhow!("CoInitializeEx failed: {hr:?}"));
        };

        // 2. MFStartup (refcounted across decoder instances).
        let mf_guard = match MfStartupGuard::acquire() {
            Ok(g) => g,
            Err(e) => {
                if co_initialized {
                    // SAFETY: balances our own CoInitializeEx.
                    unsafe { CoUninitialize() };
                }
                return Err(e);
            }
        };

        // `build` takes the MF guard by value: on success it moves into the
        // returned decoder; on failure it is dropped there (MFShutdown handled by
        // the guard's Drop). COM is per-thread and owned by us, so we balance our
        // own CoInitializeEx here on the error path.
        let result = Self::build(consumer, co_initialized, mf_guard);
        if result.is_err() && co_initialized {
            // SAFETY: balances our CoInitializeEx above; only when we owned it.
            unsafe { CoUninitialize() };
        }
        result
    }

    fn build(
        consumer: rtrb::Consumer<u8>,
        co_initialized: bool,
        mf_guard: MfStartupGuard,
    ) -> Result<Self> {
        // 3. Wrap the rtrb consumer in our IMFByteStream. The content-type hint
        //    lives on the byte stream's own IMFAttributes (see RtrbByteStream),
        //    which is how the source resolver selects the ADTS source for a raw
        //    (URL-less) byte stream.
        let byte_stream: IMFByteStream = RtrbByteStream::new(consumer, "audio/aac")?.into();

        // 4. Reader attributes: audio-only (disable advanced video processing).
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

        // 5. Create the source reader over our byte stream. MF's ADTS source
        //    handler parses headers and instantiates the AAC decoder internally.
        // SAFETY: byte_stream and attributes are valid live COM objects.
        let reader = unsafe {
            MFCreateSourceReaderFromByteStream(&byte_stream, &attributes)
                .context("MFCreateSourceReaderFromByteStream failed (not AAC/ADTS?)")?
        };

        let stream_index = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;

        // 6. Desired OUTPUT type: PCM, 16-bit, rate/channels UNSET. MF negotiates
        //    the real post-SBR/PS rate + channel count for us.
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

        // 7. Read back the negotiated type to learn the true spec (32000/2 for
        //    the HE-AACv2 test stream).
        let spec = Self::read_spec(&reader, stream_index)?;
        log::info!(
            "[MfAacDecoder] negotiated output: {} Hz, {} ch",
            spec.rate,
            spec.channels.count()
        );

        Ok(Self {
            reader,
            spec,
            co_initialized,
            _mf_guard: mf_guard,
        })
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

impl LiveDecoder for MfAacDecoder {
    fn next_pcm(&mut self) -> Option<Vec<f32>> {
        let stream_index = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;
        loop {
            let mut flags: u32 = 0;
            let mut sample = None;
            // SAFETY: reader is valid; out-params are local.
            let read = unsafe {
                self.reader.ReadSample(
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
                return None;
            }

            let flags = MF_SOURCE_READER_FLAG(flags as i32);
            let has = |flag: MF_SOURCE_READER_FLAG| flags.0 & flag.0 != 0;
            if has(MF_SOURCE_READERF_ENDOFSTREAM) {
                log::info!("[MfAacDecoder] end of stream");
                return None;
            }
            if has(MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED) {
                // Defensive (the spike saw the spec constant from frame 0, but a
                // mid-stream bitrate/codec change could flip it).
                match Self::read_spec(&self.reader, stream_index) {
                    Ok(s) => {
                        log::info!(
                            "[MfAacDecoder] media type changed: {} Hz, {} ch",
                            s.rate,
                            s.channels.count()
                        );
                        self.spec = s;
                    }
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
                        return None;
                    }
                };
                let mut ptr: *mut u8 = std::ptr::null_mut();
                let mut current_len: u32 = 0;
                if let Err(e) = buffer.Lock(&mut ptr, None, Some(&mut current_len)) {
                    log::warn!("[MfAacDecoder] buffer Lock failed: {e}");
                    return None;
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
            return Some(pcm);
        }
    }

    fn spec(&self) -> SignalSpec {
        self.spec
    }
}

impl Drop for MfAacDecoder {
    fn drop(&mut self) {
        // Order: drop the reader (and its byte stream) first, then MF
        // (_mf_guard runs after this body), then COM. We explicitly handle COM
        // here; MF teardown is the guard's job.
        if self.co_initialized {
            // SAFETY: balances the CoInitializeEx we performed in `new` on this
            // same thread.
            unsafe { CoUninitialize() };
        }
    }
}
