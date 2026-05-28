//! File operations: rename (collision-safe) and delete to Recycle Bin.

use std::path::{Path, PathBuf};

use crate::errors::RadioError;
use crate::sanitize;

/// Rename `old` so its file stem becomes `new_basename` (extension preserved).
/// Resolves filename collisions via existing `sanitize::resolve_collision`
/// (suffix `_2`, `_3`, ...). Returns the final path.
///
/// `new_basename` is treated as a single path component — slashes / colons /
/// other path separators are stripped via `sanitize_component`.
pub fn rename_file(old: &Path, new_basename: &str) -> Result<PathBuf, RadioError> {
    if !old.is_file() {
        return Err(RadioError::Format(
            "rename: source is not a file".into(),
        ));
    }
    let parent = old
        .parent()
        .ok_or_else(|| RadioError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "rename: missing parent dir",
        )))?;
    let ext = old
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let cleaned = sanitize::sanitize_component(new_basename.trim());
    if cleaned.is_empty() {
        return Err(RadioError::Format("Empty filename".into()));
    }
    let candidate = if ext.is_empty() {
        parent.join(&cleaned)
    } else {
        parent.join(format!("{cleaned}.{ext}"))
    };
    // No-op if the user "renamed" to the same name. Without this, the source
    // is its own collision and resolve_collision would suffix with _2.
    if candidate == old {
        return Ok(old.to_path_buf());
    }
    let final_path = sanitize::resolve_collision(&candidate);
    std::fs::rename(old, &final_path)?;
    Ok(final_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn rename_changes_basename_keeps_extension() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("old name.mp3");
        fs::write(&src, b"data").unwrap();

        let new_path = rename_file(&src, "fresh name").unwrap();
        assert!(new_path.exists());
        assert_eq!(new_path.file_name().unwrap(), "fresh name.mp3");
        assert!(!src.exists());
    }

    #[test]
    fn rename_resolves_collision_with_suffix() {
        let dir = tempdir().unwrap();
        let existing = dir.path().join("target.mp3");
        fs::write(&existing, b"target").unwrap();
        let src = dir.path().join("source.mp3");
        fs::write(&src, b"source").unwrap();

        let new_path = rename_file(&src, "target").unwrap();
        // Suffix added — exact suffix depends on sanitize::resolve_collision.
        assert!(new_path.exists());
        assert_ne!(new_path, existing);
        let name = new_path.file_name().unwrap().to_string_lossy().to_string();
        assert!(name.contains("_2") || name.contains("_3"), "expected collision suffix, got {name}");
    }

    #[test]
    fn rename_rejects_empty_input() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("file.mp3");
        fs::write(&src, b"x").unwrap();
        assert!(rename_file(&src, "").is_err());
        assert!(rename_file(&src, "   ").is_err());
    }

    #[test]
    fn rename_to_same_name_is_noop() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("track.mp3");
        fs::write(&src, b"data").unwrap();

        let result = rename_file(&src, "track").unwrap();
        assert_eq!(result, src);
        assert!(src.exists());
    }

    #[test]
    fn rename_rejects_directory() {
        let dir = tempdir().unwrap();
        let subdir = dir.path().join("a_subdir");
        fs::create_dir(&subdir).unwrap();
        let err = rename_file(&subdir, "renamed").unwrap_err();
        assert!(matches!(err, RadioError::Format(_)));
    }
}
