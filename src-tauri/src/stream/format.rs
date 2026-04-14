use crate::profile::AudioFormat;

/// Detect audio format from HTTP content-type header.
pub fn detect_from_content_type(content_type: &str) -> Option<AudioFormat> {
    // Strip parameters like "; charset=utf-8"
    let base = content_type.split(';').next().unwrap_or(content_type).trim();
    match base {
        "audio/mpeg" | "audio/mp3" => Some(AudioFormat::Mp3),
        "audio/aac" | "audio/aacp" | "audio/x-aac" | "audio/mp4" => Some(AudioFormat::Aac),
        _ => None,
    }
}

/// Detect audio format from magic bytes (first 2 bytes of audio stream).
pub fn detect_from_magic_bytes(bytes: &[u8]) -> Option<AudioFormat> {
    if bytes.len() < 2 {
        return None;
    }
    // AAC ADTS: 0xFF 0xF1 or 0xFF 0xF9 — check AAC before MP3
    // because both start with 0xFF
    if bytes[0] == 0xFF && (bytes[1] == 0xF1 || bytes[1] == 0xF9) {
        return Some(AudioFormat::Aac);
    }
    // MP3 sync word: 0xFF followed by byte with upper 5 bits set (0xE0 mask)
    // Common: 0xFF 0xFB, 0xFF 0xF3, 0xFF 0xF2 — but the general check is safer
    if bytes[0] == 0xFF && (bytes[1] & 0xE0 == 0xE0) {
        return Some(AudioFormat::Mp3);
    }
    None
}

/// Full format detection: content-type first, then magic bytes fallback.
pub fn detect(content_type: Option<&str>, first_bytes: &[u8]) -> Option<AudioFormat> {
    if let Some(ct) = content_type {
        if let Some(fmt) = detect_from_content_type(ct) {
            return Some(fmt);
        }
    }
    detect_from_magic_bytes(first_bytes)
}
