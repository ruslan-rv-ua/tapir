//! How a stream gets the name it is stored — and recorded — under.
//!
//! One station commonly publishes several streams (Icecast mountpoints with
//! different codecs, or plain mirrors) under one identical `icy-name`, and
//! Radio Browser lists each as its own entry. Identical names are
//! indistinguishable in the list (especially read aloud) and, worse, `%s`
//! turns them into ONE recording folder where simultaneous recordings of the
//! same track collide.
//!
//! The rule: names must be *distinguishable*, not forcibly unique. A colliding
//! arrival gets an ASCII suffix once, at add time, and keeps it forever — the
//! name is a directory, so stability beats accuracy, and a name that changes
//! by itself is a lie to a screen reader.

use crate::profile::{AudioFormat, StreamInfo};
use crate::sanitize::sanitize_component;
use std::collections::HashSet;

/// Upper bound for the ordinal fallback, mirroring `sanitize::resolve_collision`.
const MAX_ORDINAL: u32 = 9999;

/// The value two names are compared by. Two streams collide when their names
/// sanitize to the same `%s` folder, ignoring case — NTFS treats `Radio X` and
/// `radio x` as one directory, so a case-only difference would still merge the
/// recordings.
pub fn collision_key(name: &str) -> String {
    sanitize_component(name.trim()).to_lowercase()
}

/// What is known about a stream at the moment it is added. Both fields are
/// optional: a failed probe or a bare playlist entry knows neither.
#[derive(Debug, Clone, Default)]
pub struct NameMeta {
    pub format: Option<AudioFormat>,
    pub bitrate: Option<u32>,
}

fn codec_label(format: &AudioFormat) -> &'static str {
    match format {
        AudioFormat::Mp3 => "MP3",
        AudioFormat::Aac => "AAC",
    }
}

/// `(AAC 64k)`, `(AAC)`, `(128k)` — or `None` when nothing is known and the
/// caller has to fall back to an ordinal. Deliberately ASCII and unlocalized.
fn informative_suffix(meta: &NameMeta) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Some(format) = &meta.format {
        parts.push(codec_label(format).to_string());
    }
    if let Some(bitrate) = meta.bitrate.filter(|b| *b > 0) {
        parts.push(format!("{bitrate}k"));
    }
    if parts.is_empty() {
        None
    } else {
        Some(format!("({})", parts.join(" ")))
    }
}

/// The name `desired` should actually be stored under, given the collision keys
/// already `taken`. Free names come back untouched; a collision gets the
/// informative suffix, and an ordinal on top of that if even the suffixed name
/// is taken (two truly identical variants).
pub fn disambiguate(desired: &str, meta: &NameMeta, taken: &HashSet<String>) -> String {
    let desired = desired.trim();
    if !taken.contains(&collision_key(desired)) {
        return desired.to_string();
    }
    let base = match informative_suffix(meta) {
        Some(suffix) => {
            let candidate = format!("{desired} {suffix}");
            if !taken.contains(&collision_key(&candidate)) {
                return candidate;
            }
            candidate
        }
        None => desired.to_string(),
    };
    for n in 2..=MAX_ORDINAL {
        let candidate = format!("{base} ({n})");
        if !taken.contains(&collision_key(&candidate)) {
            return candidate;
        }
    }
    base
}

/// Collision keys of every stream, optionally skipping one id — pass the id of
/// the stream being renamed so its own current name is not a conflict.
pub fn taken_keys<'a>(
    streams: impl IntoIterator<Item = &'a StreamInfo>,
    exclude_id: Option<&str>,
) -> HashSet<String> {
    streams
        .into_iter()
        .filter(|s| Some(s.id.as_str()) != exclude_id)
        .map(|s| collision_key(&s.name))
        .collect()
}

/// Name a whole batch in arrival order, so two streams arriving together are
/// also distinguished from each other — a playlist listing every mountpoint of
/// one station is the usual source of same-name pairs. `taken` is updated as it
/// goes; seed it from the destination profile via [`taken_keys`].
pub fn disambiguate_batch(streams: &mut [StreamInfo], taken: &mut HashSet<String>) {
    for stream in streams.iter_mut() {
        let meta = NameMeta { format: stream.format.clone(), bitrate: stream.bitrate };
        stream.name = disambiguate(&stream.name, &meta, taken);
        taken.insert(collision_key(&stream.name));
    }
}

