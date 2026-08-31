use crate::profile::{AudioFormat, UnsupportedCodec};

/// Трійковий вердикт про ефір (ADR 2026-08-31 §2). Дефолту немає: там, де
/// доказів не вистачило, стоїть `Unknown`, а не перший варіант зі списку.
///
/// `Foreign` несе ім'я сім'ї для розмови з людиною (`OGG`, `FLAC`) і свідомо
/// НЕ отримує варіанта в `AudioFormat`: той enum описує закритий набір того,
/// що Tapir уміє записати, а не те, що буває в ефірі.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FormatVerdict {
    /// Впізнаний, і Tapir уміє з ним усе.
    Supported(AudioFormat),
    /// Впізнана чужа сім'я — видно, що це, і видно, що Tapir цього не пише.
    Foreign(&'static str),
    /// Доказів не вистачило ні на що.
    Unknown,
}

impl FormatVerdict {
    /// Розкласти вердикт на два поля профілю: `format` — те, що Tapir уміє
    /// писати, `unsupported_codec` — мітка відмови. Обидва перезаписуються
    /// разом, тож рядок ніколи не показує «MP3 · OGG» від двох перевірок.
    pub fn split(self) -> (Option<AudioFormat>, Option<UnsupportedCodec>) {
        match self {
            Self::Supported(f) => (Some(f), None),
            Self::Foreign(family) => {
                (None, Some(UnsupportedCodec { family: Some(family.to_string()) }))
            }
            Self::Unknown => (None, Some(UnsupportedCodec { family: None })),
        }
    }
}

/// Перший доказ — заголовок `Content-Type`. `None` означає «доказу немає», а
/// не «невідомий формат»: вирок після цього виносять байти.
///
/// `application/ogg` тут не випадковий: Icecast віддає Ogg саме ним, тобто
/// повз матчер, що перебирає лише `audio/...`.
pub fn detect_from_content_type(content_type: &str) -> Option<FormatVerdict> {
    // Strip parameters like "; charset=utf-8"
    let base = content_type.split(';').next().unwrap_or(content_type).trim();
    match base.to_ascii_lowercase().as_str() {
        "audio/mpeg" | "audio/mp3" => Some(FormatVerdict::Supported(AudioFormat::Mp3)),
        "audio/aac" | "audio/aacp" | "audio/x-aac" | "audio/mp4" => {
            Some(FormatVerdict::Supported(AudioFormat::Aac))
        }
        "application/ogg" | "audio/ogg" | "audio/vorbis" | "audio/opus" => {
            Some(FormatVerdict::Foreign("OGG"))
        }
        "audio/flac" | "audio/x-flac" => Some(FormatVerdict::Foreign("FLAC")),
        _ => None,
    }
}

/// Другий доказ — перші байти ефіру. Той самий порядок, який веб-платформа
/// застосовує до невідомого типу: нюхати байти, а не призначати перший зі
/// списку.
pub fn detect_from_magic_bytes(bytes: &[u8]) -> Option<FormatVerdict> {
    // Чужі контейнери мають сигнатуру на нульовому зсуві, тож перевіряються
    // першими й однозначно.
    if bytes.starts_with(b"OggS") {
        return Some(FormatVerdict::Foreign("OGG"));
    }
    if bytes.starts_with(b"fLaC") {
        return Some(FormatVerdict::Foreign("FLAC"));
    }
    // ID3v2 перед першим кадром — це тег, а не формат, але в ефірі його
    // носить лише MP3.
    if bytes.starts_with(b"ID3") {
        return Some(FormatVerdict::Supported(AudioFormat::Mp3));
    }
    if bytes.len() < 2 {
        return None;
    }
    // AAC ADTS: 0xFF 0xF1 or 0xFF 0xF9 — check AAC before MP3
    // because both start with 0xFF
    if bytes[0] == 0xFF && matches!(bytes[1], 0xF0 | 0xF1 | 0xF8 | 0xF9) {
        return Some(FormatVerdict::Supported(AudioFormat::Aac));
    }
    // MP3 sync word: 0xFF followed by byte with upper 5 bits set (0xE0 mask)
    // Common: 0xFF 0xFB, 0xFF 0xF3, 0xFF 0xF2 — but the general check is safer
    if bytes[0] == 0xFF && (bytes[1] & 0xE0 == 0xE0) {
        return Some(FormatVerdict::Supported(AudioFormat::Mp3));
    }
    None
}

