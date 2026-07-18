# Phase 3K — Crash Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Виявляти аварійне завершення попереднього сеансу, автоматично відновлювати активні ручні записи з живого снапшота `data/state.json` і NVDA-сумісно анонсувати підсумок «N з M».

**Architecture:** Backend-first (Tauri v2 / Rust). Новий модуль `crash_recovery.rs`: сесійний стан `data/state.json` (`clean_shutdown` + живий снапшот `stream_id` активних ручних записів), окрема tokio-задача-писар за зразком `SchedulerShared` (`select!` над `Notify` + `interval` + `CancellationToken`), resume-споживач у setup-хуку, deferred-анонс через `frontend_ready` (той самий гейт, що `StartupPlan`/`StartupNotice`). Мертве поле `Profile.active_recording_urls` прибирається. Frontend: hook `useCrashResumeFeedback` (аналог `useAutostartFeedback`) → `aria-live` через `LiveAnnouncer`.

**Tech Stack:** Rust (tokio, serde, tokio-util `CancellationToken`), Tauri v2 events, React 19 + nanostores, Paraglide.js i18n, vitest.

**Spec:** [docs/backlog/p1-crash-recovery.md](../../backlog/p1-crash-recovery.md) — усі дизайн-рішення закриті таблицею «Прийняті рішення».

## Global Constraints

- Гілка: `feature/phase-3k-crash-recovery` від `develop`; **не чіпати `main`**, не пушити без запиту.
- Ключ снапшота — **`stream_id`**, не URL; `url` у снапшоті — лише діагностика, у матчингу resume участі не бере.
- Снапшот-писар: spawn у **setup-хуку** (не `frontend_ready`), тригер `Notify` + `interval ≤ 30 с`, атомарний запис `temp → rename`.
- Анонс: порожній снапшот → **тиша** (події немає); усі підняті → «Відновлено N записів…»; частково → «Відновлено N з M записів…; решта потоків недоступні». Емісія — тільки з `frontend_ready` (deferred).
- Scheduler-owned записи в снапшот не входять (фільтр `manual_resume_stream_ids`).
- Часткові файли записів після збою залишаються як є (лише лог).
- i18n: українська перша, англійська друга (`src/i18n/messages/{uk,en}.json`); генерація — vite-плагіном (`pnpm vite:build`).
- Гейти: `cargo test` + `cargo clippy` (у `src-tauri/`), `pnpm test` + `pnpm vite:build` (корінь). `tsc` НЕ гейт (~51 pre-existing помилок paraglide).
- Vitest: перший прогін після простою може флейкати (холодний кеш) — перезапустити раз перед діагностикою; не маскувати exit code пайпами.
- Commit style: англійські conventional commits (`feat(scope): …`), footer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 0: Гілка

**Files:** немає (git only).

- [ ] **Step 0.1: Створити гілку від develop**

```powershell
git checkout develop && git pull --ff-only && git checkout -b feature/phase-3k-crash-recovery
```

Expected: `Switched to a new branch 'feature/phase-3k-crash-recovery'`. (Якщо `origin/develop` недоступний — просто `git checkout -b … develop`.)

---

### Task 1: `SessionState` — персистенс `data/state.json`

**Files:**
- Create: `src-tauri/src/crash_recovery.rs`
- Modify: `src-tauri/src/portable.rs` (додати `state_path()`)
- Modify: `src-tauri/src/lib.rs` (зареєструвати `mod crash_recovery;`)
- Test: unit-тести всередині `crash_recovery.rs`

**Interfaces:**
- Produces: `crash_recovery::SessionState { clean_shutdown: bool, active_recordings: Vec<ActiveRecording> }`, `ActiveRecording { stream_id: String, url: Option<String> }`; `SessionState::load() -> Self`, `SessionState::save(&self) -> Result<(), std::io::Error>`, тестовані `load_from(&Path) -> Self`, `save_to(&self, &Path)`; `portable::state_path() -> PathBuf`.

- [ ] **Step 1.1: Написати failing-тести**

Створити `src-tauri/src/crash_recovery.rs` зі скелетом модуля і тестами (типи ще не існують — компіляція впаде, це очікувано):

```rust
//! Phase 3K Crash Recovery: сесійний стан `data/state.json` — прапор
//! `clean_shutdown` + живий снапшот активних ручних записів. Єдине джерело
//! правди для resume після аварії (spec: docs/backlog/p1-crash-recovery.md).

#[cfg(test)]
mod tests {
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
```

У `src-tauri/src/lib.rs` додати `mod crash_recovery;` в алфавітний список модулів (між `mod commands;` і `mod errors;`):

```rust
mod commands;
mod crash_recovery;
mod errors;
```

- [ ] **Step 1.2: Переконатися, що тести падають**

Run (у `src-tauri/`): `cargo test crash_recovery`
Expected: compile error (`SessionState` not found).

