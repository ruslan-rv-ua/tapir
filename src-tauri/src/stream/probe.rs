use crate::profile::{AudioFormat, UnsupportedCodec};
use crate::stream::{connection, format, playlist};

/// Result of probing a single stream URL. `format`/`bitrate`/`icy_name` are for
/// display only — they are NOT persisted into the imported stream.
///
/// `format` і `unsupported` — дві половини одного вердикту `format::detect`
/// (ADR 2026-08-31 §2), тож заповнена завжди рівно одна з них.
#[derive(Debug, Clone)]
pub struct ProbeResult {
    pub url: String,
    pub ok: bool,
    pub icy_name: Option<String>,
    pub bitrate: Option<u32>,
    pub format: Option<AudioFormat>,
    pub unsupported: Option<UnsupportedCodec>,
    pub error: Option<String>,
}

fn failed(url: &str, error: String) -> ProbeResult {
    ProbeResult { url: url.to_string(), ok: false, icy_name: None, bitrate: None, format: None, unsupported: None, error: Some(error) }
}

/// Check whether a stream is reachable and read its ICY metadata. Resolves a
/// nested playlist URL first, connects (10s connect timeout via
/// `connection::connect`), reads headers **and the first bytes**, then drops the
/// body. The returned `url` is always the original input so the caller can
/// match it.
///
/// Байти тут — не запас на майбутнє: без них станція без `Content-Type`
/// виглядала б невпізнаною при додаванні й писалася б нормально, тобто про той
/// самий потік існувало б два різні вердикти (ADR 2026-08-31 §5).
pub async fn probe(url: &str) -> ProbeResult {
    let resolved = match playlist::resolve_playlist_url(url).await {
        Ok(u) => u,
        Err(e) => return failed(url, e.to_string()),
    };
    match connection::connect(&resolved).await {
        Ok(conn) => {
            let icy_name = conn.headers.name().map(str::to_string);
            let bitrate = conn.headers.bitrate().map(|b| b as u32);
            let (format, unsupported) =
                format::detect(conn.content_type.as_deref(), &conn.prefix).split();
            drop(conn); // headers and first bytes are all we needed; discard the body
            ProbeResult { url: url.to_string(), ok: true, icy_name, bitrate, format, unsupported, error: None }
        }
        Err(e) => failed(url, e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn probe_unreachable_host_is_not_ok() {
        let r = probe("https://invalid.example.invalid/stream").await;
        assert!(!r.ok);
        assert!(r.error.is_some());
        assert_eq!(r.url, "https://invalid.example.invalid/stream");
    }
}
