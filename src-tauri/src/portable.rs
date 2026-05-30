use std::path::{Path, PathBuf};
use log::info;

/// Returns the directory containing the EXE.
/// In dev mode, falls back to the current directory.
pub fn base_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().expect("Cannot determine current directory"))
}

/// Returns the data directory: `base_dir()/data/`
pub fn data_dir() -> PathBuf {
    base_dir().join("data")
}

pub fn settings_path() -> PathBuf {
    data_dir().join("settings.json")
}

pub fn profiles_dir() -> PathBuf {
    data_dir().join("profiles")
}

pub fn recordings_dir() -> PathBuf {
    data_dir().join("recordings")
}

pub fn logs_dir() -> PathBuf {
    data_dir().join("logs")
}

/// Resolve a possibly-relative path to an absolute path.
/// Relative paths are joined onto `data_dir()`.
pub fn resolve_output_dir(rel: &str) -> PathBuf {
    let p = PathBuf::from(rel);
    if p.is_absolute() {
        p
    } else {
        data_dir().join(p)
    }
}

/// Walk up from `path` until an existing directory is found.
/// Returns `None` if no ancestor exists (should not happen on a mounted volume).
pub fn nearest_existing_dir(path: &Path) -> Option<PathBuf> {
    let mut p = path.to_path_buf();
    loop {
        if p.exists() {
            return Some(p);
        }
        if !p.pop() {
            return None;
        }
    }
}

/// Creates all required data directories if they don't exist.
pub fn ensure_data_dirs() -> Result<(), std::io::Error> {
    let dirs = [data_dir(), profiles_dir(), recordings_dir(), logs_dir()];
    for dir in &dirs {
        if !dir.exists() {
            std::fs::create_dir_all(dir)?;
            info!("Created directory: {}", dir.display());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_output_dir_absolute_is_unchanged() {
        let abs = if cfg!(windows) { "C:\\music" } else { "/music" };
        assert_eq!(resolve_output_dir(abs), PathBuf::from(abs));
    }

    #[test]
    fn resolve_output_dir_relative_joins_data_dir() {
        assert_eq!(resolve_output_dir("recordings"), data_dir().join("recordings"));
    }

    #[test]
    fn nearest_existing_dir_returns_self_when_present() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(
            nearest_existing_dir(tmp.path()),
            Some(tmp.path().to_path_buf())
        );
    }

    #[test]
    fn nearest_existing_dir_climbs_to_existing_ancestor() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("a").join("b").join("c");
        assert_eq!(
            nearest_existing_dir(&missing),
            Some(tmp.path().to_path_buf())
        );
    }
}