- [ ] **Step 1.3: Мінімальна реалізація**

Додати в `crash_recovery.rs` над `mod tests`:

```rust
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
```

У `src-tauri/src/portable.rs` після `settings_path()` (рядок ~21):

```rust
/// Phase 3K: сесійний стан crash recovery (clean_shutdown + живий снапшот).
pub fn state_path() -> PathBuf {
    data_dir().join("state.json")
}
```

- [ ] **Step 1.4: Тести зелені**

Run (у `src-tauri/`): `cargo test crash_recovery`
Expected: `4 passed`.

- [ ] **Step 1.5: Commit**

```powershell
git add src-tauri/src/crash_recovery.rs src-tauri/src/portable.rs src-tauri/src/lib.rs
git commit -m "feat(crash-recovery): SessionState persistence for data/state.json"
```

(Footer `Co-Authored-By` — у кожен коміт; далі не повторюється в тексті плану.)

---

### Task 2: `manual_resume_stream_ids` + прибрати `Profile.active_recording_urls`

**Files:**
- Modify: `src-tauri/src/app_state.rs` (fn ~97, `graceful_shutdown` ~48–74, тести ~143–183)
- Modify: `src-tauri/src/profile.rs:320` (поле), `:427` (default), `:534` (duplicate), `:582` (save_imported)
- Modify: `src-tauri/src/commands/profile_commands.rs:137-146`
- Modify: `src-tauri/src/scheduler/core.rs:153` (коментар)
- Modify: `src/lib/tauri.ts:602` (TS-тип `Profile`)

**Interfaces:**
- Produces: `app_state::manual_resume_stream_ids(statuses: &[StreamStatus], scheduler_owned: &[(String, u64)]) -> Vec<String>` — параметр `streams` видалено; розв'язання id → `StreamInfo` переїжджає до resume (Task 4).

- [ ] **Step 2.1: Оновити тести під нову сигнатуру (failing)**

В `app_state.rs` tests: замінити 4 тести (хелпер `stream()` і всі згадки `manual_resume_urls` видалити):

```rust
#[test]
fn scheduler_owned_recordings_are_excluded_from_resume() {
    // §3.5: планові записи не потрапляють у снапшот — їх catch-up
    // лежить у ScheduleManager, а не в crash-resume
    let statuses = [
        status("manual", StreamState::Recording, 1),
        status("planned", StreamState::Recording, 2),
    ];
    let owned = [("planned".to_string(), 2u64)];
    assert_eq!(manual_resume_stream_ids(&statuses, &owned), vec!["manual".to_string()]);
}

#[test]
fn same_stream_with_other_session_is_manual() {
    // Пара (stream_id, session_id): якщо плановий запис обірвався і потік
    // зайняв ручний запис (інший session) — він має відновитися
    let statuses = [status("st1", StreamState::Recording, 5)];
    let owned = [("st1".to_string(), 2u64)]; // застаріла пара scheduler-а
    assert_eq!(manual_resume_stream_ids(&statuses, &owned), vec!["st1".to_string()]);
}

#[test]
fn idle_and_error_states_are_not_resumed() {
    let statuses = [
        status("a", StreamState::Idle, 1),
        status("b", StreamState::Error, 2),
        status("c", StreamState::Connecting, 3),
        status("d", StreamState::Reconnecting, 4),
    ];
    assert_eq!(manual_resume_stream_ids(&statuses, &[]), vec!["c".to_string(), "d".to_string()]);
}

#[test]
fn ids_are_returned_even_without_stream_info() {
    // Розв'язання id → StreamInfo — на resume: видалений потік лишається у
    // снапшоті і рахується промахом «N з M» (спека, «Resume-споживач»)
    let statuses = [status("ghost", StreamState::Recording, 1)];
    assert_eq!(manual_resume_stream_ids(&statuses, &[]), vec!["ghost".to_string()]);
}
```

- [ ] **Step 2.2: Переконатися, що впало**

Run (у `src-tauri/`): `cargo test app_state`
Expected: compile error (`manual_resume_stream_ids` not found).

- [ ] **Step 2.3: Реалізація**

В `app_state.rs` замінити `manual_resume_urls` (рядки 94–112) на:

```rust
/// Чиста (§3.5, Phase 3K): stream_id-и активних НЕпланових записів — вміст
/// живого снапшота state.json. Scheduler-owned визначається парою
/// (stream_id, session_id) — сам stream_id недостатній: потік міг перейти до
/// ручного запису. Розв'язання id → StreamInfo (URL/credentials) — на боці
/// resume-споживача.
pub fn manual_resume_stream_ids(
    statuses: &[StreamStatus],
    scheduler_owned: &[(String, u64)],
) -> Vec<String> {
    statuses
        .iter()
        .filter(|s| !matches!(s.state, StreamState::Idle | StreamState::Error))
        .filter(|s| {
            !scheduler_owned
                .iter()
                .any(|(id, sid)| *id == s.stream_id && *sid == s.session_id)
        })
        .map(|s| s.stream_id.clone())
        .collect()
}
```

