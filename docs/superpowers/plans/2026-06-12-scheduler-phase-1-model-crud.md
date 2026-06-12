# Scheduler Фаза 1 — модель даних і CRUD: план імплементації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реалізувати §2 спеки Phase 3D повністю (нова модель `ScheduledRecording` + `ScheduleResult`, валідація add/update/load, padding у `RecordingSettings`) та IPC-команди §4 без таймера (`nextRun` завжди `null`, подій ще немає).

**Architecture:** Типи живуть у `src-tauri/src/profile.rs` (існуючий scaffold переробляється; breaking change дозволений — міграцій у проєкті немає, scaffold ніким не використовується). Чиста валідація — новий модуль `scheduler::validation` (у Фазі 2 поряд з'явиться `scheduler::timer`). IPC — новий `commands/schedule_commands.rs` за патерном `wishlist_commands`: write-lock на `active_profile` → мутація через чисту impl-функцію (тестовану без `tauri::State`) → `snapshot.save()` через `spawn_blocking`.

**Tech Stack:** Rust (Tauri v2, serde, chrono 0.4, nanoid, `RadioError`/thiserror), TypeScript (`src/lib/tauri.ts`), тести — `cargo test` + vitest.

**Спека:** [2026-06-12-scheduler-design.md](../specs/2026-06-12-scheduler-design.md) (§2, §4, §9 «Фаза 1»). Контракти (модель даних, IPC) фіксовані — якщо під час імплементації потрібна зміна, спершу вноситься у спеку.

**Гілка:** нова `feature/phase-3d-scheduler` від `develop`.

**Gates (усі мають бути зелені перед мерджем):**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
pnpm vite:build
```

Увага: `tsc` (npx tsc --noEmit) має ~51 старих помилок через нетипізований paraglide — він НЕ є gate. Реальні gates — лише три команди вище.

---

## Структура файлів

| Файл | Дія | Відповідальність |
|------|-----|------------------|
| `src-tauri/src/profile.rs` | modify | Типи §2: `ScheduledRecording` (поле `days`, `last_result`), `ScheduleResult` + enum-и; padding-поля та `clamp_schedule_padding()` у `RecordingSettings`; виклик sanitize у `Profile::load` |
| `src-tauri/src/scheduler/mod.rs` | create | Оголошення модуля (Фаза 2 додасть `timer`) |
| `src-tauri/src/scheduler/validation.rs` | create | Чиста валідація: структурна, для save, для enable, `sanitize_on_load` |
| `src-tauri/src/commands/schedule_commands.rs` | create | `ScheduleDto`, `ScheduledRecordingInput`, impl-функції CRUD + 5 `#[tauri::command]` |
| `src-tauri/src/commands/mod.rs` | modify | `pub mod schedule_commands;` |
| `src-tauri/src/lib.rs` | modify | `mod scheduler;` + 5 команд у `generate_handler!` |
| `src-tauri/src/commands/settings_commands.rs` | modify | Клемп padding у `save_recording_settings` |
| `src/lib/tauri.ts` | modify | TS-типи schedule + 2 поля `RecordingSettings` + 5 invoke-обгорток |
| `docs/data-models.md` | modify | §3.3 (нова модель), §3.4 (padding), приклад профілю |
| `docs/superpowers/specs/2026-06-12-scheduler-design.md` | modify | §9: лінк на цей план |

---

### Task 1: Типи моделі (`profile.rs`)

Поточний scaffold (`profile.rs:54-78`) має `day_of_week: Option<u8>` і не має `last_result` — замінюється на модель §2. `ScheduledRecording` ніде, крім `profile.rs`, не використовується (перевірено grep-ом), тож заміна нічого не ламає.

**Files:**
- Modify: `src-tauri/src/profile.rs` (блок `--- ScheduleType + ScheduledRecording ---`, рядки 54–78; тести — у існуючий `mod tests` внизу файлу)

- [ ] **Step 1: Написати failing-тести**

Додати в кінець `mod tests` у `profile.rs`:

```rust
    // --- Scheduler model (Phase 3D, Фаза 1) ---

    fn sample_recurring_schedule() -> ScheduledRecording {
        ScheduledRecording {
            id: "sch1".into(),
            stream_id: "st1".into(),
            name: "Evening Jazz".into(),
            schedule_type: ScheduleType::Recurring,
            days: vec![0, 1, 2, 3, 4],
            date: None,
            time: "20:00".into(),
            duration_minutes: 120,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        }
    }

    #[test]
    fn scheduled_recording_serializes_camel_case() {
        let json = serde_json::to_string(&sample_recurring_schedule()).unwrap();
        assert!(json.contains("\"streamId\":\"st1\""), "got: {json}");
        assert!(json.contains("\"type\":\"recurring\""), "got: {json}");
        assert!(json.contains("\"days\":[0,1,2,3,4]"), "got: {json}");
        assert!(json.contains("\"durationMinutes\":120"), "got: {json}");
        assert!(json.contains("\"lastResult\":null"), "got: {json}");
    }

    #[test]
    fn scheduled_recording_deserializes_with_defaults() {
        // Мінімальний oneshot без days і lastResult — serde(default) заповнює їх
        let json = r#"{"id":"x","streamId":"s1","name":"N","type":"oneshot",
            "date":"2026-06-14","time":"08:30","durationMinutes":60,
            "enabled":true,"createdAt":"2026-06-12T10:00:00+03:00"}"#;
        let s: ScheduledRecording = serde_json::from_str(json).unwrap();
        assert_eq!(s.schedule_type, ScheduleType::Oneshot);
        assert!(s.days.is_empty());
        assert_eq!(s.date.as_deref(), Some("2026-06-14"));
        assert!(s.last_result.is_none());
    }

    #[test]
    fn schedule_result_serializes_status_and_reason_camel_case() {
        let r = ScheduleResult {
            occurrence: "2026-06-12T20:00".into(),
            status: ScheduleResultStatus::StartedLate,
            reason: Some(ScheduleResultReason::AppNotRunning),
            recorded_minutes: 80,
            finished_at: "2026-06-12T22:05:00+03:00".into(),
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"status\":\"startedLate\""), "got: {json}");
        assert!(json.contains("\"reason\":\"appNotRunning\""), "got: {json}");
        assert!(json.contains("\"recordedMinutes\":80"), "got: {json}");
        assert!(json.contains("\"finishedAt\""), "got: {json}");
    }

    #[test]
    fn schedule_result_roundtrip() {
        let r = ScheduleResult {
            occurrence: "2026-06-12T20:00".into(),
            status: ScheduleResultStatus::StoppedByUser,
            reason: Some(ScheduleResultReason::ProfileSwitch),
            recorded_minutes: 45,
            finished_at: "2026-06-12T21:00:00+03:00".into(),
        };
        let back: ScheduleResult =
            serde_json::from_str(&serde_json::to_string(&r).unwrap()).unwrap();
        assert_eq!(back.status, ScheduleResultStatus::StoppedByUser);
        assert_eq!(back.reason, Some(ScheduleResultReason::ProfileSwitch));
        assert_eq!(back.recorded_minutes, 45);
        assert_eq!(back.occurrence, "2026-06-12T20:00");
    }
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml profile::tests`
Expected: помилка компіляції — `no field 'days'`, `cannot find type 'ScheduleResult'` тощо.

- [ ] **Step 3: Замінити типи**

У `profile.rs` замінити весь блок `// --- ScheduleType + ScheduledRecording ---` (рядки 54–78) на:

```rust
// --- ScheduleType + ScheduledRecording (Phase 3D, спека §2) ---
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleType {
    Oneshot,
    Recurring,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledRecording {
    pub id: String,
    pub stream_id: String,            // посилання на StreamInfo.id активного профілю
    pub name: String,                 // мітка користувача, напр. "Evening Jazz"
    #[serde(rename = "type")]
    pub schedule_type: ScheduleType,
    #[serde(default)]
    pub days: Vec<u8>,                // recurring: 0=Пн..6=Нд, непорожній; oneshot: порожній
    #[serde(default)]
    pub date: Option<String>,         // oneshot: ISO-дата "2026-06-14"; recurring: None
    pub time: String,                 // початок "HH:MM", 24h, локальний час
    pub duration_minutes: u32,        // 1..=1439
    pub enabled: bool,
    pub created_at: String,
    #[serde(default)]
    pub last_result: Option<ScheduleResult>, // пише лише backend
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleResult {
    pub occurrence: String,           // "2026-06-12T20:00" — номінальний локальний
                                      // час початку входження (без padding)
    pub status: ScheduleResultStatus,
    #[serde(default)]
    pub reason: Option<ScheduleResultReason>, // лише для Missed / StoppedByUser
    pub recorded_minutes: u32,        // wall-clock від фактичного старту до зупинки;
                                      // 0 — не стартував
    pub finished_at: String,          // ISO datetime, коли статус зафіксовано
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleResultStatus {
    Completed,                // записано все вікно
    StartedLate,              // catch-up: стартували посеред вікна, дописали решту
    Missed,                   // вікно минуло без старту
    StoppedByUser,            // користувач зупинив плановий запис вручну
    SkippedAlreadyRecording,  // на старті вікна потік уже записувався
}

/// Код причини для Missed і StoppedByUser. Локалізує frontend (Paraglide);
/// backend ніколи не віддає готові рядки.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleResultReason {
    // Missed:
    AppNotRunning,   // вікно минуло без жодної спроби старту в цій сесії
    StartFailed,     // спроби старту були, всі невдалі
    ClockChange,     // неіснуючий локальний час (DST-стрибок уперед)
    // StoppedByUser:
    ManualStop,      // зупинка з UI або глобального хоткея
    ProfileSwitch,   // переключення профілю
    AppClosing,      // закриття додатка
    ScheduleEdited,  // редагування/вимкнення розкладу під час запису
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml profile::tests`
Expected: усі тести PASS (нові 4 + старі).

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/profile.rs
git commit -m "feat(scheduler): rework ScheduledRecording model, add ScheduleResult"
```

---

### Task 2: Padding у `RecordingSettings` + клемп на збереженні

Спека §2: два поля `schedule_pad_before_min` (0–30) / `schedule_pad_after_min` (0–60), default 0. Межі клампляться на backend при збереженні налаштувань, а не лише в UI.

**Files:**
- Modify: `src-tauri/src/profile.rs` (struct `RecordingSettings`, її `Default`, тести)
- Modify: `src-tauri/src/commands/settings_commands.rs` (`save_recording_settings`)

- [ ] **Step 1: Написати failing-тести**

Додати в `mod tests` у `profile.rs`:

```rust
    #[test]
    fn recording_settings_padding_defaults_to_zero() {
        let r = RecordingSettings::default();
        assert_eq!(r.schedule_pad_before_min, 0);
        assert_eq!(r.schedule_pad_after_min, 0);
    }

    #[test]
    fn recording_settings_deserializes_without_padding_fields() {
        // Профіль, збережений до Фази 1, не має нових полів
        let json = r#"{"outputDir":"recordings"}"#;
        let r: RecordingSettings = serde_json::from_str(json).unwrap();
        assert_eq!(r.schedule_pad_before_min, 0);
        assert_eq!(r.schedule_pad_after_min, 0);
    }

    #[test]
    fn clamp_schedule_padding_clamps_to_limits() {
        let mut r = RecordingSettings::default();
        r.schedule_pad_before_min = 31;
        r.schedule_pad_after_min = 61;
        r.clamp_schedule_padding();
        assert_eq!(r.schedule_pad_before_min, 30);
        assert_eq!(r.schedule_pad_after_min, 60);
    }

    #[test]
    fn clamp_schedule_padding_keeps_valid_values() {
        let mut r = RecordingSettings::default();
        r.schedule_pad_before_min = 30;
        r.schedule_pad_after_min = 60;
        r.clamp_schedule_padding();
        assert_eq!(r.schedule_pad_before_min, 30);
        assert_eq!(r.schedule_pad_after_min, 60);
    }
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml profile::tests`
Expected: помилка компіляції — `no field 'schedule_pad_before_min'`.

- [ ] **Step 3: Реалізувати**

У struct `RecordingSettings` після поля `auto_correct_case` (перед `reconnect`) додати:

```rust
    #[serde(default)]
    pub schedule_pad_before_min: u32,   // 0–30, клампиться у clamp_schedule_padding
    #[serde(default)]
    pub schedule_pad_after_min: u32,    // 0–60
```

В `impl Default for RecordingSettings` додати до ініціалізатора:

```rust
            schedule_pad_before_min: 0,
            schedule_pad_after_min: 0,
```

Після `impl Default for RecordingSettings` додати:

```rust
impl RecordingSettings {
    /// Спека Phase 3D §2: межі padding 0–30 / 0–60 хв клампляться на backend
    /// при збереженні налаштувань, а не лише в UI.
    pub fn clamp_schedule_padding(&mut self) {
        self.schedule_pad_before_min = self.schedule_pad_before_min.min(30);
        self.schedule_pad_after_min = self.schedule_pad_after_min.min(60);
    }
}
```

У `settings_commands.rs` змінити `save_recording_settings` — параметр стає `mut`, перший рядок тіла — клемп:

```rust
#[tauri::command]
pub async fn save_recording_settings(
    mut recording: RecordingSettings,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    recording.clamp_schedule_padding();
    let mut snapshot = state.active_profile.read().await.clone();
    snapshot.recording = recording.clone();
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let mut profile = state.active_profile.write().await;
    profile.recording = recording;
    Ok(())
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml profile::tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/profile.rs src-tauri/src/commands/settings_commands.rs
git commit -m "feat(scheduler): add schedule padding to RecordingSettings with backend clamp"
```

---

### Task 3: Модуль `scheduler::validation`

Чиста валідація без tokio і без `tauri::State` — функції приймають `now: NaiveDateTime` параметром, щоб тести були детермінованими. Три рівні (спека §2):

- **структурний** (`validate_structural`) — формат полів, узгодженість `type` ↔ `days`/`date`; застосовується і на add/update, і на load;
- **для збереження** (`validate_for_save`) — структурний + `stream_id` існує + oneshot не повністю в минулому;
- **для увімкнення** (`validate_for_enable`) — структурний + oneshot не в минулому, але БЕЗ перевірки `stream_id` (осиротілі розклади дозволені — у Фазі 2 вони дадуть Missed).

`sanitize_on_load` — жорстко невалідний розклад не валить завантаження профілю: вимикається з `log::warn`.

**Files:**
- Create: `src-tauri/src/scheduler/mod.rs`
- Create: `src-tauri/src/scheduler/validation.rs`
- Modify: `src-tauri/src/lib.rs` (додати `mod scheduler;` після `mod sanitize;`)

- [ ] **Step 1: Створити скелет модуля і failing-тести**

`src-tauri/src/scheduler/mod.rs`:

```rust
//! Phase 3D Scheduler. Фаза 1: лише валідація моделі.
//! Фаза 2 додасть timer (тік-цикл, обчислення вікон, ledger).
pub mod validation;
```

У `lib.rs` після рядка `mod sanitize;` додати:

```rust
mod scheduler;
```

`src-tauri/src/scheduler/validation.rs` — спочатку лише тести (функції ще не існують):

```rust
//! Чиста валідація розкладів (спека Phase 3D §2).
//! Календарна логіка обчислення вікон з'явиться у Фазі 2 (scheduler::timer).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::{Profile, ScheduleType, ScheduledRecording, StreamInfo};
    use chrono::NaiveDateTime;

    fn recurring(days: &[u8]) -> ScheduledRecording {
        ScheduledRecording {
            id: "sch1".into(),
            stream_id: "st1".into(),
            name: "Test".into(),
            schedule_type: ScheduleType::Recurring,
            days: days.to_vec(),
            date: None,
            time: "20:00".into(),
            duration_minutes: 60,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        }
    }

    fn oneshot(date: &str, time: &str, duration: u32) -> ScheduledRecording {
        ScheduledRecording {
            id: "sch1".into(),
            stream_id: "st1".into(),
            name: "Test".into(),
            schedule_type: ScheduleType::Oneshot,
            days: vec![],
            date: Some(date.into()),
            time: time.into(),
            duration_minutes: duration,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        }
    }

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").unwrap()
    }

    fn one_stream() -> Vec<StreamInfo> {
        vec![StreamInfo {
            id: "st1".into(), url: "http://x".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        }]
    }

    // --- validate_structural ---

    #[test]
    fn recurring_valid_passes() {
        assert!(validate_structural(&recurring(&[0, 1, 2, 3, 4])).is_ok());
        assert!(validate_structural(&recurring(&[6])).is_ok());
    }

    #[test]
    fn recurring_empty_days_fails() {
        assert!(validate_structural(&recurring(&[])).is_err());
    }

    #[test]
    fn recurring_day_out_of_range_fails() {
        assert!(validate_structural(&recurring(&[0, 7])).is_err());
    }

    #[test]
    fn recurring_duplicate_days_fails() {
        assert!(validate_structural(&recurring(&[1, 1])).is_err());
    }

    #[test]
    fn recurring_with_date_fails() {
        let mut s = recurring(&[0]);
        s.date = Some("2026-06-14".into());
        assert!(validate_structural(&s).is_err());
    }

    #[test]
    fn oneshot_valid_passes() {
        assert!(validate_structural(&oneshot("2026-06-14", "20:00", 60)).is_ok());
    }

    #[test]
    fn oneshot_with_days_fails() {
        let mut s = oneshot("2026-06-14", "20:00", 60);
        s.days = vec![0];
        assert!(validate_structural(&s).is_err());
    }

    #[test]
    fn oneshot_without_date_fails() {
        let mut s = oneshot("2026-06-14", "20:00", 60);
        s.date = None;
        assert!(validate_structural(&s).is_err());
    }

    #[test]
    fn oneshot_invalid_date_fails() {
        assert!(validate_structural(&oneshot("2026-13-40", "20:00", 60)).is_err());
        assert!(validate_structural(&oneshot("14.06.2026", "20:00", 60)).is_err());
    }

    #[test]
    fn invalid_time_fails() {
        for bad in ["24:00", "garbage", "20:00:00", ""] {
            let mut s = recurring(&[0]);
            s.time = bad.into();
            assert!(validate_structural(&s).is_err(), "time '{bad}' має бути відхилено");
        }
    }

    #[test]
    fn duration_bounds() {
        let mk = |d| { let mut s = recurring(&[0]); s.duration_minutes = d; s };
        assert!(validate_structural(&mk(0)).is_err());
        assert!(validate_structural(&mk(1440)).is_err());
        assert!(validate_structural(&mk(1)).is_ok());
        assert!(validate_structural(&mk(1439)).is_ok());
    }

    // --- oneshot_window_fully_past ---

    #[test]
    fn window_end_exactly_now_is_past() {
        let s = oneshot("2026-06-12", "20:00", 60);
        assert!(oneshot_window_fully_past(&s, 0, at("2026-06-12T21:00")));
        assert!(!oneshot_window_fully_past(&s, 0, at("2026-06-12T20:59")));
    }

    #[test]
    fn pad_after_extends_window() {
        let s = oneshot("2026-06-12", "20:00", 60);
        // кінець без padding — 21:00; із padAfter 60 — 22:00
        assert!(oneshot_window_fully_past(&s, 0, at("2026-06-12T21:30")));
        assert!(!oneshot_window_fully_past(&s, 60, at("2026-06-12T21:30")));
    }

    #[test]
    fn recurring_is_never_fully_past() {
        assert!(!oneshot_window_fully_past(&recurring(&[0]), 0, at("2099-01-01T00:00")));
    }

    // --- validate_for_save ---

    #[test]
    fn save_accepts_valid_recurring() {
        assert!(validate_for_save(&recurring(&[0]), &one_stream(), 0,
            at("2026-06-12T12:00")).is_ok());
    }

    #[test]
    fn save_rejects_unknown_stream() {
        let err = validate_for_save(&recurring(&[0]), &[], 0, at("2026-06-12T12:00"))
            .unwrap_err();
        assert!(err.to_string().contains("not found"), "got: {err}");
    }

    #[test]
    fn save_rejects_past_oneshot() {
        let s = oneshot("2026-06-10", "20:00", 60);
        assert!(validate_for_save(&s, &one_stream(), 0, at("2026-06-12T12:00")).is_err());
    }

    #[test]
    fn save_accepts_future_oneshot() {
        let s = oneshot("2026-06-14", "20:00", 60);
        assert!(validate_for_save(&s, &one_stream(), 0, at("2026-06-12T12:00")).is_ok());
    }

    // --- validate_for_enable ---

    #[test]
    fn enable_rejects_past_oneshot() {
        let s = oneshot("2026-06-10", "20:00", 60);
        assert!(validate_for_enable(&s, 0, at("2026-06-12T12:00")).is_err());
    }

    #[test]
    fn enable_allows_orphan_stream() {
        // stream_id не перевіряється на enable: осиротілі розклади дозволені
        let mut s = recurring(&[0]);
        s.stream_id = "ghost".into();
        assert!(validate_for_enable(&s, 0, at("2026-06-12T12:00")).is_ok());
    }

    // --- sanitize_on_load ---

    #[test]
    fn sanitize_disables_invalid_enabled_schedule() {
        let mut p = Profile::create_default();
        p.scheduled_recordings.push(recurring(&[])); // невалідний: порожні days
        sanitize_on_load(&mut p);
        assert_eq!(p.scheduled_recordings.len(), 1, "рядок лишається в списку");
        assert!(!p.scheduled_recordings[0].enabled);
    }

    #[test]
    fn sanitize_keeps_valid_schedule_enabled() {
        let mut p = Profile::create_default();
        p.scheduled_recordings.push(recurring(&[0, 4]));
        sanitize_on_load(&mut p);
        assert!(p.scheduled_recordings[0].enabled);
    }

    #[test]
    fn sanitize_keeps_orphan_and_past_oneshot_enabled() {
        // Осиротілий stream_id і відпрацьований oneshot НЕ вимикаються на load —
        // ними займеться таймер Фази 2 (Missed → enabled = false)
        let mut p = Profile::create_default();
        let mut orphan = recurring(&[0]);
        orphan.stream_id = "ghost".into();
        p.scheduled_recordings.push(orphan);
        p.scheduled_recordings.push(oneshot("2000-01-01", "20:00", 60));
        sanitize_on_load(&mut p);
        assert!(p.scheduled_recordings[0].enabled);
        assert!(p.scheduled_recordings[1].enabled);
    }

    #[test]
    fn sanitize_skips_already_disabled() {
        let mut p = Profile::create_default();
        let mut s = recurring(&[]);
        s.enabled = false;
        p.scheduled_recordings.push(s);
        sanitize_on_load(&mut p);
        assert!(!p.scheduled_recordings[0].enabled);
    }
}
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::validation`
Expected: помилка компіляції — `cannot find function 'validate_structural'` тощо.

- [ ] **Step 3: Реалізувати валідацію**

Додати у `validation.rs` НАД `#[cfg(test)] mod tests`:

```rust
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};

use crate::errors::RadioError;
use crate::profile::{Profile, ScheduleType, ScheduledRecording, StreamInfo};

/// Структурні правила §2: формат полів, узгодженість type ↔ days/date.
/// Застосовується і на add/update, і на load (sanitize_on_load).
pub fn validate_structural(s: &ScheduledRecording) -> Result<(), RadioError> {
    if NaiveTime::parse_from_str(&s.time, "%H:%M").is_err() {
        return Err(RadioError::InvalidData(format!(
            "Invalid time '{}': expected HH:MM", s.time
        )));
    }
    if !(1..=1439).contains(&s.duration_minutes) {
        return Err(RadioError::InvalidData(format!(
            "Duration {} minutes is out of range 1..=1439", s.duration_minutes
        )));
    }
    match s.schedule_type {
        ScheduleType::Recurring => {
            if s.days.is_empty() {
                return Err(RadioError::InvalidData(
                    "Recurring schedule must list at least one day".into(),
                ));
            }
            if let Some(d) = s.days.iter().find(|d| **d > 6) {
                return Err(RadioError::InvalidData(format!(
                    "Day {d} is out of range 0..=6"
                )));
            }
            let mut seen = [false; 7];
            for &d in &s.days {
                if seen[d as usize] {
                    return Err(RadioError::InvalidData(format!("Duplicate day {d}")));
                }
                seen[d as usize] = true;
            }
            if s.date.is_some() {
                return Err(RadioError::InvalidData(
                    "Recurring schedule must not have a date".into(),
                ));
            }
        }
        ScheduleType::Oneshot => {
            if !s.days.is_empty() {
                return Err(RadioError::InvalidData(
                    "Oneshot schedule must not have days".into(),
                ));
            }
            let Some(date) = s.date.as_deref() else {
                return Err(RadioError::InvalidData(
                    "Oneshot schedule requires a date".into(),
                ));
            };
            if NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
                return Err(RadioError::InvalidData(format!(
                    "Invalid date '{date}': expected YYYY-MM-DD"
                )));
            }
        }
    }
    Ok(())
}

/// Чи вікно oneshot (кінець включає padAfter) повністю в минулому.
/// Порівняння за наївним локальним календарем — для валідації цього досить.
/// Для recurring і для непарсибельних полів — false (структурну валідність
/// перевіряє validate_structural, не ця функція).
pub fn oneshot_window_fully_past(
    s: &ScheduledRecording,
    pad_after_min: u32,
    now: NaiveDateTime,
) -> bool {
    if s.schedule_type != ScheduleType::Oneshot {
        return false;
    }
    let Some(date) = s.date.as_deref() else { return false };
    let Ok(date) = NaiveDate::parse_from_str(date, "%Y-%m-%d") else { return false };
    let Ok(time) = NaiveTime::parse_from_str(&s.time, "%H:%M") else { return false };
    let end = NaiveDateTime::new(date, time)
        + chrono::Duration::minutes(s.duration_minutes as i64 + pad_after_min as i64);
    end <= now
}

/// Повна валідація для add_schedule / update_schedule (§2).
pub fn validate_for_save(
    s: &ScheduledRecording,
    streams: &[StreamInfo],
    pad_after_min: u32,
    now: NaiveDateTime,
) -> Result<(), RadioError> {
    validate_structural(s)?;
    if !streams.iter().any(|st| st.id == s.stream_id) {
        return Err(RadioError::NotFound(format!(
            "Stream '{}' not found in active profile", s.stream_id
        )));
    }
    if oneshot_window_fully_past(s, pad_after_min, now) {
        return Err(RadioError::InvalidData(
            "Oneshot schedule window is fully in the past".into(),
        ));
    }
    Ok(())
}

/// Валідація для toggle_schedule(enabled = true): структура + oneshot не
/// відпрацьований. stream_id НЕ перевіряється — осиротілі розклади дозволені
/// (§2), у Фазі 2 вони дадуть Missed.
pub fn validate_for_enable(
    s: &ScheduledRecording,
    pad_after_min: u32,
    now: NaiveDateTime,
) -> Result<(), RadioError> {
    validate_structural(s)?;
    if oneshot_window_fully_past(s, pad_after_min, now) {
        return Err(RadioError::InvalidData(
            "Oneshot schedule window is fully in the past".into(),
        ));
    }
    Ok(())
}

/// На load профілю (§2): профіль — JSON на диску, його можуть редагувати
/// руками. Жорстко невалідний розклад не валить завантаження — вимикається
/// з попередженням у лозі; рядок лишається видимим у таблиці.
/// Осиротілий stream_id і відпрацьований oneshot тут НЕ чіпаються.
pub fn sanitize_on_load(profile: &mut Profile) {
    for s in &mut profile.scheduled_recordings {
        if !s.enabled {
            continue;
        }
        if let Err(e) = validate_structural(s) {
            log::warn!("Disabling invalid schedule '{}' ({}): {e}", s.name, s.id);
            s.enabled = false;
        }
    }
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::validation`
Expected: усі ~20 тестів PASS.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/scheduler src-tauri/src/lib.rs
git commit -m "feat(scheduler): add schedule validation module"
```

---

### Task 4: Sanitize на load профілю

`Profile::load` — єдина точка читання профілю з диска; її використовують старт додатка (`lib.rs:87`), `switch_profile` і `transfer_stream_to_profile`. Виклик sanitize тут покриває всі три шляхи. На диск нічого не пишеться — вимкнений стан персиститься з наступним `save()`.

**Files:**
- Modify: `src-tauri/src/profile.rs` (метод `load`, ~рядок 311; тест у `mod tests`)

- [ ] **Step 1: Написати failing-тест**

Додати в `mod tests` у `profile.rs`:

```rust
    #[test]
    fn load_contract_invalid_schedule_is_disabled_not_fatal() {
        // Те, що робить Profile::load після parse: sanitize_on_load.
        // recurring із порожніми days — жорстко невалідний.
        let json = r#"{
            "name": "T",
            "scheduledRecordings": [{
                "id": "bad", "streamId": "s", "name": "Bad", "type": "recurring",
                "days": [], "time": "20:00", "durationMinutes": 60,
                "enabled": true, "createdAt": "2026-06-12T10:00:00+03:00"
            }]
        }"#;
        let mut p: Profile = serde_json::from_str(json).unwrap();
        crate::scheduler::validation::sanitize_on_load(&mut p);
        assert_eq!(p.scheduled_recordings.len(), 1, "рядок видно в таблиці");
        assert!(!p.scheduled_recordings[0].enabled, "невалідний розклад вимкнено");
        assert_eq!(p.scheduled_recordings[0].name, "Bad", "решта полів неушкоджена");
    }
