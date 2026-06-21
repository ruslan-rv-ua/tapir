use chrono::Local;
use std::path::{Path, PathBuf};

/// Render filename template with metadata placeholders.
/// %a = artist, %t = title, %s = station, %n = track number (zero-padded to 3 digits),
/// %d = date (YYYY-MM-DD), %time = time (HH-MM-SS)
///
/// Template example: "%s\%a - %t" → "SomaFM Groove Salad\Tycho - Past is Prologue"
/// Uses single-pass expansion so values containing placeholder sequences (e.g. "%s" in
/// an artist name) are never re-expanded — only the original template is scanned.
pub fn render_template(
    template: &str,
    artist: &str,
    title: &str,
    station: &str,
    track_number: u32,
) -> String {
    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H-%M-%S").to_string();

    // Sanitize metadata values so they don't inject path separators.
    // For example, a station name that is a URL (http://host/path) would
    // otherwise create a deep directory structure.
    let artist = sanitize_component(artist);
    let title = sanitize_component(title);
    let station = sanitize_component(station);
    let track_str = format!("{:03}", track_number);

    // Single-pass expansion to prevent template injection: values containing
    // placeholder sequences (e.g. artist = "Beat%s") cannot inject further
    // expansions because we only scan the TEMPLATE string, never the output.
    // Longest patterns (%time) must precede shorter ones (%t) in the slice.
    let placeholders: &[(&str, &str)] = &[
        ("%time", time.as_str()),
        ("%a",    artist.as_str()),
        ("%t",    title.as_str()),
        ("%s",    station.as_str()),
        ("%n",    track_str.as_str()),
        ("%d",    date.as_str()),
    ];

    let mut out = String::with_capacity(template.len() + 64);
    let mut rest = template;
    while !rest.is_empty() {
        match rest.find('%') {
            None => {
                out.push_str(rest);
                break;
            }
            Some(pos) => {
                out.push_str(&rest[..pos]);
                rest = &rest[pos..];
                match placeholders.iter().find(|(pat, _)| rest.starts_with(pat)) {
                    Some((pat, val)) => {
                        out.push_str(val);
                        rest = &rest[pat.len()..];
                    }
                    None => {
                        out.push('%');
                        rest = &rest[1..];
                    }
                }
            }
        }
    }
    out
}

/// Windows reserved device names. A path component whose stem (the text before
/// the first `.`) equals one of these is rejected by the OS, with or without an
/// extension. Matching is case-insensitive — `NUL`, `nul`, and `CON.mp3` are all
/// reserved. Only an exact stem match counts: `NUL - Something.mp3` (stem
/// `NUL - Something`) and `COM10` are fine.
const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Replace Windows-forbidden characters in a filename component (not a path).
/// Forbidden: \ / : * ? " < > |
/// Replaces each with _
/// Also trims trailing dots and spaces from the result (Windows rejects them).
/// Finally, if the stem (text before the first `.`) is a reserved Windows device
/// name (see [`WINDOWS_RESERVED`]), prefixes the component with `_` so the OS
/// accepts it. This mirrors the Win32 rule: the extension is ignored and trailing
/// spaces on the stem don't matter, so `CON`, `con.mp3`, and `COM1 .aac` are all
/// guarded, while `NUL - Something.mp3` is left untouched.
pub fn sanitize_component(name: &str) -> String {
    let forbidden = |c: char| matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|');
    let sanitized: String = name.chars()
        .map(|c| if forbidden(c) { '_' } else { c })
        .collect();
    let sanitized = sanitized.trim_end_matches(|c| c == '.' || c == ' ').to_string();

    let stem = sanitized.split('.').next().unwrap_or("").trim_end_matches(' ');
    if WINDOWS_RESERVED.iter().any(|r| r.eq_ignore_ascii_case(stem)) {
        format!("_{}", sanitized)
    } else {
        sanitized
    }
}

