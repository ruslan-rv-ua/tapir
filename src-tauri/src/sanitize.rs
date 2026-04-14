use chrono::Local;
use std::path::{Path, PathBuf};

/// Render filename template with metadata placeholders.
/// %a = artist, %t = title, %s = station, %n = track number (zero-padded to 3 digits),
/// %d = date (YYYY-MM-DD), %time = time (HH-MM-SS)
///
/// Template example: "%s\%a - %t" → "SomaFM Groove Salad\Tycho - Past is Prologue"
/// Note: %time must be checked before %t to avoid partial replacement.
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

    // Order matters: %time before %t, %n before nothing
    template
        .replace("%time", &time)
        .replace("%a", artist)
        .replace("%t", title)
        .replace("%s", station)
        .replace("%n", &format!("{:03}", track_number))
        .replace("%d", &date)
}

/// Replace Windows-forbidden characters in a filename component (not a path).
/// Forbidden: \ / : * ? " < > |
/// Replaces each with _
/// Also trims trailing dots and spaces from the result (Windows rejects them).
pub fn sanitize_component(name: &str) -> String {
    let forbidden = |c: char| matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|');
    let sanitized: String = name.chars()
        .map(|c| if forbidden(c) { '_' } else { c })
        .collect();
    sanitized.trim_end_matches(|c| c == '.' || c == ' ').to_string()
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
}
