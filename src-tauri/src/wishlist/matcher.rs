use crate::profile::WishlistEntry;

/// Result of checking a track against ignorelist and wishlist.
#[derive(Debug, Clone, PartialEq)]
pub enum TrackAction {
    /// Track matches an ignorelist pattern — do not record.
    Ignored { pattern: String },
    /// Track matches a wishlist pattern — record and mark.
    WishlistMatch { pattern: String },
    /// No match — normal behavior.
    Normal,
}

/// Case-insensitive wildcard matching.
/// `*` matches zero or more characters; `?` matches exactly one character.
pub fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.to_lowercase().chars().collect();
    let t: Vec<char> = text.to_lowercase().chars().collect();
    let (plen, tlen) = (p.len(), t.len());

    // dp[i][j] = pattern[0..i] matches text[0..j]
    let mut dp = vec![vec![false; tlen + 1]; plen + 1];
    dp[0][0] = true;

    // Leading '*' can match empty text
    for i in 1..=plen {
        if p[i - 1] == '*' {
            dp[i][0] = dp[i - 1][0];
        }
    }

    for i in 1..=plen {
        for j in 1..=tlen {
            if p[i - 1] == '*' {
                // '*' matches zero chars (dp[i-1][j]) or one more char (dp[i][j-1])
                dp[i][j] = dp[i - 1][j] || dp[i][j - 1];
            } else if p[i - 1] == '?' || p[i - 1] == t[j - 1] {
                dp[i][j] = dp[i - 1][j - 1];
            }
        }
    }

    dp[plen][tlen]
}

/// Build a full StreamTitle string for matching.
/// Rules: both empty → None. One empty → use the other. Both present → "artist - title".
pub fn build_stream_title(artist: &str, title: &str) -> Option<String> {
    let a = artist.trim();
    let t = title.trim();
    match (a.is_empty(), t.is_empty()) {
        (true, true) => None,
        (true, false) => Some(t.to_string()),
        (false, true) => Some(a.to_string()),
        (false, false) => Some(format!("{} - {}", a, t)),
    }
}