/// The name an ICY-discovered station name should give a stream, or `None` when
/// the stream keeps what it has. Only a never-named stream is renamed —
/// `add_stream` stores the URL as the name when the user typed none, so
/// `current == url` is exactly "this stream has no human name yet". A name the
/// user or the station directory chose is never overwritten.
pub fn icy_rename(
    current: &str,
    url: &str,
    icy_name: &str,
    meta: &NameMeta,
    taken: &HashSet<String>,
) -> Option<String> {
    if current != url {
        return None;
    }
    let icy_name = icy_name.trim();
    if icy_name.is_empty() {
        return None;
    }
    Some(disambiguate(icy_name, meta, taken))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(names: &[&str]) -> HashSet<String> {
        names.iter().map(|n| collision_key(n)).collect()
    }

    fn meta(format: Option<AudioFormat>, bitrate: Option<u32>) -> NameMeta {
        NameMeta { format, bitrate }
    }

    fn stream(
        id: &str,
        url: &str,
        name: &str,
        format: Option<AudioFormat>,
        bitrate: Option<u32>,
    ) -> StreamInfo {
        StreamInfo {
            id: id.into(),
            url: url.into(),
            name: name.into(),
            format,
            unsupported_codec: None,
            bitrate,
            icy_name: None,
            icy_genre: None,
            icy_url: None,
            ignorelist: vec![],
            username: None,
            password: None,
            added_at: "2026-01-01".into(),
        }
    }

    #[test]
    fn collision_key_is_sanitized_and_case_insensitive() {
        // `%s` turns both into the same folder, and NTFS ignores case.
        assert_eq!(collision_key("Radio X"), collision_key("radio x"));
        assert_eq!(collision_key("Radio/X"), collision_key("Radio_X"));
        assert_eq!(collision_key("  Radio X  "), collision_key("Radio X"));
        assert_ne!(collision_key("Radio X"), collision_key("Radio Y"));
    }

    #[test]
    fn free_name_is_returned_untouched() {
        let taken = keys(&["Other"]);
        assert_eq!(disambiguate("Radio X", &meta(None, None), &taken), "Radio X");
    }

    #[test]
    fn collision_appends_codec_and_bitrate() {
        let taken = keys(&["Radio X"]);
        let got = disambiguate("Radio X", &meta(Some(AudioFormat::Aac), Some(64)), &taken);
        assert_eq!(got, "Radio X (AAC 64k)");
    }

    #[test]
    fn codec_only_when_bitrate_unknown() {
        let taken = keys(&["Radio X"]);
        assert_eq!(
            disambiguate("Radio X", &meta(Some(AudioFormat::Aac), None), &taken),
            "Radio X (AAC)"
        );
    }

    #[test]
    fn bitrate_only_when_codec_unknown() {
        let taken = keys(&["Radio X"]);
        assert_eq!(disambiguate("Radio X", &meta(None, Some(128)), &taken), "Radio X (128k)");
    }

    #[test]
    fn zero_bitrate_counts_as_unknown() {
        let taken = keys(&["Radio X"]);
        assert_eq!(
            disambiguate("Radio X", &meta(Some(AudioFormat::Mp3), Some(0)), &taken),
            "Radio X (MP3)"
        );
    }

    #[test]
    fn ordinal_when_no_metadata_at_all() {
        let taken = keys(&["Radio X"]);
        assert_eq!(disambiguate("Radio X", &meta(None, None), &taken), "Radio X (2)");
    }

    #[test]
    fn ordinal_stacks_on_a_colliding_informative_suffix() {
        let taken = keys(&["Radio X", "Radio X (AAC 64k)"]);
        let got = disambiguate("Radio X", &meta(Some(AudioFormat::Aac), Some(64)), &taken);
        assert_eq!(got, "Radio X (AAC 64k) (2)");
    }

    #[test]
    fn ordinal_keeps_counting_past_two() {
        let taken = keys(&["Radio X", "Radio X (2)", "Radio X (3)"]);
        assert_eq!(disambiguate("Radio X", &meta(None, None), &taken), "Radio X (4)");
    }

    #[test]
    fn collision_ignores_case_of_the_existing_name() {
        let taken = keys(&["RADIO X"]);
        assert_eq!(disambiguate("Radio X", &meta(None, None), &taken), "Radio X (2)");
    }

    #[test]
    fn batch_distinguishes_arrivals_from_each_other() {
        let mut batch = vec![
            stream("a", "http://a", "BBC 6", Some(AudioFormat::Aac), Some(48)),
            stream("b", "http://b", "BBC 6", Some(AudioFormat::Mp3), Some(128)),
            stream("c", "http://c", "BBC 6", None, None),
        ];
        let mut taken = HashSet::new();
        disambiguate_batch(&mut batch, &mut taken);
        assert_eq!(batch[0].name, "BBC 6");
        assert_eq!(batch[1].name, "BBC 6 (MP3 128k)");
        assert_eq!(batch[2].name, "BBC 6 (2)");
    }

    #[test]
    fn taken_keys_skips_the_excluded_stream() {
        let streams = vec![
            stream("a", "http://a", "Radio X", None, None),
            stream("b", "http://b", "Radio Y", None, None),
        ];
        let all = taken_keys(streams.iter(), None);
        assert!(all.contains(&collision_key("Radio X")));
        let without_a = taken_keys(streams.iter(), Some("a"));
        assert!(!without_a.contains(&collision_key("Radio X")));
        assert!(without_a.contains(&collision_key("Radio Y")));
    }

    #[test]
    fn icy_rename_only_touches_a_never_named_stream() {
        let taken = HashSet::new();
        // name == url -> the placeholder add_stream leaves when no name was typed
        assert_eq!(
            icy_rename("http://a", "http://a", "Radio X", &meta(None, None), &taken),
            Some("Radio X".to_string())
        );
        // a name the user (or the browser) chose is never overwritten
        assert_eq!(icy_rename("My Name", "http://a", "Radio X", &meta(None, None), &taken), None);
    }

    #[test]
    fn icy_rename_suffixes_against_the_profile() {
        let taken = keys(&["Radio X"]);
        let got = icy_rename(
            "http://a",
            "http://a",
            "Radio X",
            &meta(Some(AudioFormat::Aac), Some(64)),
            &taken,
        );
        assert_eq!(got, Some("Radio X (AAC 64k)".to_string()));
    }

    #[test]
    fn icy_rename_ignores_a_blank_icy_name() {
        let taken = HashSet::new();
        assert_eq!(icy_rename("http://a", "http://a", "   ", &meta(None, None), &taken), None);
    }
}
