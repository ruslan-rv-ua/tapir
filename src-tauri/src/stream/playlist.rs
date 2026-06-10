use crate::errors::RadioError;
use std::collections::{BTreeMap, HashSet};

/// One entry parsed from a playlist: a stream URL and its optional display title.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedEntry {
    pub url: String,
    pub title: Option<String>,
}

/// Split a string like `1=value` into (1, "value"). Returns None if there is no
/// `=` or the index part is not a number.
fn split_indexed(s: &str) -> Option<(u32, &str)> {
    let eq = s.find('=')?;
    let num: u32 = s[..eq].trim().parse().ok()?;
    Some((num, &s[eq + 1..]))
}

/// Parse every `FileN=`/`TitleN=` pair from a PLS playlist. Non-HTTP(S) URLs are
/// dropped; duplicate URLs are removed (first wins). Titles are matched by index.
pub fn parse_pls_all(content: &str) -> Vec<ParsedEntry> {
    let mut files: BTreeMap<u32, String> = BTreeMap::new();
    let mut titles: BTreeMap<u32, String> = BTreeMap::new();
    for line in content.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("File") {
            if let Some((n, v)) = split_indexed(rest) {
                files.insert(n, v.trim().to_string());
            }
        } else if let Some(rest) = line.strip_prefix("Title") {
            if let Some((n, v)) = split_indexed(rest) {
                titles.insert(n, v.trim().to_string());
            }
        }
    }
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (n, url) in files {
        if validate_stream_url(&url).is_err() || !seen.insert(url.clone()) {
            continue;
        }
        let title = titles.get(&n).filter(|t| !t.is_empty()).cloned();
        out.push(ParsedEntry { url, title });
    }
    out
}

/// Parse every entry from an M3U/M3U8 playlist. `#EXTINF:-1,Title` is paired with
/// the next URL line. Non-HTTP(S) URLs are dropped; duplicate URLs are removed.
/// An HLS *media* playlist (contains `#EXT-X-` tags) is a list of segments, not
/// stations, so it parses to an empty list.
pub fn parse_m3u_all(content: &str) -> Vec<ParsedEntry> {
    if content.lines().any(|l| l.trim_start().starts_with("#EXT-X-")) {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut pending_title: Option<String> = None;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            pending_title = rest
                .splitn(2, ',')
                .nth(1)
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty());
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        let url = line.to_string();
        if validate_stream_url(&url).is_err() || !seen.insert(url.clone()) {
            pending_title = None;
            continue;
        }
        out.push(ParsedEntry { url, title: pending_title.take() });
    }
    out
}

/// Parse a playlist whose format is detected by content (a `[playlist]` line
/// means PLS; otherwise M3U) rather than by file extension.
pub fn parse_playlist_all(content: &str) -> Vec<ParsedEntry> {
    let is_pls = content.lines().any(|l| l.trim().eq_ignore_ascii_case("[playlist]"));
    if is_pls { parse_pls_all(content) } else { parse_m3u_all(content) }
}

/// Parse PLS playlist, return first stream URL.
/// PLS format example:
///   [playlist]
///   File1=https://ice1.somafm.com/groovesalad-256-mp3
///   Title1=SomaFM: Groove Salad
///   Length1=-1
///   NumberOfEntries=1
///   Version=2
pub fn parse_pls(content: &str) -> Result<String, RadioError> {
    parse_pls_all(content)
        .into_iter()
        .next()
        .map(|e| e.url)
        .ok_or_else(|| RadioError::Format("No File1= entry found in PLS".to_string()))
}

/// Parse M3U/M3U8 playlist, return first stream URL.
/// M3U format: lines starting with # are comments/directives, first non-empty non-# line is the URL.
pub fn parse_m3u(content: &str) -> Result<String, RadioError> {
    parse_m3u_all(content)
        .into_iter()
        .next()
        .map(|e| e.url)
        .ok_or_else(|| RadioError::Format("No stream URL found in M3U".to_string()))
}

/// Reject non-HTTP(S) URLs extracted from playlists (e.g. file:// injection).
fn validate_stream_url(url: &str) -> Result<(), RadioError> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(RadioError::InvalidUrl(format!(
            "Playlist contains non-HTTP URL: {url}"
        )));
    }
    Ok(())
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

    #[test]
    fn parse_pls_all_returns_all_entries_with_titles() {
        let content = "[playlist]\nFile1=https://a.example/1\nTitle1=Alpha\nFile2=https://b.example/2\nTitle2=Beta\nNumberOfEntries=2\n";
        let got = parse_pls_all(content);
        assert_eq!(got, vec![
            ParsedEntry { url: "https://a.example/1".into(), title: Some("Alpha".into()) },
            ParsedEntry { url: "https://b.example/2".into(), title: Some("Beta".into()) },
        ]);
    }

    #[test]
    fn parse_pls_all_skips_non_http_and_dedups() {
        let content = "[playlist]\nFile1=https://a.example/1\nFile2=file:///etc/passwd\nFile3=https://a.example/1\n";
        let got = parse_pls_all(content);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].url, "https://a.example/1");
    }

    #[test]
    fn parse_m3u_all_pairs_extinf_titles() {
        let content = "#EXTM3U\n#EXTINF:-1,Alpha\nhttps://a.example/1\n#EXTINF:-1,Beta\nhttps://b.example/2\n";
        let got = parse_m3u_all(content);
        assert_eq!(got, vec![
            ParsedEntry { url: "https://a.example/1".into(), title: Some("Alpha".into()) },
            ParsedEntry { url: "https://b.example/2".into(), title: Some("Beta".into()) },
        ]);
    }

    #[test]
    fn parse_m3u_all_url_without_extinf_has_no_title() {
        let content = "https://a.example/1\n";
        let got = parse_m3u_all(content);
        assert_eq!(got, vec![ParsedEntry { url: "https://a.example/1".into(), title: None }]);
    }

    #[test]
    fn parse_m3u_all_hls_segment_playlist_is_empty() {
        let content = "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:9.0,\nsegment0.ts\nsegment1.ts\n";
        assert!(parse_m3u_all(content).is_empty());
    }

    #[test]
    fn parse_playlist_all_detects_pls_by_content() {
        let content = "[PLAYLIST]\nFile1=https://a.example/1\n";
        let got = parse_playlist_all(content);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].url, "https://a.example/1");
    }

    #[test]
    fn parse_playlist_all_defaults_to_m3u() {
        let content = "#EXTM3U\nhttps://a.example/1\n";
        let got = parse_playlist_all(content);
        assert_eq!(got.len(), 1);
    }
}