У `graceful_shutdown` (той самий файл):
- видалити captures `let statuses = …` і `let scheduler_owned = …` (рядки 51–54 з коментарем) — вони жили лише заради `manual_resume_urls`;
- видалити блок збереження URL (рядки 62–74: коментар `// active_recording_urls…`, `let urls = …`, перший `profile.save()` з `drop(profile)`);
- оновити doc-коментар fn: `/// Stop all recordings, stop player, save volume/session, then briefly wait for in-flight tasks. …`.

`crate::profile::StreamInfo` import у тестах: прибрати `use crate::profile::StreamInfo;`, якщо лишився невикористаним.

У `profile.rs`: видалити поле `active_recording_urls` зі struct (~319–320 разом з `#[serde(default)]`), рядок у `create_default` (~427), рядки у `duplicate` (~533–534, разом із коментарем `// Clear session state…`) і `save_imported` (~582).

У `profile_commands.rs` (~137–146): видалити `profile.active_recording_urls = vec![];`, коментар кроку змінити на `// Step 6-7: save volume to old profile`.

У `scheduler/core.rs:153`: у коментарі замінити згадку `active_recording_urls у graceful_shutdown` на `снапшота state.json (manual_resume_stream_ids)`.

У `src/lib/tauri.ts:602`: видалити рядок `activeRecordingUrls: string[];` з інтерфейсу `Profile`.

- [ ] **Step 2.4: Тести зелені**

Run (у `src-tauri/`): `cargo test`
Expected: усі зелені. Транзиторне `dead_code` warning на `manual_resume_stream_ids` допустиме — споживач з'явиться в Task 3; `cargo clippy` ганяємо як гейт у Task 6.

Run (корінь): `pnpm test`
Expected: зелені (TS-поле ніде, крім типу, не вживалось).

- [ ] **Step 2.5: Commit**

```powershell
git add src-tauri/src/app_state.rs src-tauri/src/profile.rs src-tauri/src/commands/profile_commands.rs src-tauri/src/scheduler/core.rs src/lib/tauri.ts
git commit -m "refactor(crash-recovery): manual_resume_stream_ids; drop dead Profile.active_recording_urls"
```

---

### Task 3: Снапшот-писар (tokio-задача) + маркери сеансу

**Files:**
- Modify: `src-tauri/src/crash_recovery.rs` (писар, `build_snapshot`, маркери)
- Modify: `src-tauri/src/app_state.rs` (поле `snapshot`, cancel у `graceful_shutdown`)
- Modify: `src-tauri/src/stream/manager.rs:292` (`emit_recording_status` — notify-тригер)
- Modify: `src-tauri/src/lib.rs` (setup: mark + spawn)
- Test: unit-тести `build_snapshot` у `crash_recovery.rs`

**Interfaces:**
- Consumes: `manual_resume_stream_ids(statuses, scheduler_owned)` (Task 2); `SessionState` (Task 1).
- Produces: `crash_recovery::SnapshotShared { notify: tokio::sync::Notify, cancel: CancellationToken }` + `SnapshotShared::new() -> Arc<Self>`; `AppState.snapshot: Arc<SnapshotShared>`; `spawn_snapshot_writer(app: AppHandle)`; `build_snapshot(&[StreamStatus], &[(String, u64)], &[StreamInfo]) -> Vec<ActiveRecording>`; `mark_session_start()`, `mark_clean_shutdown()`.

- [ ] **Step 3.1: Failing-тести `build_snapshot`**

Додати в `crash_recovery.rs` tests (хелпери скопійовані з тестів `app_state.rs` — виконавець може читати лише цей таск):

```rust
use crate::profile::StreamInfo;
use crate::stream::manager::{StreamState, StreamStatus};

fn status(stream_id: &str, state: StreamState, session_id: u64) -> StreamStatus {
    StreamStatus {
        stream_id: stream_id.into(),
        state,
        current_track: None,
        recording_started_at: None,
        bytes_recorded: 0,
        tracks_recorded: 0,
        error: None,
        reconnect_attempt: None,
        session_id,
    }
}

fn stream(id: &str, url: &str) -> StreamInfo {
    StreamInfo {
        id: id.into(), url: url.into(), name: id.into(),
        format: None, bitrate: None, icy_name: None, icy_genre: None,
        icy_url: None, ignorelist: vec![], username: None, password: None,
        added_at: "2026-01-01".into(),
    }
}

#[test]
fn build_snapshot_maps_manual_ids_with_diagnostic_url() {
    let statuses = [
        status("manual", StreamState::Recording, 1),
        status("planned", StreamState::Recording, 2),
    ];
    let owned = [("planned".to_string(), 2u64)];
    let streams = [stream("manual", "http://m"), stream("planned", "http://p")];
    assert_eq!(
        build_snapshot(&statuses, &owned, &streams),
        vec![ActiveRecording { stream_id: "manual".into(), url: Some("http://m".into()) }]
    );
}

#[test]
fn build_snapshot_keeps_id_when_stream_info_missing() {
    // url — лише діагностика: без StreamInfo id все одно у снапшоті
    let statuses = [status("ghost", StreamState::Recording, 1)];
    assert_eq!(
        build_snapshot(&statuses, &[], &[]),
        vec![ActiveRecording { stream_id: "ghost".into(), url: None }]
    );
}
```