```

- [ ] **Step 2: Запустити тест**

Run: `cargo test --manifest-path src-tauri/Cargo.toml load_contract_invalid_schedule`
Expected: PASS одразу (sanitize вже існує з Task 3) — цей тест документує контракт. Якщо FAIL — щось зламано в Task 3, виправити там.

- [ ] **Step 3: Підключити sanitize у `Profile::load`**

У `Profile::load` замінити:

```rust
        let profile: Self = serde_json::from_str(content)?;
        Ok(profile)
```

на:

```rust
        let mut profile: Self = serde_json::from_str(content)?;
        crate::scheduler::validation::sanitize_on_load(&mut profile);
        Ok(profile)
```

- [ ] **Step 4: Повний прогін Rust-тестів**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (усі модулі).

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/profile.rs
git commit -m "feat(scheduler): sanitize invalid schedules on profile load"
```

---

### Task 5: IPC-команди + реєстрація

П'ять команд §4. Уся мутація — у чистих impl-функціях (тестуються без `tauri::State`); командні обгортки повторюють патерн `wishlist_commands` (write-lock → impl → `snapshot.save()` через `spawn_blocking`). Рішення, зафіксовані спекою:

- `nextRun` у Фазі 1 завжди `None` — обчислення вікон з'явиться у Фазі 2;
- `update_schedule` ігнорує `created_at` і `last_result` від клієнта — ці поля пише лише backend;
- `toggle_schedule(enabled = true)` для відпрацьованого oneshot — помилка (та сама, що на add/update);
- `delete_schedule` ідемпотентний (як `remove_from_wishlist`): відсутній id — не помилка;
- подій `scheduled-*` ще немає (Фаза 2).

