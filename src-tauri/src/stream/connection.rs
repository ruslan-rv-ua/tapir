use crate::errors::RadioError;
use icy_metadata::{IcyHeaders, RequestIcyMetadata};
use reqwest::Client;
use log::info;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone)]
pub struct TrackMetadata {
    pub artist: String,
    pub title: String,
}

pub struct IcyConnection {
    pub headers: IcyHeaders,
    pub content_type: Option<String>,
    /// Перші байти ефіру, вже зняті з `response`. Другий доказ для
    /// `format::detect` (ADR 2026-08-31 §1) — заголовок у радіо ненадійний за
    /// побудовою, а частина станцій не шле його зовсім.
    ///
    /// Читач мусить віддати ці байти першими, інакше початок ефіру пропаде;
    /// `probe` їх просто розглядає й викидає разом із тілом.
    pub prefix: bytes::Bytes,
    pub response: reqwest::Response,
}

/// Скільки чекати на перший шматок тіла. Окремо від `connect_timeout`: там
/// вимірюється встановлення з'єднання, тут — чи пішов ефір.
const FIRST_CHUNK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

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

    // Знімаємо перший шматок тут, а не в читачі: обидва викликачі `detect`
    // мусять бачити ті самі байти, і probe серед них — він тіла не читає
    // взагалі.
    let mut response = response;
    let prefix = match tokio::time::timeout(FIRST_CHUNK_TIMEOUT, response.chunk()).await {
        Ok(Ok(Some(b))) if !b.is_empty() => b,
        Ok(Err(e)) => return Err(e.into()),
        // Тіло скінчилось одразу або станція мовчить: ефір не пішов. Це **не**
        // вердикт про формат — доказів немає взагалі, а порожній префікс
        // видав би «невпізнаний» і застряг би міткою в профілі. Це той самий
        // випадок, що й обрив: спроба витрачена, перепідключення планується
        // (ADR 2026-08-13, CONTEXT.md §«Перепідключення і спроба»).
        _ => {
            return Err(RadioError::Other(format!(
                "Stream sent no audio within {}s",
                FIRST_CHUNK_TIMEOUT.as_secs(),
            )))
        }
    };

    Ok(IcyConnection {
        headers,
        content_type,
        prefix,
        response,
    })
}

/// Decode ICY metadata bytes: try UTF-8, fallback to latin-1 (ISO-8859-1).
/// Strips a UTF-8 BOM if present and applies NFC normalization on both paths.
///
/// Scaffold: will replace inline decoding in `recording_task` when ICY fallback chain is wired up.
#[allow(dead_code)]
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
///
/// Scaffold: will replace inline parsing in `recording_task`.
#[allow(dead_code)]
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