/// Check a track against per-stream ignorelist, global ignorelist, and wishlist.
/// Precedence: per-stream ignorelist → global ignorelist → wishlist → Normal.
pub fn check_track(
    stream_title: &str,
    per_stream_ignorelist: &[String],
    global_ignorelist: &[String],
    wishlist: &[WishlistEntry],
) -> TrackAction {
    // 1. Per-stream ignorelist
    for pattern in per_stream_ignorelist {
        if wildcard_match(pattern, stream_title) {
            return TrackAction::Ignored { pattern: pattern.clone() };
        }
    }

    // 2. Global ignorelist
    for pattern in global_ignorelist {
        if wildcard_match(pattern, stream_title) {
            return TrackAction::Ignored { pattern: pattern.clone() };
        }
    }

    // 3. Wishlist
    for entry in wishlist {
        if wildcard_match(&entry.pattern, stream_title) {
            return TrackAction::WishlistMatch {
                pattern: entry.pattern.clone(),
            };
        }
    }

    TrackAction::Normal
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match() {
        assert!(wildcard_match("hello", "hello"));
        assert!(!wildcard_match("hello", "world"));
    }

    #[test]
    fn case_insensitive() {
        assert!(wildcard_match("Tycho", "tycho"));
        assert!(wildcard_match("tycho", "TYCHO"));
    }

    #[test]
    fn star_wildcard() {
        assert!(wildcard_match("*", "anything"));
        assert!(wildcard_match("Tycho*", "Tycho - Dive"));
        assert!(wildcard_match("*Dive", "Tycho - Dive"));
        assert!(wildcard_match("*ycho*", "Tycho - Dive"));
        assert!(!wildcard_match("Bonobo*", "Tycho - Dive"));
    }

    /// The pair the field hint promises (`pattern_hint` in `messages/*.json`):
    /// matching is anchored to the whole string, so the bare artist name — the
    /// most natural pattern a person writes — catches nothing. Turning this into
    /// substring matching would make that hint lie.
    #[test]
    fn anchored_to_the_whole_string_not_a_substring() {
        assert!(!wildcard_match("Tycho", "Tycho - Dive"));
        assert!(wildcard_match("Tycho*", "Tycho - Dive"));
    }

    #[test]
    fn question_wildcard() {
        assert!(wildcard_match("?ycho", "Tycho"));
        assert!(!wildcard_match("?ycho", "Tyycho"));
        assert!(wildcard_match("T?cho", "Tycho"));
    }

    #[test]
    fn combined_wildcards() {
        assert!(wildcard_match("*jingle*", "Station Jingle 3"));
        assert!(wildcard_match("*advertisement*", "Some Advertisement Here"));
        assert!(wildcard_match("T?cho - *", "Tycho - Dive"));
    }

    #[test]
    fn empty_strings() {
        assert!(wildcard_match("", ""));
        assert!(wildcard_match("*", ""));
        assert!(!wildcard_match("?", ""));
        assert!(!wildcard_match("a", ""));
    }

    #[test]
    fn build_stream_title_rules() {
        assert_eq!(build_stream_title("Tycho", "Dive"), Some("Tycho - Dive".to_string()));
        assert_eq!(build_stream_title("", "Dive"), Some("Dive".to_string()));
        assert_eq!(build_stream_title("Tycho", ""), Some("Tycho".to_string()));
        assert_eq!(build_stream_title("", ""), None);
        assert_eq!(build_stream_title("  ", "  "), None);
    }

    fn make_wishlist_entry(pattern: &str) -> WishlistEntry {
        WishlistEntry {
            pattern: pattern.to_string(),
            min_bitrate: None,
            format: None,
            remove_after_record: false,
            add_to_ignorelist_after_record: false,
            added_at: "2026-01-01T00:00:00".to_string(),
        }
    }

    #[test]
    fn check_track_normal() {
        let result = check_track("Tycho - Dive", &[], &[], &[]);
        assert_eq!(result, TrackAction::Normal);
    }

    #[test]
    fn check_track_global_ignorelist() {
        let ignorelist = vec!["*jingle*".to_string()];
        let result = check_track("Station Jingle 3", &[], &ignorelist, &[]);
        assert_eq!(result, TrackAction::Ignored { pattern: "*jingle*".to_string() });
    }

    #[test]
    fn check_track_per_stream_ignorelist() {
        let per_stream = vec!["*ad break*".to_string()];
        let result = check_track("Ad Break", &per_stream, &[], &[]);
        assert_eq!(result, TrackAction::Ignored { pattern: "*ad break*".to_string() });
    }

    #[test]
    fn check_track_wishlist_match() {
        let wishlist = vec![make_wishlist_entry("Tycho*")];
        let result = check_track("Tycho - Dive", &[], &[], &wishlist);
        assert_eq!(result, TrackAction::WishlistMatch { pattern: "Tycho*".to_string() });
    }

    #[test]
    fn check_track_ignorelist_beats_wishlist() {
        let ignorelist = vec!["Tycho - Dive".to_string()];
        let wishlist = vec![make_wishlist_entry("Tycho*")];
        let result = check_track("Tycho - Dive", &[], &ignorelist, &wishlist);
        assert_eq!(result, TrackAction::Ignored { pattern: "Tycho - Dive".to_string() });
    }

    #[test]
    fn check_track_per_stream_beats_global() {
        let per_stream = vec!["Tycho*".to_string()];
        let global = vec!["*jingle*".to_string()];
        let wishlist = vec![make_wishlist_entry("Tycho*")];
        let result = check_track("Tycho - Dive", &per_stream, &global, &wishlist);
        assert_eq!(result, TrackAction::Ignored { pattern: "Tycho*".to_string() });
    }
}