**Files:**
- Create: `src-tauri/src/commands/schedule_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (`generate_handler!`)

- [ ] **Step 1: Створити файл із типами, impl-функціями-заглушками і failing-тестами**

`src-tauri/src/commands/schedule_commands.rs`:

```rust
use serde::{Deserialize, Serialize};

use crate::app_state::AppState;
use crate::errors::RadioError;
use crate::profile::{Profile, ScheduleType, ScheduledRecording};
use crate::scheduler::validation;

/// Відповідь get_schedules: розклад + обчислюване nextRun.
/// Фаза 1: nextRun завжди None — обчислення вікон з'явиться у Фазі 2.
/// Формат nextRun (Фаза 2): ISO локальний datetime "YYYY-MM-DDTHH:MM".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleDto {
    #[serde(flatten)]
    pub schedule: ScheduledRecording,
    pub next_run: Option<String>,
}

/// Вхід add_schedule: id, createdAt, lastResult генерує/володіє backend.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledRecordingInput {
    pub stream_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub schedule_type: ScheduleType,
    #[serde(default)]
    pub days: Vec<u8>,
    #[serde(default)]
    pub date: Option<String>,
    pub time: String,
    pub duration_minutes: u32,
    pub enabled: bool,
}
```

Тести (в кінець файлу):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::{ScheduleResult, ScheduleResultStatus, StreamInfo};

    fn profile_with_stream() -> Profile {
        let mut p = Profile::create_default();
        p.streams.push(StreamInfo {
            id: "st1".into(), url: "http://x".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        });
        p
    }

    fn valid_input() -> ScheduledRecordingInput {
        ScheduledRecordingInput {
            stream_id: "st1".into(),
            name: "Evening Jazz".into(),
            schedule_type: ScheduleType::Recurring,
            days: vec![0, 2, 4],
            date: None,
            time: "20:00".into(),
            duration_minutes: 90,
            enabled: true,
        }
    }

    #[test]
    fn add_generates_server_owned_fields() {
        let mut p = profile_with_stream();
        let added = add_schedule_impl(&mut p, valid_input()).unwrap();
        assert!(!added.id.is_empty());
        assert!(!added.created_at.is_empty());
        assert!(added.last_result.is_none());
        assert_eq!(p.scheduled_recordings.len(), 1);
        assert_eq!(p.scheduled_recordings[0].id, added.id);
    }

    #[test]
    fn add_rejects_invalid_input() {
        let mut p = profile_with_stream();
        let mut input = valid_input();
        input.days = vec![]; // recurring без днів
        assert!(add_schedule_impl(&mut p, input).is_err());
        assert!(p.scheduled_recordings.is_empty(), "невалідне не додається");
    }

    #[test]
    fn add_rejects_unknown_stream() {
        let mut p = profile_with_stream();
        let mut input = valid_input();
        input.stream_id = "ghost".into();
        let err = add_schedule_impl(&mut p, input).unwrap_err();
        assert!(err.to_string().contains("not found"), "got: {err}");
    }

    #[test]
    fn update_preserves_server_owned_fields() {
        let mut p = profile_with_stream();
        let added = add_schedule_impl(&mut p, valid_input()).unwrap();

        let mut incoming = added.clone();
        incoming.name = "Renamed".into();
        incoming.created_at = "1999-01-01T00:00:00+00:00".into(); // клієнтський сміттєвий
        incoming.last_result = Some(ScheduleResult {
            occurrence: "2026-06-12T20:00".into(),
            status: ScheduleResultStatus::Completed,
            reason: None,
            recorded_minutes: 90,
            finished_at: "2026-06-12T22:00:00+03:00".into(),
        });

        let updated = update_schedule_impl(&mut p, incoming).unwrap();
        assert_eq!(updated.name, "Renamed");
        assert_eq!(updated.created_at, added.created_at, "createdAt від клієнта ігнорується");
        assert!(updated.last_result.is_none(), "lastResult від клієнта ігнорується");
        assert_eq!(p.scheduled_recordings[0].name, "Renamed");
    }

    #[test]
    fn update_unknown_id_is_not_found() {
        let mut p = profile_with_stream();
        let mut ghost = add_schedule_impl(&mut p, valid_input()).unwrap();
        ghost.id = "no-such-id".into();
        let err = update_schedule_impl(&mut p, ghost).unwrap_err();
        assert!(matches!(err, RadioError::NotFound(_)), "got: {err}");
    }

    #[test]
    fn toggle_flips_enabled() {
        let mut p = profile_with_stream();
        let added = add_schedule_impl(&mut p, valid_input()).unwrap();
        let off = toggle_schedule_impl(&mut p, &added.id, false).unwrap();
        assert!(!off.enabled);
        let on = toggle_schedule_impl(&mut p, &added.id, true).unwrap();
        assert!(on.enabled);
    }

    #[test]
    fn toggle_enable_expired_oneshot_fails() {
        let mut p = profile_with_stream();
        p.scheduled_recordings.push(ScheduledRecording {
            id: "old".into(), stream_id: "st1".into(), name: "Old".into(),
            schedule_type: ScheduleType::Oneshot,
            days: vec![], date: Some("2000-01-01".into()),
            time: "20:00".into(), duration_minutes: 60,
            enabled: false, created_at: "2000-01-01T00:00:00+00:00".into(),
            last_result: None,
        });
        assert!(toggle_schedule_impl(&mut p, "old", true).is_err());
        // вимкнення відпрацьованого — дозволене
        assert!(toggle_schedule_impl(&mut p, "old", false).is_ok());
    }

    #[test]
    fn toggle_unknown_id_is_not_found() {
        let mut p = profile_with_stream();
        let err = toggle_schedule_impl(&mut p, "ghost", true).unwrap_err();
        assert!(matches!(err, RadioError::NotFound(_)), "got: {err}");
    }

    #[test]
    fn delete_removes_and_is_idempotent() {
        let mut p = profile_with_stream();
        let added = add_schedule_impl(&mut p, valid_input()).unwrap();
        delete_schedule_impl(&mut p, &added.id);
        assert!(p.scheduled_recordings.is_empty());
        delete_schedule_impl(&mut p, &added.id); // повторне видалення — no-op
    }

    #[test]
    fn schedule_dto_flattens_and_camel_cases() {
        let mut p = profile_with_stream();
        let schedule = add_schedule_impl(&mut p, valid_input()).unwrap();
        let dto = ScheduleDto { schedule, next_run: None };
        let json = serde_json::to_string(&dto).unwrap();
        assert!(json.contains("\"nextRun\":null"), "got: {json}");
        assert!(json.contains("\"streamId\":\"st1\""), "got: {json}");
        assert!(!json.contains("\"schedule\":"), "flatten: без вкладеного об'єкта");
    }
}
```