/// Sanitize a full path that may contain path separators.
/// Each component is sanitized individually to preserve the directory structure.
/// Backslash (\) is treated as a path separator in templates (Windows style).
///
/// Scaffold: will replace inline logic in `build_track_path()` after template refactor.
#[allow(dead_code)]
pub fn sanitize_path(rendered: &str) -> String {
    // Templates use \ as path separator (e.g., "%s\%a - %t")
    // Replace / and \ with the system separator, then sanitize each component
    rendered
        .split(['\\', '/'])
        .map(sanitize_component)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(std::path::MAIN_SEPARATOR_STR)
}

/// Title Case: capitalize first letter of each word.
/// "artist - title" → "Artist - Title"
/// Splits on spaces and capitalizes each word's first alphabetic character.
pub fn auto_correct_case(s: &str) -> String {
    s.split(' ')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => {
                    let upper: String = first.to_uppercase().collect();
                    upper + chars.as_str()
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// If the file already exists, append _2, _3, etc. before the extension.
/// For example: "Artist - Title.mp3" → "Artist - Title_2.mp3"
/// Extension-free paths are preserved as-is (no extension is added).
pub fn resolve_collision(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("track");
    let ext_opt = path.extension().and_then(|e| e.to_str());
    let parent = path.parent().unwrap_or(Path::new("."));

    let mut counter = 2u32;
    loop {
        let candidate = match ext_opt {
            Some(ext) => parent.join(format!("{}_{}.{}", stem, counter, ext)),
            None => parent.join(format!("{}_{}", stem, counter)),
        };
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
        if counter > 9999 {
            let overflow = match ext_opt {
                Some(ext) => parent.join(format!("{}_overflow.{}", stem, ext)),
                None => parent.join(format!("{}_overflow", stem)),
            };
            return overflow;
        }
    }
}

/// Full pipeline: render template → sanitize path → case correct → resolve collision.
///
/// `output_dir` — base output directory (absolute path)
/// `template` — filename template (e.g., "%s\%a - %t")
/// `artist`, `title`, `station` — metadata values
/// `track_number` — for %n placeholder
/// `auto_correct` — whether to apply Title Case correction
/// `extension` — file extension without dot (e.g., "mp3")
pub fn build_track_path(
    output_dir: &Path,
    template: &str,
    artist: &str,
    title: &str,
    station: &str,
    track_number: u32,
    auto_correct: bool,
    extension: &str,
) -> PathBuf {
    let rendered = render_template(template, artist, title, station, track_number);

    // Sanitize and (optionally) case-correct per path component
    let final_name: String = rendered
        .split(['\\', '/'])
        .map(|component| {
            let sanitized = sanitize_component(component);
            if auto_correct { auto_correct_case(&sanitized) } else { sanitized }
        })
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(std::path::MAIN_SEPARATOR_STR);

    let path = output_dir.join(format!("{}.{}", final_name, extension));
    resolve_collision(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_template_basic() {
        let result = render_template("%a - %t", "Tycho", "Past is Prologue", "SomaFM", 1);
        assert_eq!(result, "Tycho - Past is Prologue");
    }

    #[test]
    fn test_render_template_station_path() {
        let result = render_template("%s\\%a - %t", "Tycho", "Track", "SomaFM", 1);
        assert_eq!(result, "SomaFM\\Tycho - Track");
    }

    #[test]
    fn test_render_template_track_number() {
        let result = render_template("%n - %t", "Tycho", "Track", "SomaFM", 5);
        assert_eq!(result, "005 - Track");
    }

    #[test]
    fn test_sanitize_component_forbidden_chars() {
        assert_eq!(sanitize_component("name/with:forbidden"), "name_with_forbidden");
        assert_eq!(sanitize_component("test<>|*?\""), "test______");
    }

    #[test]
    fn test_sanitize_component_trailing_dots() {
        assert_eq!(sanitize_component("name..."), "name");
        assert_eq!(sanitize_component("name   "), "name");
        assert_eq!(sanitize_component("name. "), "name");
    }

    #[test]
    fn test_sanitize_component_reserved_names() {
        assert_eq!(sanitize_component("NUL"), "_NUL");
        assert_eq!(sanitize_component("CON.mp3"), "_CON.mp3");
        assert_eq!(sanitize_component("nul"), "_nul"); // case-insensitive
        assert_eq!(sanitize_component("Normal Name"), "Normal Name"); // unchanged
    }

    #[test]
    fn test_sanitize_component_all_reserved_names() {
        // Every reserved name must be guarded: bare, with extension, and lowercase.
        for name in WINDOWS_RESERVED {
            assert_eq!(sanitize_component(name), format!("_{}", name), "bare {name}");
            let with_ext = format!("{name}.mp3");
            assert_eq!(sanitize_component(&with_ext), format!("_{with_ext}"), "{name}.mp3");
            let lower = name.to_lowercase();
            assert_eq!(sanitize_component(&lower), format!("_{lower}"), "lowercase {name}");
        }
    }

    #[test]
    fn test_sanitize_component_reserved_only_exact_stem() {
        // Only an exact stem match is reserved — substrings/longer names are valid files.
        assert_eq!(sanitize_component("NUL - Something.mp3"), "NUL - Something.mp3");
        assert_eq!(sanitize_component("CONcert"), "CONcert");
        assert_eq!(sanitize_component("COM10"), "COM10");
        assert_eq!(sanitize_component("LPT0"), "LPT0");
    }

    #[test]
    fn test_sanitize_component_reserved_with_trailing_space_stem() {
        // Win32 ignores trailing spaces on the stem, so "COM1 .aac" is still a device.
        assert_eq!(sanitize_component("COM1 .aac"), "_COM1 .aac");
    }

    #[test]
    fn test_sanitize_path_splits_components() {
        let result = sanitize_path("Station\\Artist - Title");
        let expected = format!("Station{}Artist - Title", std::path::MAIN_SEPARATOR);
        assert_eq!(result, expected);
    }

    #[test]
    fn test_auto_correct_case() {
        assert_eq!(auto_correct_case("unknown artist - untitled"), "Unknown Artist - Untitled");
        assert_eq!(auto_correct_case("tycho"), "Tycho");
        assert_eq!(auto_correct_case(""), "");
    }

    #[test]
    fn test_auto_correct_case_already_correct() {
        assert_eq!(auto_correct_case("Tycho - Past Is Prologue"), "Tycho - Past Is Prologue");
    }

    #[test]
    fn test_time_before_title_replacement() {
        // %time must not be partially replaced by %t
        // If %t is replaced first, %time → %time → %[result of t replacement]ime
        // Our implementation replaces %time first, so this is fine
        let result = render_template("%time - %t", "A", "Song", "S", 1);
        // %time should be fully replaced — no literal "time" remaining
        assert!(!result.contains("time"), "%time placeholder must be fully replaced, got: {}", result);
        // title should appear after the separator
        assert!(result.ends_with("- Song"), "title must appear after time in: {}", result);
    }

    #[test]
    fn test_render_template_url_station_sanitized() {
        // URL as station name should be sanitized — slashes replaced with underscores
        let result = render_template("%s\\%a - %t", "Artist", "Song", "http://stream.example.com/path", 1);
        // The station component should have no path separators from the URL
        assert!(!result.contains("http://"), "URL slashes must be sanitized in: {}", result);
        assert!(result.contains("http___stream.example.com_path"), "URL should be flat in: {}", result);
    }

    #[test]
    fn test_render_template_no_injection() {
        // Artist name containing a placeholder sequence must not be re-expanded.
        // "Beat%s" should appear literally in the output, not be replaced with the station name.
        let result = render_template("%a - %t", "Beat%s", "Song", "RadioFM", 1);
        assert_eq!(result, "Beat%s - Song", "placeholder in artist must not be re-expanded, got: {}", result);

        // Artist containing %d should not be replaced with the date
        let result2 = render_template("%a - %t", "Top%d", "Track", "S", 1);
        assert!(result2.starts_with("Top%d"), "placeholder in artist must not be re-expanded, got: {}", result2);

        // Title containing %a should not expand to the artist name
        let result3 = render_template("%a - %t", "X", "%a Remix", "S", 1);
        assert_eq!(result3, "X - %a Remix", "placeholder in title must not be re-expanded, got: {}", result3);
    }
}
