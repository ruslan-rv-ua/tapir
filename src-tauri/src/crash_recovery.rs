//! Phase 3K Crash Recovery: сесійний стан `data/state.json` — прапор
//! `clean_shutdown` + живий снапшот активних ручних записів. Єдине джерело
//! правди для resume після аварії (spec: docs/backlog/p1-crash-recovery.md).

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveRecording {
    pub stream_id: String,
    /// Діагностика (логи / читабельність state.json). У матчингу на resume
    /// участі НЕ бере — ключ лише `stream_id` (спека, «Прийняті рішення»).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub clean_shutdown: bool,
    #[serde(default)]
    pub active_recordings: Vec<ActiveRecording>,
}

impl Default for SessionState {
    /// Відсутній/битий файл = аварія з порожнім снапшотом: resume — no-op,
    /// анонс мовчить (спека, «Механіка виявлення збою»).
    fn default() -> Self {
        Self { clean_shutdown: false, active_recordings: vec![] }
    }
}

impl SessionState {
    pub fn load() -> Self {
        Self::load_from(&crate::portable::state_path())
    }

    pub fn load_from(path: &Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
                log::warn!("state.json: cannot parse ({e}) — treating as crash with empty snapshot");
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self) -> Result<(), std::io::Error> {
        self.save_to(&crate::portable::state_path())
    }

    /// Атомарний запис (temp → rename) — той самий підхід, що `Profile::save`.
    pub fn save_to(&self, path: &Path) -> Result<(), std::io::Error> {
        let tmp = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(&tmp, &json)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::*;

    fn sample() -> SessionState {
        SessionState {
            clean_shutdown: false,
            active_recordings: vec![
                ActiveRecording { stream_id: "st-abc".into(), url: Some("https://radio.example/a".into()) },
                ActiveRecording { stream_id: "st-def".into(), url: None },
            ],
        }
    }

    #[test]
    fn roundtrip_save_load() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("state.json");
        let state = sample();
        state.save_to(&path).unwrap();
        assert_eq!(SessionState::load_from(&path), state);
    }

    #[test]
    fn missing_file_is_crash_with_empty_snapshot() {
        // Спека («Механіка виявлення»): відсутній файл = аварія, але снапшот
        // порожній → resume нічого не робить, анонс мовчить.
        let tmp = tempfile::tempdir().unwrap();
        let loaded = SessionState::load_from(&tmp.path().join("nope.json"));
        assert!(!loaded.clean_shutdown);
        assert!(loaded.active_recordings.is_empty());
    }

    #[test]
    fn corrupt_file_is_crash_with_empty_snapshot() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("state.json");
        std::fs::write(&path, "{not json").unwrap();
        assert_eq!(SessionState::load_from(&path), SessionState::default());
    }

    #[test]
    fn save_is_atomic_no_tmp_left_behind() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("state.json");
        sample().save_to(&path).unwrap();
        assert!(path.exists());
        assert!(!path.with_extension("json.tmp").exists());
    }
}