- [ ] **Step 2: Зареєструвати модуль і переконатися, що тести падають**

У `src-tauri/src/commands/mod.rs` додати:

```rust
pub mod schedule_commands;
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml schedule_commands`
Expected: помилка компіляції — `cannot find function 'add_schedule_impl'`.

- [ ] **Step 3: Реалізувати impl-функції**

Додати у `schedule_commands.rs` між типами і тестами:

```rust
// --- Чиста логіка (тестується без tauri::State) ---

fn add_schedule_impl(
    profile: &mut Profile,
    input: ScheduledRecordingInput,
) -> Result<ScheduledRecording, RadioError> {
    let schedule = ScheduledRecording {
        id: nanoid::nanoid!(),
        stream_id: input.stream_id,
        name: input.name,
        schedule_type: input.schedule_type,
        days: input.days,
        date: input.date,
        time: input.time,
        duration_minutes: input.duration_minutes,
        enabled: input.enabled,
        created_at: chrono::Local::now().to_rfc3339(),
        last_result: None,
    };
    validation::validate_for_save(
        &schedule,
        &profile.streams,
        profile.recording.schedule_pad_after_min,
        chrono::Local::now().naive_local(),
    )?;
    profile.scheduled_recordings.push(schedule.clone());
    Ok(schedule)
}

fn update_schedule_impl(
    profile: &mut Profile,
    incoming: ScheduledRecording,
) -> Result<ScheduledRecording, RadioError> {
    let idx = profile
        .scheduled_recordings
        .iter()
        .position(|s| s.id == incoming.id)
        .ok_or_else(|| RadioError::NotFound(format!("Schedule '{}' not found", incoming.id)))?;
    // §2: created_at і last_result із клієнта ігноруються — їх пише лише backend
    let mut updated = incoming;
    updated.created_at = profile.scheduled_recordings[idx].created_at.clone();
    updated.last_result = profile.scheduled_recordings[idx].last_result.clone();
    validation::validate_for_save(
        &updated,
        &profile.streams,
        profile.recording.schedule_pad_after_min,
        chrono::Local::now().naive_local(),
    )?;
    profile.scheduled_recordings[idx] = updated.clone();
    Ok(updated)
}

fn toggle_schedule_impl(
    profile: &mut Profile,
    id: &str,
    enabled: bool,
) -> Result<ScheduledRecording, RadioError> {
    let pad_after = profile.recording.schedule_pad_after_min;
    let idx = profile
        .scheduled_recordings
        .iter()
        .position(|s| s.id == id)
        .ok_or_else(|| RadioError::NotFound(format!("Schedule '{id}' not found")))?;
    if enabled {
        // §2: увімкнення відпрацьованого oneshot — та сама помилка, що на add/update
        validation::validate_for_enable(
            &profile.scheduled_recordings[idx],
            pad_after,
            chrono::Local::now().naive_local(),
        )?;
    }
    profile.scheduled_recordings[idx].enabled = enabled;
    Ok(profile.scheduled_recordings[idx].clone())
}

fn delete_schedule_impl(profile: &mut Profile, id: &str) {
    // Ідемпотентно, як remove_from_wishlist: відсутній id — не помилка
    profile.scheduled_recordings.retain(|s| s.id != id);
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml schedule_commands`
Expected: усі 10 тестів PASS.

