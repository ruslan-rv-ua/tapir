use crate::profile::AudioFormat;
use crate::stream::{connection, format, playlist};

/// Result of probing a single stream URL. `format`/`bitrate`/`icy_name` are for
/// display only — they are NOT persisted into the imported stream.
#[derive(Debug, Clone)]
pub struct ProbeResult {
    pub url: String,
    pub ok: bool,
    pub icy_name: Option<String>,
    pub bitrate: Option<u32>,
    pub format: Option<AudioFormat>,
    pub error: Option<String>,
}

fn failed(url: &str, error: String) -> ProbeResult {
    ProbeResult { url: url.to_string(), ok: false, icy_name: None, bitrate: None, format: None, error: Some(error) }
}

/// Check whether a stream is reachable and read its ICY metadata. Resolves a
/// nested playlist URL first, connects (10s connect timeout via
/// `connection::connect`), reads headers, then drops the body. The returned
/// `url` is always the original input so the caller can match it.
pub async fn probe(url: &str) -> ProbeResult {
    let resolved = match playlist::resolve_playlist_url(url).await {
        Ok(u) => u,
        Err(e) => return failed(url, e.to_string()),
    };
    match connection::connect(&resolved).await {
        Ok(conn) => {
            let icy_name = conn.headers.name().map(str::to_string);
            let bitrate = conn.headers.bitrate().map(|b| b as u32);
            let format = format::detect_from_content_type(conn.content_type.as_deref().unwrap_or(""));
            drop(conn); // we only needed the headers; discard the response body
            ProbeResult { url: url.to_string(), ok: true, icy_name, bitrate, format, error: None }
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
