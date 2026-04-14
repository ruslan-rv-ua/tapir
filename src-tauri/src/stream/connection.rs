use crate::errors::RadioError;
use icy_metadata::{IcyHeaders, RequestIcyMetadata};
use reqwest::Client;
use tracing::info;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone)]
pub struct TrackMetadata {
    pub artist: String,
    pub title: String,
}

pub struct IcyConnection {
    pub headers: IcyHeaders,
    pub content_type: Option<String>,
    pub response: reqwest::Response,
}

pub async fn connect(url: &str) -> Result<IcyConnection, RadioError> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()?;

    let response = client
        .get(url)
        .request_icy_metadata()
        .header("User-Agent", "Tapir/0.1.0")
        .send()
        .await?
        .error_for_status()?;

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let headers = IcyHeaders::parse_from_headers(response.headers());

    info!(
        "Connected to {} — name: {:?}, bitrate: {:?}, content-type: {:?}, metaint: {:?}",
        url,
        headers.name(),
        headers.bitrate(),
        content_type,
        headers.metadata_interval(),
    );

    Ok(IcyConnection {
        headers,
        content_type,
        response,
    })
}

/// Decode ICY metadata bytes: try UTF-8, fallback to latin-1 (ISO-8859-1).
/// Strips a UTF-8 BOM if present and applies NFC normalization on both paths.
pub fn decode_icy_metadata(bytes: &[u8]) -> String {
    // Strip UTF-8 BOM if present (some legacy SHOUTcast servers prepend it)
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(s) => s.nfc().collect(),
        Err(_) => {
            // Fallback: treat each byte as latin-1 (ISO-8859-1) codepoint
            bytes.iter().map(|&b| b as char).collect::<String>().nfc().collect()
        }
    }
}

/// Parse StreamTitle from ICY metadata format: `StreamTitle='artist - title';StreamUrl='...';`
/// Returns TrackMetadata with artist and title split on " - " (first occurrence).
pub fn parse_stream_title(metadata_str: &str) -> Option<TrackMetadata> {
    // Find StreamTitle='...'
    let start = metadata_str.find("StreamTitle='")?;
    let after_quote = start + "StreamTitle='".len();
    let end = metadata_str[after_quote..].find('\'')?;
    let title_str = &metadata_str[after_quote..after_quote + end];

    if title_str.is_empty() {
        return None;
    }

    // Split on " - " (first occurrence) into artist and title
    if let Some(sep_pos) = title_str.find(" - ") {
        Some(TrackMetadata {
            artist: title_str[..sep_pos].trim().to_string(),
            title: title_str[sep_pos + 3..].trim().to_string(),
        })
    } else {
        // No separator: treat full string as title, empty artist
        Some(TrackMetadata {
            artist: String::new(),
            title: title_str.trim().to_string(),
        })
    }
}