- [ ] **Step 3.2: Переконатися, що впало**

Run (у `src-tauri/`): `cargo test crash_recovery`
Expected: compile error (`build_snapshot` not found).

- [ ] **Step 3.3: Реалізація писаря**

У `crash_recovery.rs` додати:

```rust
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use crate::app_state::AppState;
use crate::profile::StreamInfo;
use crate::stream::manager::StreamStatus;

/// Safety net писаря: спека вимагає ≤ 30 с.
const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(30);
/// Легкий debounce: серія переходів (start_all / stop_all) → один запис.
const SNAPSHOT_DEBOUNCE: Duration = Duration::from_millis(500);

/// Снапшот-писар (за зразком `SchedulerShared`): notify на зміну складу
/// записів + interval як safety net; cancel — із graceful_shutdown.
pub struct SnapshotShared {
    pub notify: tokio::sync::Notify,
    pub cancel: CancellationToken,
}

impl SnapshotShared {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            notify: tokio::sync::Notify::new(),
            cancel: CancellationToken::new(),
        })
    }
}

/// Чиста: вміст живого снапшота — активні ручні записи. `url` — діагностика
/// (може бути відсутнім, якщо StreamInfo уже видалено з профілю).
pub fn build_snapshot(
    statuses: &[StreamStatus],
    scheduler_owned: &[(String, u64)],
    streams: &[StreamInfo],
) -> Vec<ActiveRecording> {
    crate::app_state::manual_resume_stream_ids(statuses, scheduler_owned)
        .into_iter()
        .map(|stream_id| {
            let url = streams.iter().find(|st| st.id == stream_id).map(|st| st.url.clone());
            ActiveRecording { stream_id, url }
        })
        .collect()
}

/// Кожен старт: маркер «сеанс у польоті» (clean_shutdown=false, снапшот
/// порожній — записи ще не стартували).
pub fn mark_session_start() {
    let s = SessionState { clean_shutdown: false, active_recordings: vec![] };
    if let Err(e) = s.save() {
        log::warn!("crash-recovery: failed to mark session start: {e}");
    }
}

/// Чистий вихід. Викликати ЛИШЕ після cancel писаря — інакше його
/// відкладений запис перетре true → спурйозний resume наступного старту.
pub fn mark_clean_shutdown() {
    let s = SessionState { clean_shutdown: true, active_recordings: vec![] };
    if let Err(e) = s.save() {
        log::error!("crash-recovery: failed to mark clean shutdown: {e}");
    }
}

/// Spawn у setup-хуку (НЕ frontend_ready: писар не емітить UI-подій — гейт
/// webview йому не потрібен; спека, «Хто пише снапшот»).
pub fn spawn_snapshot_writer(app: AppHandle) {
    let shared = app.state::<AppState>().snapshot.clone();
    tauri::async_runtime::spawn(async move {
        log::info!("Crash-recovery snapshot writer started");
        loop {
            tokio::select! {
                _ = shared.cancel.cancelled() => break,
                _ = shared.notify.notified() => {
                    tokio::time::sleep(SNAPSHOT_DEBOUNCE).await;
                }
                _ = tokio::time::sleep(SNAPSHOT_INTERVAL) => {}
            }
            // Після cancel (у т.ч. під час debounce-сну) НЕ писати — див.
            // mark_clean_shutdown.
            if shared.cancel.is_cancelled() {
                break;
            }
            write_snapshot(&app).await;
        }
        log::info!("Crash-recovery snapshot writer stopped");
    });
}

async fn write_snapshot(app: &AppHandle) {
    let state = app.state::<AppState>();
    let statuses = state.stream_manager.read().await.get_all_statuses();
    let scheduler_owned = state.scheduler.core.lock().await.owned_sessions();
    let streams = state.active_profile.read().await.streams.clone();
    let snapshot = SessionState {
        clean_shutdown: false,
        active_recordings: build_snapshot(&statuses, &scheduler_owned, &streams),
    };
    if let Err(e) = snapshot.save() {
        log::warn!("crash-recovery: failed to write snapshot: {e}");
    }
}
```

В `app_state.rs`:

```rust
pub struct AppState {
    // …існуючі поля…
    pub scheduler: Arc<crate::scheduler::timer::SchedulerShared>,
    pub snapshot: Arc<crate::crash_recovery::SnapshotShared>,
}
```

і в `AppState::new` у `Ok(Self { … })`:

```rust
            scheduler: crate::scheduler::timer::SchedulerShared::new(),
            snapshot: crate::crash_recovery::SnapshotShared::new(),
```

У `graceful_shutdown`: одразу після `let state = app.state::<AppState>();`:

```rust
    // Phase 3K: зупинити снапшот-писаря ДО будь-яких зупинок — інакше «stopped»
    // переходи розбудять його і він перетре clean_shutdown=true нижче.
    state.snapshot.cancel.cancel();
```

і в самому кінці fn, після `tokio::time::sleep(…).await;`:

```rust
    // Phase 3K: писар скасований (вище) — цей запис останній.
    crate::crash_recovery::mark_clean_shutdown();
```

У `stream/manager.rs`, `emit_recording_status` (рядок ~292) — на початку fn (це єдина точка, через яку проходять УСІ переходи стану: connecting / recording / reconnecting / stopped):

```rust
fn emit_recording_status(app: &AppHandle, stream_id: &str, status: &str, error: Option<String>) {
    // Phase 3K: будь-який перехід стану запису — тригер живого снапшота.
    if let Some(state) = app.try_state::<crate::app_state::AppState>() {
        state.snapshot.notify.notify_one();
    }
    debug!("[{}] Emitting recording-status: {}", stream_id, status);
    // …решта без змін…
```

(`try_state` потребує трейта `tauri::Manager` — додати до імпортів manager.rs, якщо його там ще немає.)

У `lib.rs` setup, одразу після `app.manage(state);` (перед `tray::setup_tray…`):

```rust
            // Phase 3K: маркер «сеанс у польоті» + снапшот-писар. Писар не
            // емітить UI-подій, тож НЕ чекає frontend_ready.
            crash_recovery::mark_session_start();
            crash_recovery::spawn_snapshot_writer(app.handle().clone());
```

- [ ] **Step 3.4: Тести зелені**

Run (у `src-tauri/`): `cargo test`
Expected: усі зелені (нові `build_snapshot_*` включно).

- [ ] **Step 3.5: Commit**

```powershell
git add src-tauri/src/crash_recovery.rs src-tauri/src/app_state.rs src-tauri/src/stream/manager.rs src-tauri/src/lib.rs
git commit -m "feat(crash-recovery): live snapshot writer task + session markers"
```

---

### Task 4: Resume-споживач + deferred-анонс (`frontend_ready`)

**Files:**
- Modify: `src-tauri/src/crash_recovery.rs` (`ResumeSummary`, `ResumeNotice`, `resume_recordings`)
- Modify: `src-tauri/src/lib.rs` (setup: виявлення збою + resume)
- Modify: `src-tauri/src/commands/app_commands.rs` (`frontend_ready`: дренаж + emit)
- Test: unit-тест `ResumeNotice::take` у `crash_recovery.rs`

**Interfaces:**
- Consumes: `SessionState::load()` (Task 1), `mark_session_start()` (Task 3), `commands::stream_commands::check_disk_space`, `StreamManager::start_recording(stream, settings, mgr_arc)`.
- Produces: `ResumeSummary { resumed: usize, total: usize }` (Serialize camelCase — payload події `crash-resume`); `ResumeNotice::new(ResumeSummary)`, `ResumeNotice::take() -> Option<ResumeSummary>`; `resume_recordings(app: &AppHandle, prev: &SessionState) -> ResumeSummary` (async).

- [ ] **Step 4.1: Failing-тест one-shot дренажу**

У tests `crash_recovery.rs`:

```rust
#[test]
fn resume_notice_take_is_one_shot() {
    // Reload-safe: повторний frontend_ready не повинен анонсувати вдруге
    let n = ResumeNotice::new(ResumeSummary { resumed: 2, total: 3 });
    assert_eq!(n.take(), Some(ResumeSummary { resumed: 2, total: 3 }));
    assert_eq!(n.take(), None);
}
```

Run (у `src-tauri/`): `cargo test resume_notice` → Expected: compile error.

- [ ] **Step 4.2: Реалізація**

У `crash_recovery.rs`:

```rust
/// Підсумок «N з M» — payload події `crash-resume`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeSummary {
    pub resumed: usize,
    pub total: usize,
}

/// One-shot deferred-анонс resume — той самий гейт, що StartupPlan /
/// StartupNotice: setup стешить, frontend_ready дренує й емітує (емісія до
/// підписки webview = втрачене озвучення).
pub struct ResumeNotice(std::sync::Mutex<Option<ResumeSummary>>);

impl ResumeNotice {
    pub fn new(summary: ResumeSummary) -> Self {
        Self(std::sync::Mutex::new(Some(summary)))
    }
    pub fn take(&self) -> Option<ResumeSummary> {
        self.0.lock().unwrap().take()
    }
}

/// Виявлений збій: тихий авто-resume записів зі снапшота. Незіставлений
/// stream_id (потік видалили) чи невдалий старт — промах у «N з M».
/// Часткові файли попереднього сеансу не чіпаємо (спека: MP3/AAC — кадровий
/// потік, фіналізація не обов'язкова).
pub async fn resume_recordings(app: &AppHandle, prev: &SessionState) -> ResumeSummary {
    let state = app.state::<AppState>();
    let total = prev.active_recordings.len();
    let mut resumed = 0usize;
    for rec in &prev.active_recordings {
        let stream = {
            let profile = state.active_profile.read().await;
            profile.streams.iter().find(|st| st.id == rec.stream_id).cloned()
        };
        let Some(stream) = stream else {
            log::warn!(
                "crash-recovery: stream '{}' (url {:?}) not in active profile — not resumed",
                rec.stream_id, rec.url
            );
            continue;
        };
        match try_start(&state, stream).await {
            Ok(()) => resumed += 1,
            Err(e) => log::warn!("crash-recovery: failed to resume '{}': {e}", rec.stream_id),
        }
    }
    log::info!("crash-recovery: resumed {resumed} of {total} recordings after crash");
    ResumeSummary { resumed, total }
}

/// Той самий шлях, що ручний/плановий старт (scheduler::timer::try_start):
/// check_disk_space НЕ обходиться.
async fn try_start(
    state: &tauri::State<'_, AppState>,
    stream: StreamInfo,
) -> Result<(), String> {
    crate::commands::stream_commands::check_disk_space(state)
        .await
        .map_err(|e| e.to_string())?;
    let settings = state.active_profile.read().await.recording.clone();
    let mgr_arc = state.stream_manager.clone();
    let mut mgr = mgr_arc.write().await;
    mgr.start_recording(stream, settings, mgr_arc.clone())
        .map(|_| ())
        .map_err(|e| e.to_string())
}
```

(Сигнатуру виклику `check_disk_space` звірити з `scheduler/timer.rs:157` — там `check_disk_space(&state)` при `state = app.state::<AppState>()`; передавати так само.)

У `lib.rs` setup замінити блок із Task 3 на (порядок критичний: load ДО mark):

```rust
            // Phase 3K: виявлення збою. prev — стан ПОПЕРЕДНЬОГО сеансу,
            // читаємо ДО перезапису маркером нового сеансу.
            let prev_session = crash_recovery::SessionState::load();
            crash_recovery::mark_session_start();
            if !prev_session.clean_shutdown && !prev_session.active_recordings.is_empty() {
                // Тихий авто-resume (без діалогу). Підсумок стешиться і
                // емітується з frontend_ready (гейт StartupPlan) — інакше
                // подія піде до підписки webview і озвучення загубиться.
                let summary = tauri::async_runtime::block_on(
                    crash_recovery::resume_recordings(app.handle(), &prev_session),
                );
                app.manage(crash_recovery::ResumeNotice::new(summary));
            }
            crash_recovery::spawn_snapshot_writer(app.handle().clone());
```

У `commands/app_commands.rs`, `frontend_ready`, після блоку `StartupNotice`:

```rust
    // Phase 3K: підсумок crash-resume — deferred (як StartupPlan/StartupNotice).
    // Порожній снапшот / чистий вихід → ResumeNotice не managed → тиша.
    if let Some(notice) = app.try_state::<crate::crash_recovery::ResumeNotice>() {
        if let Some(summary) = notice.take() {
            let _ = app.emit("crash-resume", summary);
        }
    }
```

- [ ] **Step 4.3: Тести зелені**

Run (у `src-tauri/`): `cargo test`
Expected: усі зелені.

- [ ] **Step 4.4: Commit**

```powershell
git add src-tauri/src/crash_recovery.rs src-tauri/src/lib.rs src-tauri/src/commands/app_commands.rs
git commit -m "feat(crash-recovery): auto-resume consumer + deferred crash-resume event"
```

---

### Task 5: Frontend — `useCrashResumeFeedback` + i18n

**Files:**
- Create: `src/hooks/useCrashResumeFeedback.ts`
- Create: `src/hooks/useCrashResumeFeedback.test.tsx`
- Modify: `src/lib/tauri.ts` (тип `CrashResumeSummary`, поряд з `CliFeedback` ~279)
- Modify: `src/App.tsx:23,368` (wiring поряд з `useAutostartFeedback`)
- Modify: `src/i18n/messages/uk.json`, `src/i18n/messages/en.json`

**Interfaces:**
- Consumes: подія `crash-resume` з payload `{ resumed: number; total: number }` (Task 4); `useTauriEvent<T>(event, handler)` (handler отримує payload напряму); `useAnnounce()`; `addToast(msg, "info")`.
- Produces: hook `useCrashResumeFeedback(): void`; i18n-ключі `crash_resume_all_one|few|many`, `crash_resume_partial`.

