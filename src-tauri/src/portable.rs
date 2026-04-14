use std::path::PathBuf;
use tracing::info;

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