/// Єдина точка розпізнавання (ADR 2026-08-31, §§1 і 5): спершу `Content-Type`,
/// далі магічні байти, і жодного дефолту. Обидва викликачі — `probe` при
/// додаванні й старт запису — ходять сюди, тож двох розбіжних вердиктів про
/// той самий потік не існує.
pub fn detect(content_type: Option<&str>, first_bytes: &[u8]) -> FormatVerdict {
    if let Some(verdict) = content_type.and_then(detect_from_content_type) {
        return verdict;
    }
    detect_from_magic_bytes(first_bytes).unwrap_or(FormatVerdict::Unknown)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MP3_FRAME: &[u8] = &[0xFF, 0xFB, 0x90, 0x00];
    const ADTS_FRAME: &[u8] = &[0xFF, 0xF1, 0x50, 0x80];
    const OGG_PAGE: &[u8] = b"OggS\x00\x02\x00\x00";

    #[test]
    fn content_type_names_the_two_formats_tapir_records() {
        assert_eq!(
            detect_from_content_type("audio/mpeg"),
            Some(FormatVerdict::Supported(AudioFormat::Mp3)),
        );
        assert_eq!(
            detect_from_content_type("audio/aacp"),
            Some(FormatVerdict::Supported(AudioFormat::Aac)),
        );
    }

    #[test]
    fn content_type_parameters_and_case_do_not_hide_the_format() {
        assert_eq!(
            detect_from_content_type("Audio/MPEG; charset=utf-8"),
            Some(FormatVerdict::Supported(AudioFormat::Mp3)),
        );
    }

    #[test]
    fn application_ogg_is_recognised_as_a_foreign_family() {
        // Icecast віддає Ogg саме як application/*, повз матчер audio/... —
        // рівно той рядок, якого попередній матчер не бачив.
        assert_eq!(
            detect_from_content_type("application/ogg"),
            Some(FormatVerdict::Foreign("OGG")),
        );
        assert_eq!(detect_from_content_type("audio/ogg"), Some(FormatVerdict::Foreign("OGG")));
        assert_eq!(detect_from_content_type("audio/flac"), Some(FormatVerdict::Foreign("FLAC")));
    }

    #[test]
    fn unknown_content_type_is_no_evidence_not_a_verdict() {
        assert_eq!(detect_from_content_type("application/octet-stream"), None);
        assert_eq!(detect_from_content_type(""), None);
    }

    #[test]
    fn magic_bytes_tell_the_families_apart() {
        assert_eq!(
            detect_from_magic_bytes(MP3_FRAME),
            Some(FormatVerdict::Supported(AudioFormat::Mp3)),
        );
        assert_eq!(
            detect_from_magic_bytes(ADTS_FRAME),
            Some(FormatVerdict::Supported(AudioFormat::Aac)),
        );
        assert_eq!(detect_from_magic_bytes(OGG_PAGE), Some(FormatVerdict::Foreign("OGG")));
        assert_eq!(
            detect_from_magic_bytes(b"fLaC\x00\x00\x00\x22"),
            Some(FormatVerdict::Foreign("FLAC")),
        );
        assert_eq!(
            detect_from_magic_bytes(b"ID3\x03\x00\x00\x00"),
            Some(FormatVerdict::Supported(AudioFormat::Mp3)),
        );
    }

    #[test]
    fn magic_bytes_report_no_evidence_when_there_is_none() {
        assert_eq!(detect_from_magic_bytes(&[]), None);
        assert_eq!(detect_from_magic_bytes(&[0xFF]), None);
        assert_eq!(detect_from_magic_bytes(b"<html>"), None);
    }

    #[test]
    fn a_station_with_no_content_type_is_saved_by_its_bytes() {
        // Частина станцій заголовка не шле зовсім — вони пишуться сьогодні й
        // мусять писатися далі.
        assert_eq!(detect(None, MP3_FRAME), FormatVerdict::Supported(AudioFormat::Mp3));
        assert_eq!(detect(Some(""), ADTS_FRAME), FormatVerdict::Supported(AudioFormat::Aac));
    }

    #[test]
    fn content_type_speaks_first() {
        assert_eq!(
            detect(Some("audio/mpeg"), OGG_PAGE),
            FormatVerdict::Supported(AudioFormat::Mp3),
        );
    }

    #[test]
    fn no_evidence_at_all_is_unknown_never_mp3() {
        // Рівно той дефолт, заради якого існує цей запис.
        assert_eq!(detect(None, &[]), FormatVerdict::Unknown);
        assert_eq!(detect(Some("text/html"), b"<html>"), FormatVerdict::Unknown);
    }

    #[test]
    fn split_puts_each_verdict_in_exactly_one_field() {
        assert_eq!(
            FormatVerdict::Supported(AudioFormat::Aac).split(),
            (Some(AudioFormat::Aac), None),
        );
        assert_eq!(
            FormatVerdict::Foreign("OGG").split(),
            (None, Some(UnsupportedCodec { family: Some("OGG".to_string()) })),
        );
        assert_eq!(FormatVerdict::Unknown.split(), (None, Some(UnsupportedCodec { family: None })));
    }
}