- [ ] **Step 5.1: i18n-повідомлення**

`src/i18n/messages/uk.json` (дотримуючись сусіднього форматування):

```json
"crash_resume_all_one": "Відновлено {count} запис після аварійного завершення",
"crash_resume_all_few": "Відновлено {count} записи після аварійного завершення",
"crash_resume_all_many": "Відновлено {count} записів після аварійного завершення",
"crash_resume_partial": "Відновлено {resumed} з {total} записів після аварійного завершення; решта потоків недоступні"
```

`src/i18n/messages/en.json`:

```json
"crash_resume_all_one": "Restored {count} recording after an abnormal shutdown",
"crash_resume_all_few": "Restored {count} recordings after an abnormal shutdown",
"crash_resume_all_many": "Restored {count} recordings after an abnormal shutdown",
"crash_resume_partial": "Restored {resumed} of {total} recordings after an abnormal shutdown; the remaining streams are unavailable"
```

Потім згенерувати paraglide-модулі: `pnpm vite:build` (генерація йде vite-плагіном; без цього нових `m.crash_resume_*` не існує і тести впадуть).

- [ ] **Step 5.2: Failing-тест хука**

`src/hooks/useCrashResumeFeedback.test.tsx` (дзеркало `useAutostartFeedback.test.tsx`):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { $announcer } from "../stores/announcer";
import { $toasts } from "../stores/toasts";

type Handler = (e: { payload: unknown }) => void;
const handlers = new Map<string, Handler>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Handler) => {
    handlers.set(event, cb);
    return () => handlers.delete(event);
  }),
}));

vi.mock("../i18n/paraglide/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/paraglide/messages")>();
  return {
    ...actual,
    crash_resume_all_one: ({ count }: { count: string }) => `all-one-${count}`,
    crash_resume_all_few: ({ count }: { count: string }) => `all-few-${count}`,
    crash_resume_all_many: ({ count }: { count: string }) => `all-many-${count}`,
    crash_resume_partial: ({ resumed, total }: { resumed: string; total: string }) =>
      `partial-${resumed}-of-${total}`,
  };
});

import { useCrashResumeFeedback } from "./useCrashResumeFeedback";

function Host() {
  useCrashResumeFeedback();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  $announcer.set(null);
  $toasts.set([]);
});

describe("useCrashResumeFeedback", () => {
  it("усі підняті → polite announce (плюральна форма) + info toast", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("crash-resume")).toBe(true));
    handlers.get("crash-resume")!({ payload: { resumed: 2, total: 2 } });
    // lang за замовчуванням "uk": 2 → few
    expect($announcer.get()).toEqual({ message: "all-few-2", priority: "polite" });
    expect($toasts.get().some((t) => t.message === "all-few-2" && t.type === "info")).toBe(true);
  });

  it("частково → повідомлення «N з M»", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("crash-resume")).toBe(true));
    handlers.get("crash-resume")!({ payload: { resumed: 1, total: 3 } });
    expect($announcer.get()).toEqual({ message: "partial-1-of-3", priority: "polite" });
  });
});
```

Run (корінь): `pnpm test -- useCrashResumeFeedback`
Expected: FAIL (модуль `./useCrashResumeFeedback` не існує).
(Якщо в проєкті vitest-фільтр викликається інакше — просто `pnpm test`; шукати FAIL цього файлу.)

- [ ] **Step 5.3: Реалізація хука**

`src/lib/tauri.ts` — поряд з коментарем про `cli-feedback` (~279):

```ts
/**
 * Backend `crash-resume` event (Phase 3K): підсумок тихого авто-resume
 * після аварійного завершення. Порожній снапшот → події немає (тиша).
 */
export interface CrashResumeSummary {
  resumed: number;
  total: number;
}
```

`src/hooks/useCrashResumeFeedback.ts`:

```tsx
import { useCallback, useMemo } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { addToast } from "../stores/toasts";
import * as m from "../i18n/paraglide/messages";
import type { CrashResumeSummary } from "../lib/tauri";

/**
 * Озвучення тихого авто-resume після аварійного завершення (Phase 3K). Той
 * самий патерн, що useAutostartFeedback: backend емітить `crash-resume` лише
 * ПІСЛЯ підписки webview (deferred у frontend_ready), фронт локалізує через
 * Paraglide і озвучує polite + info-toast (data-live-announcer — працює і в
 * модалці). Порожній снапшот → події немає взагалі → тиша.
 */