- [ ] **Step 5: Додати командні обгортки**

Після impl-функцій (перед `mod tests`):

```rust
// --- Tauri-команди (спека §4): працюють з активним профілем і одразу персистять ---

#[tauri::command]
pub async fn get_schedules(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScheduleDto>, String> {
    let profile = state.active_profile.read().await;
    Ok(profile
        .scheduled_recordings
        .iter()
        .cloned()
        .map(|schedule| ScheduleDto { schedule, next_run: None })
        .collect())
}

#[tauri::command]
pub async fn add_schedule(
    input: ScheduledRecordingInput,
    state: tauri::State<'_, AppState>,
) -> Result<ScheduledRecording, String> {
    let (entry, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let entry = add_schedule_impl(&mut profile, input).map_err(|e| e.to_string())?;
        (entry, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(entry)
}

#[tauri::command]
pub async fn update_schedule(
    schedule: ScheduledRecording,
    state: tauri::State<'_, AppState>,
) -> Result<ScheduledRecording, String> {
    let (entry, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let entry = update_schedule_impl(&mut profile, schedule).map_err(|e| e.to_string())?;
        (entry, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(entry)
}

#[tauri::command]
pub async fn delete_schedule(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        delete_schedule_impl(&mut profile, &id);
        profile.clone()
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_schedule(
    id: String,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<ScheduledRecording, String> {
    let (entry, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let entry =
            toggle_schedule_impl(&mut profile, &id, enabled).map_err(|e| e.to_string())?;
        (entry, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(entry)
}
```

