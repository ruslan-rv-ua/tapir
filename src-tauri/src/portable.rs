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

/// Phase 3K: сесійний стан crash recovery (clean_shutdown + живий снапшот).
pub fn state_path() -> PathBuf {
    data_dir().join("state.json")
}

/// Пам'ять «про зайнятість яких комбінацій уже сказано» (hotkey_busy). Окремий
/// файл: у settings.json це виглядало б як налаштування, якого немає, у state.json
/// стало б зобов'язанням для писаря crash-recovery.
pub fn hotkeys_reported_path() -> PathBuf {
    data_dir().join("hotkeys-reported.json")
}

/// Геометрія головного вікна (розмір, позиція, розгорнутість). Окремий файл із
/// тих самих міркувань, що й `hotkeys-reported.json`: у settings.json це
/// виглядало б як налаштування, якого немає на екрані, у state.json стало б
/// зобов'язанням для писаря crash-recovery.
pub fn window_state_path() -> PathBuf {
    data_dir().join("window.json")
}

pub fn profiles_dir() -> PathBuf {
    data_dir().join("profiles")
}

pub fn recordings_dir() -> PathBuf {
    base_dir().join("recordings")
}

pub fn logs_dir() -> PathBuf {
    data_dir().join("logs")
}

/// Scratch files handed to other applications — currently the one-entry `.m3u8`
/// a stream is opened with. Lives under `data/`, never in `%TEMP%`: Tapir runs
/// off a flash drive on someone else's machine and leaves nothing behind.
pub fn tmp_dir() -> PathBuf {
    data_dir().join("tmp")
}

/// Delete everything inside `dir`, keeping `dir` itself. A missing directory and
/// an entry that refuses to go are both fine: a leftover playlist may still be
/// held open by a player left running from the previous session, and no scratch
/// file is worth failing startup over.
fn clear_dir_contents(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let _ = if path.is_dir() {
            std::fs::remove_dir_all(&path)
        } else {
            std::fs::remove_file(&path)
        };
    }
}

/// Resolve a possibly-relative path to an absolute path.
/// Relative paths are joined onto `base_dir()` (поряд з EXE).
pub fn resolve_output_dir(rel: &str) -> PathBuf {
    let p = PathBuf::from(rel);
    if p.is_absolute() {
        p
    } else {
        base_dir().join(p)
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
    let dirs = [data_dir(), profiles_dir(), recordings_dir(), logs_dir(), tmp_dir()];
    for dir in &dirs {
        if !dir.exists() {
            std::fs::create_dir_all(dir)?;
            info!("Created directory: {}", dir.display());
        }
    }
    // Scratch files are never deleted at the point of use (that would race a
    // cold-starting player still reading them), so startup is where they go.
    clear_dir_contents(&tmp_dir());
    Ok(())
}

/// Free bytes available to the caller on the volume hosting `dir`.
/// Climbs to the nearest existing ancestor so a not-yet-created output dir
/// still reports its volume.
pub(crate) fn free_bytes_on_volume(dir: &Path) -> Result<u64, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::core::PCWSTR;

    let base = nearest_existing_dir(dir)
        .ok_or_else(|| "no existing ancestor directory".to_string())?;
    let wide: Vec<u16> = base
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut free_to_caller: u64 = 0;
    unsafe {
        GetDiskFreeSpaceExW(
            PCWSTR(wide.as_ptr()),
            Some(&mut free_to_caller as *mut u64),
            None,
            None,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(free_to_caller)
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
    fn resolve_output_dir_relative_joins_base_dir() {
        assert_eq!(resolve_output_dir("recordings"), base_dir().join("recordings"));
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

    #[test]
    fn clear_dir_contents_empties_the_dir_but_keeps_it() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("Radio.m3u8"), "#EXTM3U\n").unwrap();
        std::fs::create_dir(tmp.path().join("sub")).unwrap();
        std::fs::write(tmp.path().join("sub").join("nested"), "x").unwrap();

        clear_dir_contents(tmp.path());

        assert!(tmp.path().is_dir(), "the directory itself must survive");
        assert_eq!(std::fs::read_dir(tmp.path()).unwrap().count(), 0);
    }

    #[test]
    fn clear_dir_contents_tolerates_a_missing_dir() {
        let tmp = tempfile::tempdir().unwrap();
        clear_dir_contents(&tmp.path().join("never-created"));
    }

    #[test]
    fn free_bytes_on_volume_returns_nonzero() {
        let bytes = free_bytes_on_volume(&std::env::temp_dir()).expect("should succeed");
        assert!(bytes > 0);
    }
}
