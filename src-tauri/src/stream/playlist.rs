use crate::errors::RadioError;

/// Parse PLS playlist, return first stream URL.
/// PLS format example:
///   [playlist]
///   File1=https://ice1.somafm.com/groovesalad-256-mp3
///   Title1=SomaFM: Groove Salad
///   Length1=-1
///   NumberOfEntries=1
///   Version=2
pub fn parse_pls(content: &str) -> Result<String, RadioError> {
    for line in content.lines() {
        let line = line.trim();
        if let Some(url) = line.strip_prefix("File1=") {
            let url = url.trim();
            if !url.is_empty() {
                return Ok(url.to_string());
            }
        }
    }
    Err(RadioError::Format("No File1= entry found in PLS".to_string()))
}

/// Parse M3U/M3U8 playlist, return first stream URL.
/// M3U format: lines starting with # are comments/directives, first non-empty non-# line is the URL.
pub fn parse_m3u(content: &str) -> Result<String, RadioError> {
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        return Ok(line.to_string());
    }
    Err(RadioError::Format("No stream URL found in M3U".to_string()))
}

/// Detect playlist type by URL path extension (.pls / .m3u / .m3u8), fetch and parse.
/// Query strings and fragments are stripped before extension detection.
/// Returns the original URL unchanged if it is not a recognised playlist extension.
///
/// Note: content-type-based detection is not implemented; the caller (add_stream)
/// should pass the already-resolved URL when the content-type is known.
pub async fn resolve_playlist_url(url: &str) -> Result<String, RadioError> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(RadioError::InvalidUrl(format!("Expected an HTTP/HTTPS URL, got: {}", url)));
    }

    // Strip query string and fragment before extension check
    let path_only = url.split('?').next().unwrap_or(url);
    let path_only = path_only.split('#').next().unwrap_or(path_only);
    let lower = path_only.to_lowercase();
    if !lower.ends_with(".pls")
        && !lower.ends_with(".m3u")
        && !lower.ends_with(".m3u8")
    {
        return Ok(url.to_string()); // Not a playlist — return as-is
    }

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()?;
    let content = client
        .get(url)
        .header("User-Agent", "Tapir/0.1.0")
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;

    if lower.ends_with(".pls") {
        parse_pls(&content)
    } else {
        parse_m3u(&content)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pls_basic() {
        let content = "[playlist]\nFile1=https://example.com/stream\nTitle1=Test\nNumberOfEntries=1\n";
        assert_eq!(parse_pls(content).unwrap(), "https://example.com/stream");
    }

    #[test]
    fn test_parse_pls_with_whitespace() {
        let content = "[playlist]\n  File1=  https://example.com/stream  \n";
        assert_eq!(parse_pls(content).unwrap(), "https://example.com/stream");
    }

    #[test]
    fn test_parse_pls_not_found() {
        let content = "[playlist]\nNumberOfEntries=0\n";
        assert!(parse_pls(content).is_err());
    }

    #[test]
    fn test_parse_m3u_basic() {
        let content = "#EXTM3U\n#EXTINF:-1,Test Stream\nhttps://example.com/stream\n";
        assert_eq!(parse_m3u(content).unwrap(), "https://example.com/stream");
    }

    #[test]
    fn test_parse_m3u_empty_lines() {
        let content = "\n\nhttps://example.com/stream\n";
        assert_eq!(parse_m3u(content).unwrap(), "https://example.com/stream");
    }

    #[test]
    fn test_parse_m3u_not_found() {
        let content = "#EXTM3U\n# only comments\n";
        assert!(parse_m3u(content).is_err());
    }

    #[tokio::test]
    async fn test_resolve_non_playlist_url() {
        let result = resolve_playlist_url("https://ice5.somafm.com/groovesalad-128-mp3").await;
        assert_eq!(result.unwrap(), "https://ice5.somafm.com/groovesalad-128-mp3");
    }

    #[tokio::test]
    async fn test_resolve_pls_extension_detected() {
        // A .pls URL triggers a fetch; an unreachable host returns a network error
        let result = resolve_playlist_url("https://invalid.example.invalid/stream.pls").await;
        assert!(result.is_err(), "Should fail to fetch an unreachable .pls URL");
    }
}