- [ ] **Step 6: Зареєструвати команди**

У `src-tauri/src/lib.rs` у списку `generate_handler![...]` перед закриваючою `])` додати:

```rust
            commands::schedule_commands::get_schedules,
            commands::schedule_commands::add_schedule,
            commands::schedule_commands::update_schedule,
            commands::schedule_commands::delete_schedule,
            commands::schedule_commands::toggle_schedule,
```

- [ ] **Step 7: Повний прогін Rust-тестів + компіляція без warnings про dead code**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, без warnings про невикористані функції schedule_commands.

- [ ] **Step 8: Commit**

```powershell
git add src-tauri/src/commands/schedule_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(scheduler): add schedule CRUD IPC commands"
```

---

### Task 6: TS-типи й invoke-обгортки

Синхронізація `src/lib/tauri.ts` із Rust-моделлю. Frontend-тестів на типи немає (vitest перевіряє інше) — verification тут компіляційна: `pnpm vite:build` + `pnpm test` зелені. Зверни увагу: `npx tsc --noEmit` має ~51 старих помилок (нетипізований paraglide) — НЕ гейт; перевіряй лише, що НОВИХ помилок у tauri.ts немає.

**Files:**
- Modify: `src/lib/tauri.ts`:
  - інтерфейс `RecordingSettings` (~рядок 49) — два нових поля;
  - інтерфейс `Profile` (~рядок 412) — `scheduledRecordings: unknown[]` → `ScheduledRecording[]`;
  - нові типи — перед інтерфейсом `Profile`;
  - нові обгортки — після `saveRecordingSettings` (~рядок 296).

- [ ] **Step 1: Додати поля в `RecordingSettings`**

Після `autoCorrectCase: boolean;`:

```typescript
  schedulePadBeforeMin: number; // 0–30, запас перед стартом планового запису
  schedulePadAfterMin: number;  // 0–60, запас після кінця
```

- [ ] **Step 2: Додати типи scheduler**

Перед `export interface Profile`:

```typescript
// --- Scheduler (Phase 3D) ---

export type ScheduleType = "oneshot" | "recurring";

export type ScheduleResultStatus =
  | "completed"
  | "startedLate"
  | "missed"
  | "stoppedByUser"
  | "skippedAlreadyRecording";

export type ScheduleResultReason =
  // missed:
  | "appNotRunning"
  | "startFailed"
  | "clockChange"
  // stoppedByUser:
  | "manualStop"
  | "profileSwitch"
  | "appClosing"
  | "scheduleEdited";

export interface ScheduleResult {
  occurrence: string;       // "2026-06-12T20:00" — номінальний локальний час входження
  status: ScheduleResultStatus;
  reason: ScheduleResultReason | null;
  recordedMinutes: number;  // 0 — не стартував
  finishedAt: string;
}

export interface ScheduledRecording {
  id: string;
  streamId: string;
  name: string;
  type: ScheduleType;
  days: number[];           // recurring: 0=Пн..6=Нд; oneshot: []
  date: string | null;      // oneshot: "YYYY-MM-DD"; recurring: null
  time: string;             // "HH:MM", 24h, локальний час
  durationMinutes: number;  // 1..=1439
  enabled: boolean;
  createdAt: string;
  lastResult: ScheduleResult | null; // пише лише backend
}

export interface ScheduleDto extends ScheduledRecording {
  nextRun: string | null;   // "YYYY-MM-DDTHH:MM"; Фаза 1: завжди null
}

export interface ScheduledRecordingInput {
  streamId: string;
  name: string;
  type: ScheduleType;
  days: number[];
  date: string | null;
  time: string;
  durationMinutes: number;
  enabled: boolean;
}
```

- [ ] **Step 3: Оновити `Profile` і додати обгортки**

В інтерфейсі `Profile` замінити `scheduledRecordings: unknown[];` на:

```typescript
  scheduledRecordings: ScheduledRecording[];
```

Після `saveRecordingSettings`:

```typescript
// --- Scheduler (Phase 3D) ---

export async function getSchedules(): Promise<ScheduleDto[]> {
  return invoke("get_schedules");
}

export async function addSchedule(
  input: ScheduledRecordingInput,
): Promise<ScheduledRecording> {
  return invoke("add_schedule", { input });
}

export async function updateSchedule(
  schedule: ScheduledRecording,
): Promise<ScheduledRecording> {
  return invoke("update_schedule", { schedule });
}

export async function deleteSchedule(id: string): Promise<void> {
  return invoke("delete_schedule", { id });
}

export async function toggleSchedule(
  id: string,
  enabled: boolean,
): Promise<ScheduledRecording> {
  return invoke("toggle_schedule", { id, enabled });
}
```

- [ ] **Step 4: Перевірити frontend-гейти**

Run: `pnpm vite:build`
Expected: збірка успішна.

Run: `pnpm test`
Expected: усі vitest-тести PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/tauri.ts
git commit -m "feat(scheduler): sync TS schedule types and IPC wrappers"
```

---

### Task 7: Оновити `docs/data-models.md`

Спека §2 вимагає синхронного оновлення §3.3. Заодно: §3.4 (padding) і приклад профілю (старий `dayOfWeek`). §6 (event payloads) НЕ чіпати — події оновить Фаза 2.

**Files:**
- Modify: `docs/data-models.md` (§3.3 ~рядки 384–424, §3.4 ~426–474, приклад профілю ~рядки 197–229)

- [ ] **Step 1: Замінити §3.3**

Весь вміст розділу `### 3.3. ScheduledRecording` (обидва код-блоки) замінити на:

````markdown
### 3.3. ScheduledRecording

```typescript
interface ScheduledRecording {
  id: string;
  streamId: string;             // references StreamInfo.id активного профілю
  name: string;                 // мітка користувача, напр. "Evening Jazz"
  type: "oneshot" | "recurring";
  days: number[];               // recurring: 0=Пн..6=Нд, непорожній, без дублікатів; oneshot: []
  date: string | null;          // oneshot: ISO-дата "2026-06-14"; recurring: null
  time: string;                 // початок "HH:MM" (24h, локальний час)
  durationMinutes: number;      // 1..=1439
  enabled: boolean;
  createdAt: string;
  lastResult: ScheduleResult | null;  // пише лише backend
}

interface ScheduleResult {
  occurrence: string;           // "2026-06-12T20:00" — номінальний локальний час входження
  status: "completed" | "startedLate" | "missed" | "stoppedByUser" | "skippedAlreadyRecording";
  reason: ScheduleResultReason | null;  // лише для missed / stoppedByUser
  recordedMinutes: number;      // wall-clock; 0 — не стартував
  finishedAt: string;           // ISO datetime фіксації статусу
}

type ScheduleResultReason =
  // missed:
  | "appNotRunning" | "startFailed" | "clockChange"
  // stoppedByUser:
  | "manualStop" | "profileSwitch" | "appClosing" | "scheduleEdited";
```

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleType {
    Oneshot,
    Recurring,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledRecording {
    pub id: String,
    pub stream_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub schedule_type: ScheduleType,
    #[serde(default)]
    pub days: Vec<u8>,                // recurring: 0=Пн..6=Нд; oneshot: порожній
    #[serde(default)]
    pub date: Option<String>,
    pub time: String,
    pub duration_minutes: u32,        // 1..=1439
    pub enabled: bool,
    pub created_at: String,
    #[serde(default)]
    pub last_result: Option<ScheduleResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleResult {
    pub occurrence: String,
    pub status: ScheduleResultStatus,
    #[serde(default)]
    pub reason: Option<ScheduleResultReason>,
    pub recorded_minutes: u32,
    pub finished_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleResultStatus {
    Completed,
    StartedLate,
    Missed,
    StoppedByUser,
    SkippedAlreadyRecording,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleResultReason {
    AppNotRunning,
    StartFailed,
    ClockChange,
    ManualStop,
    ProfileSwitch,
    AppClosing,
    ScheduleEdited,
}
```

Правила валідації та семантика — [спека Phase 3D](superpowers/specs/2026-06-12-scheduler-design.md) §2.
````

- [ ] **Step 2: Оновити §3.4**

У TS-блоці після `autoCorrectCase` додати:

```typescript
  schedulePadBeforeMin: number;          // 0–30 хв, запас перед стартом планового запису
  schedulePadAfterMin: number;           // 0–60 хв, запас після кінця
```

У Rust-блоці після `auto_correct_case` додати:

```rust
    #[serde(default)]
    pub schedule_pad_before_min: u32,
    #[serde(default)]
    pub schedule_pad_after_min: u32,
```

- [ ] **Step 3: Оновити приклад профілю**

Блок `"scheduledRecordings"` у прикладі (~рядки 197–210) замінити на:

```json
  // Заплановані записи
  "scheduledRecordings": [
    {
      "id": "sched001",
      "streamId": "abc123",
      "name": "Evening Jazz",
      "type": "recurring",
      "days": [4],
      "date": null,
      "time": "20:00",
      "durationMinutes": 120,
      "enabled": true,
      "createdAt": "2026-01-25T09:00:00",
      "lastResult": null
    }
  ],
```

У блоці `"recording"` прикладу після `"autoCorrectCase": true,` додати:

```json
    "schedulePadBeforeMin": 0,
    "schedulePadAfterMin": 0,
```

- [ ] **Step 4: Commit**

```powershell
git add docs/data-models.md
git commit -m "docs(scheduler): update data-models for Phase 3D model (days, lastResult, padding)"
```

---

### Task 8: Фінал — лінк плану в спеці + повний прогін gates

**Files:**
- Modify: `docs/superpowers/specs/2026-06-12-scheduler-design.md` (§9, блок «Плани»)

- [ ] **Step 1: Оновити спеку**

Замінити рядок:

```markdown
- Фаза 1: _план ще не написано_
```

на:

```markdown
- Фаза 1: [2026-06-12-scheduler-phase-1-model-crud.md](../plans/2026-06-12-scheduler-phase-1-model-crud.md)
```

- [ ] **Step 2: Повний прогін усіх gates**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
pnpm vite:build
```

Expected: усі три зелені. Якщо щось червоне — виправити до коміту.

- [ ] **Step 3: Commit**

```powershell
git add docs/superpowers/specs/2026-06-12-scheduler-design.md
git commit -m "docs(scheduler): link Phase 1 implementation plan"
```

---

## Поза скоупом Фази 1 (НЕ реалізовувати)

- Таймер, тік-цикл, ledger, обчислення вікон/`nextRun` — Фаза 2.
- `session_id` у `StreamManager`, `notify_manual_stop` — Фаза 2.
- Події `scheduled-*` — Фаза 2.
- UI (панель, таблиця, форма, Settings-група), store `src/stores/schedule.ts`, i18n-рядки — Фаза 3.
- Per-schedule padding override, `%schedule%` у шаблонах імен — backlog спеки (§1).