export function useCrashResumeFeedback(): void {
  const announce = useAnnounce();
  const pluralRules = useMemo(
    () => new Intl.PluralRules(document.documentElement.lang || "uk"),
    [],
  );

  useTauriEvent<CrashResumeSummary>(
    "crash-resume",
    useCallback(
      ({ resumed, total }) => {
        let msg: string;
        if (resumed === total) {
          const form = pluralRules.select(resumed);
          msg =
            form === "one" ? m.crash_resume_all_one({ count: String(resumed) }) :
            form === "few" ? m.crash_resume_all_few({ count: String(resumed) }) :
            m.crash_resume_all_many({ count: String(resumed) });
        } else {
          msg = m.crash_resume_partial({
            resumed: String(resumed),
            total: String(total),
          });
        }
        announce(msg, "polite");
        addToast(msg, "info");
      },
      [announce, pluralRules],
    ),
  );
}
```

`src/App.tsx`: до імпортів (рядок ~23):

```tsx
import { useCrashResumeFeedback } from "./hooks/useCrashResumeFeedback";
```

і поряд з `useAutostartFeedback()` (рядок ~368):

```tsx
  useCrashResumeFeedback();
```

- [ ] **Step 5.4: Тести зелені**

Run (корінь): `pnpm test`
Expected: PASS (обидва нові тести; при масовому холодному флейку — перезапустити раз).

- [ ] **Step 5.5: Commit**

```powershell
git add src/hooks/useCrashResumeFeedback.ts src/hooks/useCrashResumeFeedback.test.tsx src/lib/tauri.ts src/App.tsx src/i18n/messages/uk.json src/i18n/messages/en.json
git commit -m "feat(crash-recovery): NVDA-friendly resume summary announcement"
```

(Якщо `pnpm vite:build` згенерував трековані paraglide-файли — додати і їх у коміт; якщо вони в .gitignore — нічого.)

---

### Task 6: Документація + фінальні гейти

**Files:**
- Modify: `AGENTS.md` (таблиця фаз: 3K → ✅, гілка)
- Move+Modify: `docs/backlog/p1-crash-recovery.md` → `docs/backlog/done/p1-crash-recovery.md` (стан → done, критерії відмічено)
- Modify: `docs/backlog/README.md`, `docs/backlog/IMPLEMENTATION-ORDER.md` (прибрати/оновити згадки з черги — звірити фактичний вміст)
- Modify: `docs/data-models.md` (описати `data/state.json`)
- Modify: `docs/implementation-phases.md` (§3K — виконано)

- [ ] **Step 6.1: Оновити документацію**

1. `AGENTS.md`: рядок `| Phase 3K — Crash Recovery | ⬜ Not started | — |` → `| Phase 3K — Crash Recovery | ✅ Complete | \`feature/phase-3k-crash-recovery\` |`.
2. `git mv docs/backlog/p1-crash-recovery.md docs/backlog/done/p1-crash-recovery.md`; у файлі: `Стан:` → `done (реалізовано у feature/phase-3k-crash-recovery)`, чекбокси «Критеріїв готовності» → `[x]`, КРІМ пункту «ручний прогін з NVDA» — залишити `[ ]` з приміткою `(очікує ручного прогону)`.
3. `docs/backlog/README.md` і `IMPLEMENTATION-ORDER.md`: знайти згадки `p1-crash-recovery` / `crash-recovery` і перевести їх у «done» за наявним у файлах патерном (подивитися, як оформлені інші done-пункти).
4. `docs/data-models.md`: додати розділ про `data/state.json` — структура (`cleanShutdown`, `activeRecordings[{streamId, url?}]`), семантика (false при старті → true при graceful shutdown; живий снапшот ≤ 30 с; ключ — `streamId`, `url` діагностичний), атомарний запис. Зазначити: часткові файли записів після збою залишаються без змін.
5. `docs/implementation-phases.md`: §3K позначити виконаним за патерном сусідніх завершених фаз.

- [ ] **Step 6.2: Повні гейти**

Run (у `src-tauri/`): `cargo test` → Expected: усі зелені.
Run (у `src-tauri/`): `cargo clippy --all-targets` → Expected: без warnings (зокрема жодного dead_code — писар і resume вже споживають усе).
Run (корінь): `pnpm test` → Expected: зелені (флейк холодного старту → перезапуск раз).
Run (корінь): `pnpm vite:build` → Expected: успішна збірка.

- [ ] **Step 6.3: Commit**

```powershell
git add AGENTS.md docs/
git commit -m "docs(crash-recovery): mark Phase 3K done; document data/state.json"
```

- [ ] **Step 6.4: Ручна перевірка (користувач, поза CI)**

Прогін з NVDA: запустити ≥1 ручний запис → `End Task` у Task Manager → запустити Tapir → очікується: запис піднято, NVDA озвучує «Відновлено 1 запис після аварійного завершення» після завантаження UI. Другий сценарій: чистий вихід → рестарт → тиша.

---

## Завершення

Після зелених гейтів — skill `superpowers:finishing-a-development-branch`: злиття у `develop` (без пушу без запиту), гілку не видаляти без підтвердження.
