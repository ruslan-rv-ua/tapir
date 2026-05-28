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
        assert!(new_path.file_name().unwrap().to_string_lossy().contains("target"));
    }

    #[test]
    fn rename_rejects_empty_input() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("file.mp3");
        fs::write(&src, b"x").unwrap();
        assert!(rename_file(&src, "").is_err());
        assert!(rename_file(&src, "   ").is_err());
    }
}
