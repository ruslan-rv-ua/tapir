# Scheduler Фаза 2 — ядро планувальника: план імплементації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реалізувати §3 спеки Phase 3D повністю: `session_id` у `StreamManager`, чиста календарна логіка вікон, тік-цикл із проходами A/B + ledger, `notify_manual_stop` у всіх шляхах ручної зупинки, lifecycle §3.5 (старт після ready-сигналу, ProfileSwitch/AppClosing, shutdown-фільтр `active_recording_urls`), події `scheduled-*` і реальний `nextRun`.

**Architecture:** Functional core / imperative shell. Чиста календарна логіка — `scheduler::windows` (функції приймають `now` параметром). State machine тіка — `scheduler::core::SchedulerCore`: метод `tick(ctx, resolver)` приймає знімок світу і повертає `Vec<TickAction>`; виконує дії shell (`scheduler::timer`), який повідомляє результат стартів назад (`confirm_start` / `start_failed`). DST-залежності інжектяться як `&dyn Fn(NaiveDateTime) -> LocalKind` — у проді `chrono::Local`, у тестах фейкові резолвери. Tokio-задача тіка стартує з нового IPC `frontend_ready` (ідемпотентний), щохвилини на початку календарної хвилини.

**Tech Stack:** Rust (Tauri v2, tokio, tokio-util CancellationToken, chrono 0.4; dev-dep chrono-tz для DST-тестів), TypeScript (`src/lib/tauri.ts`), тести — `cargo test` + vitest.

**Спека:** [2026-06-12-scheduler-design.md](../specs/2026-06-12-scheduler-design.md) (§3, §4, §9 «Фаза 2»). Контракти (модель §2, IPC §4) фіксовані — зміна спершу вноситься у спеку.

**Гілка:** продовжуємо `feature/phase-3d-scheduler` (Фаза 1 уже в ній).

**Gates (усі зелені перед мерджем):**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
pnpm vite:build
```

Увага: `npx tsc --noEmit` має ~51 старих помилок (нетипізований paraglide) — він НЕ gate.

---

## Зафіксовані рішення (поза буквою спеки — обґрунтування)

1. **П'ятий шлях ручної зупинки.** Спека (§3.3) називає чотири шляхи; у коді є п'ятий — пункт «Зупинити всі записи» tray-меню (`tray/handlers.rs::spawn_stop_all`, викликає `mgr.stop_all()` напряму). Уніфікуємо: всі stop-all-шляхи (IPC-команда, tray, глобальний хоткей, stop-гілка toggle) йдуть через `recording_control::stop_all_now`, хук — в одній точці.
2. **Oneshot НЕ вимикається при `StoppedByUser`** (ManualStop / ProfileSwitch / AppClosing / ScheduleEdited), хоча §3.2 крок 4 каже «після фіксації результату (будь-якого)». Інакше обіцяний §3.5 catch-up після рестарту («дозапише залишок вікна як StartedLate») був би неможливий для oneshot. Відпрацьований oneshot, що залишився enabled, гасить дедуп-гілка проходу B: `last_result.occurrence == входження` + вікно минуло → `enabled = false` без перезапису результату.
3. **`finished_at`** — наївний локальний час `"%Y-%m-%dT%H:%M:%S"` (хвилина тіка); `occurrence` — `"%Y-%m-%dT%H:%M"` (формат §2).
4. **Ledger TTL:** `cleanup_after = час фіксації + 48 год` (спека: «досить тримати ~48 год»). Простіше, ніж рахувати від кінця вікна.
5. **Кінець вікна в DST-розриві** (екзотика: `window_end` потрапив у неіснуючу годину): інстант = `naive + 1h`, переобчислений; похибка ≤ розміру розриву. Якщо й це розрив (нереально для звичайних TZ) — фолбек `Utc.from_utc_datetime`.
6. **`nextRun`** = найближчий номінальний старт строго ПІСЛЯ `now`; для вимкнених — `None`; oneshot із стартом у минулому — `None`. Padding не враховується (номінальний час, як `ScheduleResult.occurrence`).
7. **`graceful_shutdown` читає статуси ДО `stop_all`** (зараз читає після — покладається на асинхронність зникнення). Для фільтра за `session_id` порядок обов'язковий.

## Структура файлів

| Файл | Дія | Відповідальність |
|------|-----|------------------|
| `src-tauri/src/stream/manager.rs` | modify | `session_id: u64` у `StreamStatus`, лічильник у `start_recording` (повертає id) |
| `src-tauri/src/scheduler/windows.rs` | create | Чиста календарна логіка: вікна входжень, `next_run`, `LocalKind`/резолвери DST |
| `src-tauri/src/scheduler/core.rs` | create | `SchedulerCore`: тік A/B, ledger, confirm/fail, manual stop, edit/drain/reset |
| `src-tauri/src/scheduler/timer.rs` | create | Shell: `SchedulerShared`, тік-задача, застосування дій, події `scheduled-*`, хуки |
| `src-tauri/src/scheduler/mod.rs` | modify | Оголошення модулів |
| `src-tauri/src/profile.rs` | modify | `PartialEq` для `ScheduleResult` (потрібен тестам core) |
| `src-tauri/src/app_state.rs` | modify | Поле `scheduler`; rework `graceful_shutdown` + чиста `manual_resume_urls` |
| `src-tauri/src/recording_control.rs` | modify | `stop_all_now`/`toggle_all` → `&AppHandle` + хук manual stop |
| `src-tauri/src/shortcuts.rs` | modify | Виклики `toggle_all(&app)` / `stop_all_now(&app)` |
| `src-tauri/src/tray/handlers.rs` | modify | `spawn_stop_all` через `stop_all_now` |
| `src-tauri/src/commands/stream_commands.rs` | modify | Хук у `stop_recording`/`stop_all_recordings`; `check_disk_space` → `pub(crate)` |
| `src-tauri/src/commands/schedule_commands.rs` | modify | Реальний `nextRun`; хуки edit/toggle-off/delete |
| `src-tauri/src/commands/app_commands.rs` | create | Команда `frontend_ready` |
| `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` | modify | Реєстрація модуля і команди |
| `src-tauri/src/commands/profile_commands.rs` | modify | `on_profile_switch` перед зупинкою записів |
| `src-tauri/Cargo.toml` | modify | dev-dependency `chrono-tz` |
| `src/lib/tauri.ts` | modify | `sessionId` у `StreamStatus`; обгортка `frontendReady` |
| `src/stores/streams.ts` | modify | `sessionId: 0` у дефолтному статусі |
| `src/App.tsx` | modify | Виклик `frontendReady()` після початкового завантаження |
| TS-фікстури (5 файлів тестів) | modify | `sessionId: 0` в об'єктах `StreamStatus` |
| `docs/data-models.md` | modify | §4.1 `sessionId`; §5 payload-и `scheduled-*` |
| `docs/superpowers/specs/2026-06-12-scheduler-design.md` | modify | §9: лінк на цей план |

---

### Task 1: `session_id` у `StreamManager` + синхронізація TS

Спека §3.3: `start_recording` присвоює `session_id: u64` (монотонний лічильник), кладе його в `StreamStatus` і повертає викликачу; reconnect-цикл його не змінює (статус-хелпери `update_state_*` поле не чіпають — нічого міняти не треба, лічильник живе тільки в `start_recording`).

**Files:**
- Modify: `src-tauri/src/stream/manager.rs` (struct `StreamStatus` ~рядок 26, `StreamManager` ~134, `start_recording` ~150, тести внизу)
- Modify: `src-tauri/src/recording_control.rs` (фікстура `status()` у тестах ~рядок 120)
- Modify: `src-tauri/src/commands/stream_commands.rs` (`start_recording` команда ~рядок 196)
- Modify: `src/lib/tauri.ts`, `src/stores/streams.ts` + TS-фікстури

- [ ] **Step 1: Написати failing-тест**

У `mod tests` файлу `manager.rs` додати:

```rust
    #[test]
    fn stream_status_serializes_session_id_camel_case() {
        let status = StreamStatus {
            stream_id: "x".to_string(),
            state: StreamState::Recording,
            current_track: None,
            recording_started_at: None,
            bytes_recorded: 0,
            tracks_recorded: 0,
            error: None,
            reconnect_attempt: None,
            session_id: 7,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"sessionId\":7"), "got: {json}");
    }

    #[test]
    fn start_recording_returns_session_id() {
        // Поведінковий тест потребує Tauri AppHandle — пінимо сигнатуру,
        // як у сусідніх тестах stop_all_async / start_all.
        let _: fn(
            &mut StreamManager,
            StreamInfo,
            RecordingSettings,
            Arc<RwLock<StreamManager>>,
        ) -> Result<u64, RadioError> = StreamManager::start_recording;
    }
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml stream::manager`
Expected: помилка компіляції — `missing field 'session_id'`, mismatched types у пін-тесті.

- [ ] **Step 3: Реалізувати**

У struct `StreamStatus` після `reconnect_attempt` додати:

```rust
    /// Стабільний id сесії запису (§3.3): присвоюється на старті, reconnect
    /// його НЕ змінює. Scheduler трекає власність записів саме по ньому —
    /// recording_started_at для цього непридатний (None у Connecting,
    /// перезаписується кожним реконектом).
    pub session_id: u64,
```

У struct `StreamManager` після `wake_lock` додати поле, у `new` — ініціалізацію:

```rust
    /// Монотонний лічильник session_id (§3.3). Інстансний — Manager один на додаток.
    next_session_id: u64,
```

```rust
            next_session_id: 0,
```

У `start_recording`: сигнатура `-> Result<u64, RadioError>`; після перевірки `contains_key` додати інкремент, у `status` — поле, в кінці — повернення:

```rust
        self.next_session_id += 1;
        let session_id = self.next_session_id;
```

```rust
        let status = StreamStatus {
            stream_id: stream_id.clone(),
            state: StreamState::Idle,
            current_track: None,
            recording_started_at: None,
            bytes_recorded: 0,
            tracks_recorded: 0,
            error: None,
            reconnect_attempt: None,
            session_id,
        };
```

```rust
        Ok(session_id)
```

Виправити викликачів:
- `stream_commands.rs::start_recording` (команда): останній вираз →
  ```rust
    manager
        .start_recording(stream, settings, manager_arc.clone())
        .map(|_| ())
        .map_err(|e| e.to_string())
  ```
- `manager.rs::start_all`: `match self.start_recording(...)` → `Ok(_) => started += 1,`
- `recording_control.rs` тестова фікстура `status()`: додати `session_id: 0,`

- [ ] **Step 4: Переконатися, що Rust-тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, без нових warnings.

- [ ] **Step 5: Синхронізувати TS**

`src/lib/tauri.ts`, інтерфейс `StreamStatus` (~рядок 31), після `reconnectAttempt`:

```typescript
  sessionId: number; // стабільний id сесії запису; reconnect його не змінює
```

`src/stores/streams.ts`, дефолтний об'єкт в `updateStreamStatus` (~рядок 18): додати `sessionId: 0,` після `reconnectAttempt: null,`.

Додати `sessionId: 0,` в усі тестові об'єкти `StreamStatus` (шукати за `tracksRecorded:`):
- `src/components/streams/StreamContextMenu.test.tsx` (~рядок 31)
- `src/components/streams/StreamList.test.tsx` (~рядок 194)
- `src/components/streams/StreamItem.test.tsx` (4 місця: ~99, ~144, ~177, ~195)
- `src/components/streams/StreamsPanel.test.tsx` (~рядок 48)
- `src/components/layout/StatusBar.test.tsx` (~рядок 19)

- [ ] **Step 6: Перевірити frontend-гейти**

Run: `pnpm test` → PASS; `pnpm vite:build` → збірка успішна.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/stream/manager.rs src-tauri/src/recording_control.rs src-tauri/src/commands/stream_commands.rs src/lib/tauri.ts src/stores/streams.ts src/components
git commit -m "feat(scheduler): add recording session_id to StreamManager and StreamStatus"
```

---

### Task 2: Модуль `scheduler::windows` — чиста календарна логіка

Спека §3.2 крок 1 і §4 (`nextRun`). Без tokio і Tauri; `now` — параметр. DST-відображення — generic по `TimeZone`, щоб тести використовували `chrono_tz::Europe::Kyiv` (детерміновані переходи), а прод — `chrono::Local`.

Дата-орієнтир у тестах: 2026-06-12 — п'ятниця (день 4 у форматі 0=Пн..6=Нд). DST Києва 2026: вперед — нд 2026-03-29 (03:00→04:00), назад — нд 2026-10-25 (04:00→03:00).

**Files:**
- Modify: `src-tauri/Cargo.toml` (`[dev-dependencies]`)
- Create: `src-tauri/src/scheduler/windows.rs`
- Modify: `src-tauri/src/scheduler/mod.rs`

- [ ] **Step 1: Додати dev-dependency**

У `src-tauri/Cargo.toml` в `[dev-dependencies]` додати:

```toml
chrono-tz = "0.10"
```

- [ ] **Step 2: Створити модуль із failing-тестами**

У `src-tauri/src/scheduler/mod.rs` додати `pub mod windows;` (модулі за алфавітом):

```rust
//! Phase 3D Scheduler (§3).
//! windows — чиста календарна логіка; core — state machine тіка (Task 3);
//! timer — imperative shell (Task 6); validation — валідація моделі (Фаза 1).
pub mod validation;
pub mod windows;
```

`src-tauri/src/scheduler/windows.rs` — спочатку лише тести:

```rust
//! Чиста календарна логіка вікон (§3.2 крок 1, §4 nextRun).
//! Без tokio і Tauri; `now` — завжди параметр. DST — через generic TimeZone.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::{ScheduleType, ScheduledRecording};
    use chrono::TimeZone;

    fn recurring(days: &[u8], time: &str, dur: u32) -> ScheduledRecording {
        ScheduledRecording {
            id: "sch1".into(),
            stream_id: "st1".into(),
            name: "Test".into(),
            schedule_type: ScheduleType::Recurring,
            days: days.to_vec(),
            date: None,
            time: time.into(),
            duration_minutes: dur,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        }
    }

    fn oneshot(date: &str, time: &str, dur: u32) -> ScheduledRecording {
        let mut s = recurring(&[], time, dur);
        s.schedule_type = ScheduleType::Oneshot;
        s.date = Some(date.into());
        s
    }

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").unwrap()
    }

    // --- latest_started_window ---

    #[test]
    fn recurring_window_active_today() {
        // Пт 20:00–21:00, зараз пт 20:30
        let w = latest_started_window(&recurring(&[4], "20:00", 60), 0, 0, at("2026-06-12T20:30")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-12T20:00"));
        assert_eq!(w.window_start, at("2026-06-12T20:00"));
        assert_eq!(w.window_end, at("2026-06-12T21:00"));
    }

    #[test]
    fn before_todays_window_falls_back_to_previous_week() {
        // Зараз пт 19:00 — сьогоднішнє вікно ще не почалося → минула п'ятниця
        let w = latest_started_window(&recurring(&[4], "20:00", 60), 0, 0, at("2026-06-12T19:00")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-05T20:00"));
    }

    #[test]
    fn midnight_crossing_window_belongs_to_start_day() {
        // Пн 23:00 + 120 хв → вікно до вт 01:00; зараз вт 00:30 — активне
        let w = latest_started_window(&recurring(&[0], "23:00", 120), 0, 0, at("2026-06-09T00:30")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-08T23:00"));
        assert_eq!(w.window_end, at("2026-06-09T01:00"));
    }

    #[test]
    fn pad_before_opens_tomorrows_window_today() {
        // Пт 00:10, padBefore 30 → вікно стартує чт 23:40; зараз чт 23:45
        let w = latest_started_window(&recurring(&[4], "00:10", 60), 30, 0, at("2026-06-11T23:45")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-12T00:10"));
        assert_eq!(w.window_start, at("2026-06-11T23:40"));
    }

    #[test]
    fn pad_after_extends_window_end() {
        let w = latest_started_window(&recurring(&[4], "20:00", 60), 0, 45, at("2026-06-12T20:30")).unwrap();
        assert_eq!(w.window_end, at("2026-06-12T21:45"));
    }

    #[test]
    fn oneshot_far_in_past_is_still_found() {
        // Без штучного горизонту «24 години» (§3.2 крок 1)
        let w = latest_started_window(&oneshot("2026-06-01", "20:00", 60), 0, 0, at("2026-06-12T12:00")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-01T20:00"));
    }

    #[test]
    fn future_oneshot_window_is_none() {
        // Вікно ще не почалося — тіку нічого робити
        assert!(latest_started_window(&oneshot("2026-06-14", "20:00", 60), 0, 0, at("2026-06-12T12:00")).is_none());
        // Для recurring завжди є минуле входження (до 7 діб назад) — None
        // буває лише з невалідними полями, див. наступний тест
        let w = latest_started_window(&recurring(&[6], "20:00", 60), 0, 0, at("2026-06-08T12:00")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-07T20:00"));
    }

    #[test]
    fn invalid_time_or_date_is_none() {
        assert!(latest_started_window(&recurring(&[4], "xx:yy", 60), 0, 0, at("2026-06-12T12:00")).is_none());
        assert!(latest_started_window(&oneshot("garbage", "20:00", 60), 0, 0, at("2026-06-12T12:00")).is_none());
    }

    // --- next_run ---

    #[test]
    fn next_run_later_today() {
        assert_eq!(next_run(&recurring(&[4], "20:00", 60), at("2026-06-12T10:00")), Some(at("2026-06-12T20:00")));
    }

    #[test]
    fn next_run_skips_to_next_week_after_start() {
        // Рівно у хвилину старту і пізніше — наступне входження (строго >)
        assert_eq!(next_run(&recurring(&[4], "20:00", 60), at("2026-06-12T20:00")), Some(at("2026-06-19T20:00")));
    }

    #[test]
    fn next_run_picks_nearest_of_days() {
        // Дні пн+пт, зараз пт 21:00 → найближчий пн 06-15
        assert_eq!(next_run(&recurring(&[0, 4], "20:00", 60), at("2026-06-12T21:00")), Some(at("2026-06-15T20:00")));
    }

    #[test]
    fn next_run_oneshot() {
        assert_eq!(next_run(&oneshot("2026-06-14", "08:30", 60), at("2026-06-12T12:00")), Some(at("2026-06-14T08:30")));
        assert_eq!(next_run(&oneshot("2026-06-10", "08:30", 60), at("2026-06-12T12:00")), None);
    }

    // --- occurrence_key ---

    #[test]
    fn occurrence_key_format() {
        assert_eq!(occurrence_key(at("2026-06-12T20:00")), "2026-06-12T20:00");
    }

    // --- resolve_local / end_instant (chrono-tz, Europe/Kyiv) ---

    #[test]
    fn resolve_normal_time_is_valid() {
        let kind = resolve_local(&chrono_tz::Europe::Kiev, at("2026-06-12T20:00"));
        // Літо, UTC+3
        assert_eq!(kind, LocalKind::Valid(Utc.with_ymd_and_hms(2026, 6, 12, 17, 0, 0).unwrap()));
    }

    #[test]
    fn resolve_spring_forward_gap() {
        // 2026-03-29 03:00→04:00 — 03:30 не існує
        assert_eq!(resolve_local(&chrono_tz::Europe::Kiev, at("2026-03-29T03:30")), LocalKind::Gap);
    }

    #[test]
    fn resolve_fall_back_is_ambiguous_earliest() {
        // 2026-10-25 04:00→03:00 — 03:30 існує двічі; беремо ПЕРШЕ (літнє, UTC+3 → 00:30 UTC)
        assert_eq!(
            resolve_local(&chrono_tz::Europe::Kiev, at("2026-10-25T03:30")),
            LocalKind::Ambiguous(Utc.with_ymd_and_hms(2026, 10, 25, 0, 30, 0).unwrap())
        );
    }

    #[test]
    fn end_instant_in_gap_shifts_one_hour() {
        let resolve = |n: NaiveDateTime| resolve_local(&chrono_tz::Europe::Kiev, n);
        // 03:30 у розриві → 04:30 EEST = 01:30 UTC
        assert_eq!(
            end_instant(&resolve, at("2026-03-29T03:30")),
            Utc.with_ymd_and_hms(2026, 3, 29, 1, 30, 0).unwrap()
        );
    }
}
```

- [ ] **Step 3: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::windows`
Expected: помилка компіляції — `cannot find function 'latest_started_window'` тощо.

- [ ] **Step 4: Реалізувати**

Над `#[cfg(test)] mod tests` додати:

```rust
use chrono::{DateTime, Datelike, Duration, LocalResult, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};

use crate::profile::{ScheduleType, ScheduledRecording};

/// Вікно конкретного входження в наївному локальному календарі (§3.2 крок 1).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OccurrenceWindow {
    pub occurrence: NaiveDateTime,   // номінальний початок (без padding)
    pub window_start: NaiveDateTime, // occurrence − padBefore
    pub window_end: NaiveDateTime,   // occurrence + duration + padAfter
}

/// Друга половина ключа входження (§3.1) і формат nextRun/occurrence (§4).
pub fn occurrence_key(dt: NaiveDateTime) -> String {
    dt.format("%Y-%m-%dT%H:%M").to_string()
}

fn parse_time(s: &ScheduledRecording) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(&s.time, "%H:%M").ok()
}

/// День тижня у форматі моделі §2: 0=Пн..6=Нд.
fn weekday_index(date: NaiveDate) -> u8 {
    date.weekday().num_days_from_monday() as u8
}

fn window_for(s: &ScheduledRecording, date: NaiveDate, time: NaiveTime, pad_before: u32, pad_after: u32) -> OccurrenceWindow {
    let occurrence = NaiveDateTime::new(date, time);
    OccurrenceWindow {
        occurrence,
        window_start: occurrence - Duration::minutes(pad_before as i64),
        window_end: occurrence + Duration::minutes(s.duration_minutes as i64 + pad_after as i64),
    }
}

/// Найсвіжіше входження, чиє вікно ПОЧАЛОСЯ не пізніше `now`
/// (window_start <= now). Прохід B працює саме з ним: воно або активне
/// зараз, або щойно минуло (Missed). Oneshot — з явної дати, без горизонту
/// назад (§3.2 крок 1); recurring — до 7 діб назад. Offset −1 (завтра)
/// потрібен, коли padBefore відкриває завтрашнє вікно ще сьогодні.
pub fn latest_started_window(
    s: &ScheduledRecording,
    pad_before_min: u32,
    pad_after_min: u32,
    now: NaiveDateTime,
) -> Option<OccurrenceWindow> {
    let time = parse_time(s)?;
    match s.schedule_type {
        ScheduleType::Oneshot => {
            let date = NaiveDate::parse_from_str(s.date.as_deref()?, "%Y-%m-%d").ok()?;
            let w = window_for(s, date, time, pad_before_min, pad_after_min);
            (w.window_start <= now).then_some(w)
        }
        ScheduleType::Recurring => {
            for offset in -1..=7i64 {
                let date = now.date() - Duration::days(offset);
                if !s.days.contains(&weekday_index(date)) {
                    continue;
                }
                let w = window_for(s, date, time, pad_before_min, pad_after_min);
                if w.window_start <= now {
                    return Some(w);
                }
            }
            None
        }
    }
}

/// Найближчий номінальний старт строго ПІСЛЯ `now` (для nextRun, §4).
/// Padding не враховується. Вимкнені розклади фільтрує викликач.
pub fn next_run(s: &ScheduledRecording, now: NaiveDateTime) -> Option<NaiveDateTime> {
    let time = parse_time(s)?;
    match s.schedule_type {
        ScheduleType::Oneshot => {
            let date = NaiveDate::parse_from_str(s.date.as_deref()?, "%Y-%m-%d").ok()?;
            let occ = NaiveDateTime::new(date, time);
            (occ > now).then_some(occ)
        }
        ScheduleType::Recurring => (0..=7i64)
            .map(|offset| NaiveDateTime::new(now.date() + Duration::days(offset), time))
            .find(|occ| *occ > now && s.days.contains(&weekday_index(occ.date()))),
    }
}

/// Відображення наївного локального часу на інстант (§3.2): Gap — час не
/// існує (DST уперед) → Missed (ClockChange); Ambiguous — існує двічі (DST
/// назад), беремо ПЕРШЕ входження, щоб window_end не подовжував запис.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalKind {
    Valid(DateTime<Utc>),
    Gap,
    Ambiguous(DateTime<Utc>),
}

/// У проді tz = chrono::Local; у тестах — chrono_tz або фейк.
pub fn resolve_local<Tz: TimeZone>(tz: &Tz, naive: NaiveDateTime) -> LocalKind {
    match tz.from_local_datetime(&naive) {
        LocalResult::Single(dt) => LocalKind::Valid(dt.with_timezone(&Utc)),
        LocalResult::Ambiguous(first, _) => LocalKind::Ambiguous(first.with_timezone(&Utc)),
        LocalResult::None => LocalKind::Gap,
    }
}

/// Інстант кінця вікна, обчислюється ОДИН раз на старті запису (§3.2).
/// Кінець у DST-розриві — екзотика: беремо naive+1h (похибка ≤ розриву).
pub fn end_instant(resolve: &dyn Fn(NaiveDateTime) -> LocalKind, window_end: NaiveDateTime) -> DateTime<Utc> {
    match resolve(window_end) {
        LocalKind::Valid(u) | LocalKind::Ambiguous(u) => u,
        LocalKind::Gap => match resolve(window_end + Duration::hours(1)) {
            LocalKind::Valid(u) | LocalKind::Ambiguous(u) => u,
            // Подвійний розрив не трапляється у реальних TZ — детермінований фолбек
            LocalKind::Gap => Utc.from_utc_datetime(&window_end),
        },
    }
}
```

Примітка: у chrono-tz ідентифікатор — `Europe::Kiev` (історична назва в tz database; alias `Europe/Kyiv` з'явився, але Rust-константа лишилась `Kiev`). Якщо компілятор не знаходить `Kiev`, спробувати `chrono_tz::Europe::Kyiv`.

- [ ] **Step 5: Переконатися, що тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::windows`
Expected: усі ~15 тестів PASS.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/scheduler
git commit -m "feat(scheduler): add pure occurrence window calculation (scheduler::windows)"
```

---

### Task 3: `scheduler::core` — каркас + прохід B (старти, skip, Missed)

State machine §3.1–3.2 без I/O. `tick(ctx, resolver)` повертає `Vec<TickAction>`; shell виконує і відповідає `confirm_start` / `start_failed`. У цьому таску прохід A — порожня заглушка (Task 4 її заповнить).

**Files:**
- Modify: `src-tauri/src/profile.rs` (derive `PartialEq` для `ScheduleResult`)
- Create: `src-tauri/src/scheduler/core.rs`
- Modify: `src-tauri/src/scheduler/mod.rs` (`pub mod core;`)

- [ ] **Step 1: PartialEq для ScheduleResult**

У `profile.rs` на `struct ScheduleResult` замінити derive:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
```

(Потрібен тестам core для порівняння `Fixation`; `Eq` неможливий через відсутність потреби — `PartialEq` досить.)

- [ ] **Step 2: Створити core.rs із типами і failing-тестами проходу B**

`src-tauri/src/scheduler/core.rs`:

```rust
//! Ядро планувальника (§3.1–3.3): чиста state machine без tokio і Tauri.
//! Тік приймає знімок світу (TickCtx) і повертає дії; виконує їх shell
//! (scheduler::timer), повідомляючи результат стартів назад
//! (confirm_start / start_failed). DST інжектиться резолвером.

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Duration, NaiveDateTime, Utc};

use crate::profile::{
    ScheduleResult, ScheduleResultReason, ScheduleResultStatus, ScheduleType, ScheduledRecording,
};
use super::windows::{end_instant, latest_started_window, occurrence_key, LocalKind};

/// Ключ входження (§3.1): (schedule.id, локальний номінальний початок "YYYY-MM-DDTHH:MM").
pub type OccKey = (String, String);

/// Активне входження — запис, який scheduler сам почав (§3.2).
#[derive(Debug, Clone)]
pub struct ActiveOccurrence {
    pub key: OccKey,
    pub stream_id: String,
    /// Власність (§3.3): звіряється зі StreamStatus.session_id.
    pub session_id: u64,
    /// Обчислений ОДИН раз на старті інстант — DST назад не подовжує запис.
    pub window_end_utc: DateTime<Utc>,
    pub started_late: bool,
    pub started_at_utc: DateTime<Utc>,
}

#[derive(Debug, Clone)]
struct LedgerEntry {
    cleanup_after: NaiveDateTime,
}

/// Знімок світу на тік. `statuses`: stream_id → session_id лише для потоків
/// в активному стані (recording / connecting / reconnecting).
pub struct TickCtx<'a> {
    pub now_local: NaiveDateTime, // зрізано до хвилини
    pub now_utc: DateTime<Utc>,
    pub schedules: &'a [ScheduledRecording],
    pub statuses: &'a HashMap<String, u64>,
    pub pad_before_min: u32,
    pub pad_after_min: u32,
}

/// Фіксація результату: shell пише last_result у профіль, персистить і
/// емітить подію (§4). disable_schedule → enabled = false (§3.2 крок 4).
#[derive(Debug, Clone, PartialEq)]
pub struct Fixation {
    pub schedule_id: String,
    pub stream_id: String,
    pub schedule_name: String,
    pub result: ScheduleResult,
    pub disable_schedule: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TickAction {
    /// Прохід A: вікно скінчилося — зупинити запис (власність уже звірено).
    StopRecording { stream_id: String },
    Fix(Fixation),
    /// Прохід B: стартувати запис. Shell ЗОБОВ'ЯЗАНИЙ відповісти
    /// confirm_start або start_failed.
    StartRecording {
        key: OccKey,
        stream_id: String,
        window_end_utc: DateTime<Utc>,
        late: bool,
    },
}

#[derive(Debug, Default)]
pub struct SchedulerCore {
    active: Vec<ActiveOccurrence>,
    /// Завершені входження сесії (§3.1): не перезапускати після ручної
    /// зупинки, гасити DST-повтор, не дублювати Missed.
    ledger: HashMap<OccKey, LedgerEntry>,
    /// Входження з невдалими спробами старту в цій сесії — визначає причину
    /// майбутнього Missed (StartFailed vs AppNotRunning).
    start_attempted: HashSet<OccKey>,
}
```

Тести (в кінець файлу). Резолвер `no_dst` трактує локальний час як UTC — детерміновано і досить для не-DST сценаріїв:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn recurring(id: &str, stream: &str, days: &[u8], time: &str, dur: u32) -> ScheduledRecording {
        ScheduledRecording {
            id: id.into(),
            stream_id: stream.into(),
            name: format!("Schedule {id}"),
            schedule_type: ScheduleType::Recurring,
            days: days.to_vec(),
            date: None,
            time: time.into(),
            duration_minutes: dur,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        }
    }

    fn oneshot(id: &str, stream: &str, date: &str, time: &str, dur: u32) -> ScheduledRecording {
        let mut s = recurring(id, stream, &[], time, dur);
        s.schedule_type = ScheduleType::Oneshot;
        s.date = Some(date.into());
        s
    }

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").unwrap()
    }

    fn utc_of(s: &str) -> DateTime<Utc> {
        Utc.from_utc_datetime(&at(s))
    }

    fn no_dst(n: NaiveDateTime) -> LocalKind {
        LocalKind::Valid(Utc.from_utc_datetime(&n))
    }

    fn busy(pairs: &[(&str, u64)]) -> HashMap<String, u64> {
        pairs.iter().map(|(id, sid)| (id.to_string(), *sid)).collect()
    }

    fn ctx<'a>(
        now: &str,
        schedules: &'a [ScheduledRecording],
        statuses: &'a HashMap<String, u64>,
    ) -> TickCtx<'a> {
        TickCtx {
            now_local: at(now),
            now_utc: utc_of(now),
            schedules,
            statuses,
            pad_before_min: 0,
            pad_after_min: 0,
        }
    }

    fn start_actions(actions: &[TickAction]) -> Vec<&TickAction> {
        actions.iter().filter(|a| matches!(a, TickAction::StartRecording { .. })).collect()
    }

    fn fixations(actions: &[TickAction]) -> Vec<&Fixation> {
        actions.iter().filter_map(|a| match a { TickAction::Fix(f) => Some(f), _ => None }).collect()
    }

    // 2026-06-12 — п'ятниця (день 4)

    // --- Прохід B: старти ---

    #[test]
    fn starts_on_time_not_late() {
        // Хвилинна гранулярність: тік рівно у хвилину start → НЕ StartedLate (§3.2 крок 2)
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T20:00", &schedules, &statuses), &no_dst);
        assert_eq!(actions, vec![TickAction::StartRecording {
            key: ("a".into(), "2026-06-12T20:00".into()),
            stream_id: "st1".into(),
            window_end_utc: utc_of("2026-06-12T21:00"),
            late: false,
        }]);
    }

    #[test]
    fn catch_up_mid_window_is_late() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T20:30", &schedules, &statuses), &no_dst);
        match &actions[..] {
            [TickAction::StartRecording { late, .. }] => assert!(late),
            other => panic!("expected one StartRecording, got {other:?}"),
        }
    }

    #[test]
    fn confirmed_start_blocks_second_start() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let mut core = SchedulerCore::default();
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:00", &schedules, &free), &no_dst);
        let TickAction::StartRecording { key, window_end_utc, late, .. } = actions[0].clone() else { panic!() };
        core.confirm_start(key, "st1".into(), 1, window_end_utc, late, utc_of("2026-06-12T20:00"));
        // Наступний тік: запис живий (наш session_id) → жодних нових дій
        let statuses = busy(&[("st1", 1)]);
        let actions = core.tick(&ctx("2026-06-12T20:01", &schedules, &statuses), &no_dst);
        assert!(actions.is_empty(), "got {actions:?}");
    }

    #[test]
    fn failed_start_retries_next_tick() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T20:00", &schedules, &statuses), &no_dst);
        let TickAction::StartRecording { key, .. } = actions[0].clone() else { panic!() };
        core.start_failed(&key);
        // Декларативна модель: наступний тік повторює спробу (§3.2 крок 2)
        let actions = core.tick(&ctx("2026-06-12T20:01", &schedules, &statuses), &no_dst);
        assert_eq!(start_actions(&actions).len(), 1);
    }

    // --- Прохід B: skip ---

    #[test]
    fn busy_stream_skips_once_per_window() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let mut core = SchedulerCore::default();
        let statuses = busy(&[("st1", 99)]); // чужий запис (ручний)
        let actions = core.tick(&ctx("2026-06-12T20:00", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes.len(), 1);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::SkippedAlreadyRecording);
        assert_eq!(fixes[0].result.occurrence, "2026-06-12T20:00");
        // Конфліктний запис зупинився посеред вікна → плановий все одно НЕ стартує (§8)
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:30", &schedules, &free), &no_dst);
        assert!(actions.is_empty(), "skip фіксується раз на вікно, got {actions:?}");
    }

    // --- Прохід B: Missed ---

    #[test]
    fn missed_without_attempts_is_app_not_running() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T21:30", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes.len(), 1);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::Missed);
        assert_eq!(fixes[0].result.reason, Some(ScheduleResultReason::AppNotRunning));
        assert_eq!(fixes[0].result.recorded_minutes, 0);
        assert!(!fixes[0].disable_schedule, "recurring не вимикається");
        // Повторний тік — без дубля (ledger)
        let actions = core.tick(&ctx("2026-06-12T21:31", &schedules, &statuses), &no_dst);
        assert!(actions.is_empty());
    }

    #[test]
    fn missed_after_failed_attempts_is_start_failed() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T20:30", &schedules, &statuses), &no_dst);
        let TickAction::StartRecording { key, .. } = actions[0].clone() else { panic!() };
        core.start_failed(&key);
        let actions = core.tick(&ctx("2026-06-12T21:00", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.reason, Some(ScheduleResultReason::StartFailed));
    }

    #[test]
    fn expired_oneshot_on_first_tick_missed_and_disabled() {
        // «Tapir довго не запускали»: вікно минуло понад добу тому (§3.2 крок 1, §2)
        let schedules = [oneshot("a", "st1", "2026-06-10", "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T12:00", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::Missed);
        assert_eq!(fixes[0].result.reason, Some(ScheduleResultReason::AppNotRunning));
        assert!(fixes[0].disable_schedule, "oneshot після результату вимикається");
    }

    #[test]
    fn missed_dedup_via_last_result() {
        // Між сесіями: ledger в пам'яті, last_result персиститься (§3.2 крок 3)
        let mut s = recurring("a", "st1", &[4], "20:00", 60);
        s.last_result = Some(ScheduleResult {
            occurrence: "2026-06-12T20:00".into(),
            status: ScheduleResultStatus::Missed,
            reason: Some(ScheduleResultReason::AppNotRunning),
            recorded_minutes: 0,
            finished_at: "2026-06-12T21:01:00".into(),
        });
        let schedules = [s];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T21:30", &schedules, &statuses), &no_dst);
        assert!(actions.is_empty(), "got {actions:?}");
    }

    #[test]
    fn dedup_disables_spent_oneshot_without_overwriting_result() {
        // Oneshot, зупинений при AppClosing, лишився enabled; вікно минуло →
        // вимкнути, НЕ перезаписуючи результат (рішення №2 цього плану)
        let prev = ScheduleResult {
            occurrence: "2026-06-11T20:00".into(),
            status: ScheduleResultStatus::StoppedByUser,
            reason: Some(ScheduleResultReason::AppClosing),
            recorded_minutes: 30,
            finished_at: "2026-06-11T20:30:00".into(),
        };
        let mut s = oneshot("a", "st1", "2026-06-11", "20:00", 60);
        s.last_result = Some(prev.clone());
        let schedules = [s];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T12:00", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes.len(), 1);
        assert!(fixes[0].disable_schedule);
        assert_eq!(fixes[0].result, prev, "результат не перезаписується");
        // і лише один раз
        let actions = core.tick(&ctx("2026-06-12T12:01", &schedules, &statuses), &no_dst);
        assert!(actions.is_empty());
    }

    #[test]
    fn dst_gap_start_is_missed_clock_change() {
        // 2026-03-29 — неділя (день 6); 03:15 у розриві 03:00→04:00
        let schedules = [recurring("a", "st1", &[6], "03:15", 30)];
        let statuses = busy(&[]);
        let gap_resolver = |n: NaiveDateTime| {
            use chrono::Timelike;
            if n.date() == chrono::NaiveDate::from_ymd_opt(2026, 3, 29).unwrap() && n.hour() == 3 {
                LocalKind::Gap
            } else {
                no_dst(n)
            }
        };
        let mut core = SchedulerCore::default();
        // Годинник стрибнув 02:59 → 04:00; вікно [03:15, 03:45) повністю в розриві
        let actions = core.tick(&ctx("2026-03-29T04:00", &schedules, &statuses), &gap_resolver);
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::Missed);
        assert_eq!(fixes[0].result.reason, Some(ScheduleResultReason::ClockChange));
    }
}
```

- [ ] **Step 3: Зареєструвати модуль і переконатися, що тести падають**

У `scheduler/mod.rs` додати `pub mod core;` (перед `validation`).

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::core`
Expected: помилка компіляції — методи `tick`, `confirm_start`, `start_failed` не існують.

- [ ] **Step 4: Реалізувати tick (прохід A — заглушка) і прохід B**

Між типами і тестами додати:

```rust
fn finished_at(now_local: NaiveDateTime) -> String {
    now_local.format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn minutes_between(start: DateTime<Utc>, end: DateTime<Utc>) -> u32 {
    (end - start).num_minutes().max(0) as u32
}

impl SchedulerCore {
    pub fn tick(
        &mut self,
        ctx: &TickCtx,
        resolve: &dyn Fn(NaiveDateTime) -> LocalKind,
    ) -> Vec<TickAction> {
        // Ledger очищається від давно минулих входжень (§3.1, ~48 год)
        self.ledger.retain(|_, e| e.cleanup_after > ctx.now_local);
        let mut actions = Vec::new();
        self.pass_a(ctx, &mut actions);
        self.pass_b(ctx, resolve, &mut actions);
        actions
    }

    /// Записати входження в ledger; спроби стартів більше не потрібні.
    fn remember(&mut self, key: OccKey, now_local: NaiveDateTime) {
        self.start_attempted.remove(&key);
        self.ledger.insert(key, LedgerEntry { cleanup_after: now_local + Duration::hours(48) });
    }

    /// Прохід A (§3.2): активні входження. Task 4.
    fn pass_a(&mut self, _ctx: &TickCtx, _actions: &mut Vec<TickAction>) {}

    /// Прохід B (§3.2): старти й Missed.
    fn pass_b(
        &mut self,
        ctx: &TickCtx,
        resolve: &dyn Fn(NaiveDateTime) -> LocalKind,
        actions: &mut Vec<TickAction>,
    ) {
        for s in ctx.schedules.iter().filter(|s| s.enabled) {
            let Some(w) =
                latest_started_window(s, ctx.pad_before_min, ctx.pad_after_min, ctx.now_local)
            else {
                continue;
            };
            let key: OccKey = (s.id.clone(), occurrence_key(w.occurrence));
            if self.ledger.contains_key(&key) || self.active.iter().any(|a| a.key == key) {
                continue;
            }
            let is_oneshot = s.schedule_type == ScheduleType::Oneshot;

            if w.window_end > ctx.now_local {
                // Вікно активне (крок 2)
                if ctx.statuses.contains_key(&s.stream_id) {
                    // Потік уже пишеться (вручну або іншим розкладом).
                    // Skip фіксується раз на вікно (§8).
                    actions.push(TickAction::Fix(Fixation {
                        schedule_id: s.id.clone(),
                        stream_id: s.stream_id.clone(),
                        schedule_name: s.name.clone(),
                        result: ScheduleResult {
                            occurrence: key.1.clone(),
                            status: ScheduleResultStatus::SkippedAlreadyRecording,
                            reason: None,
                            recorded_minutes: 0,
                            finished_at: finished_at(ctx.now_local),
                        },
                        disable_schedule: is_oneshot,
                    }));
                    self.remember(key, ctx.now_local);
                } else {
                    actions.push(TickAction::StartRecording {
                        key,
                        stream_id: s.stream_id.clone(),
                        window_end_utc: end_instant(resolve, w.window_end),
                        // Хвилинна гранулярність: тік рівно в хвилину start — не Late
                        late: ctx.now_local > w.occurrence,
                    });
                    // ActiveOccurrence з'явиться лише після confirm_start від shell
                }
            } else {
                // Вікно минуло (крок 3) → Missed
                if s.last_result.as_ref().is_some_and(|r| r.occurrence == key.1) {
                    // Дедуплікація між сесіями (ledger живе лише в пам'яті).
                    // Відпрацьований oneshot, що лишився enabled (StoppedByUser
                    // при AppClosing/ProfileSwitch), гаситься тут без
                    // перезапису результату.
                    if is_oneshot {
                        actions.push(TickAction::Fix(Fixation {
                            schedule_id: s.id.clone(),
                            stream_id: s.stream_id.clone(),
                            schedule_name: s.name.clone(),
                            result: s.last_result.clone().expect("checked above"),
                            disable_schedule: true,
                        }));
                    }
                    self.remember(key, ctx.now_local);
                    continue;
                }
                let reason = if matches!(resolve(w.occurrence), LocalKind::Gap) {
                    ScheduleResultReason::ClockChange
                } else if self.start_attempted.contains(&key) {
                    ScheduleResultReason::StartFailed
                } else {
                    ScheduleResultReason::AppNotRunning
                };
                actions.push(TickAction::Fix(Fixation {
                    schedule_id: s.id.clone(),
                    stream_id: s.stream_id.clone(),
                    schedule_name: s.name.clone(),
                    result: ScheduleResult {
                        occurrence: key.1.clone(),
                        status: ScheduleResultStatus::Missed,
                        reason: Some(reason),
                        recorded_minutes: 0,
                        finished_at: finished_at(ctx.now_local),
                    },
                    disable_schedule: is_oneshot,
                }));
                self.remember(key, ctx.now_local);
            }
        }
    }

    /// Shell підтвердив успішний старт (§3.2): входження стає активним.
    pub fn confirm_start(
        &mut self,
        key: OccKey,
        stream_id: String,
        session_id: u64,
        window_end_utc: DateTime<Utc>,
        late: bool,
        now_utc: DateTime<Utc>,
    ) {
        self.start_attempted.remove(&key);
        self.active.push(ActiveOccurrence {
            key,
            stream_id,
            session_id,
            window_end_utc,
            started_late: late,
            started_at_utc: now_utc,
        });
    }

    /// Невдалий старт: нічого не фіксуємо — наступний тік повторить спробу
    /// до кінця вікна (§3.2 крок 2). Факт спроби визначає причину Missed.
    pub fn start_failed(&mut self, key: &OccKey) {
        self.start_attempted.insert(key.clone());
    }
}
```

- [ ] **Step 5: Переконатися, що тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::core`
Expected: усі 10 тестів PASS. Тест `confirmed_start_blocks_second_start` пройде вже зараз: ключ активного входження блокує B навіть із заглушкою A.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (PartialEq нічого не ламає).

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/scheduler src-tauri/src/profile.rs
git commit -m "feat(scheduler): add SchedulerCore with pass B (starts, skip, missed)"
```

---

### Task 4: `scheduler::core` — прохід A (завершення, власність, DST-instant)

Заповнити заглушку `pass_a` (§3.2 прохід A, §3.3 власність).

**Files:**
- Modify: `src-tauri/src/scheduler/core.rs`

- [ ] **Step 1: Додати failing-тести**

У `mod tests` файлу `core.rs` додати:

```rust
    // --- Прохід A ---

    /// Хелпер: стартувати і підтвердити запис розкладу `a` на st1 із session_id 1.
    fn started_core(
        schedules: &[ScheduledRecording],
        start_tick: &str,
    ) -> (SchedulerCore, OccKey) {
        let mut core = SchedulerCore::default();
        let free = busy(&[]);
        let actions = core.tick(&ctx(start_tick, schedules, &free), &no_dst);
        let TickAction::StartRecording { key, stream_id, window_end_utc, late } = actions[0].clone()
        else {
            panic!("expected StartRecording, got {actions:?}");
        };
        core.confirm_start(key.clone(), stream_id, 1, window_end_utc, late, utc_of(start_tick));
        (core, key)
    }

    #[test]
    fn completes_at_window_end() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        let actions = core.tick(&ctx("2026-06-12T21:00", &schedules, &statuses), &no_dst);
        assert_eq!(actions[0], TickAction::StopRecording { stream_id: "st1".into() });
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::Completed);
        assert_eq!(fixes[0].result.recorded_minutes, 60, "wall-clock від старту до зупинки");
        assert_eq!(fixes[0].result.occurrence, "2026-06-12T20:00");
        // Завершене входження в ledger: B не рестартує його в цьому ж вікні
        assert!(core.owned_sessions().is_empty());
    }

    #[test]
    fn late_start_completes_as_started_late() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:30");
        let statuses = busy(&[("st1", 1)]);
        let actions = core.tick(&ctx("2026-06-12T21:00", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::StartedLate);
        assert_eq!(fixes[0].result.recorded_minutes, 30);
    }

    #[test]
    fn oneshot_disabled_after_completion() {
        let schedules = [oneshot("a", "st1", "2026-06-12", "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        let actions = core.tick(&ctx("2026-06-12T21:00", &schedules, &statuses), &no_dst);
        assert!(fixations(&actions)[0].disable_schedule);
    }

    #[test]
    fn foreign_session_is_not_stopped() {
        // Запис обірвався, користувач перезапустив потік вручну (інший session_id):
        // чужий запис не чіпаємо (§3.3); вікно активне, потік зайнятий → Skip
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 99)]);
        let actions = core.tick(&ctx("2026-06-12T20:45", &schedules, &statuses), &no_dst);
        assert!(
            !actions.iter().any(|a| matches!(a, TickAction::StopRecording { .. })),
            "чужий запис не зупиняється, got {actions:?}"
        );
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::SkippedAlreadyRecording);
    }

    #[test]
    fn vanished_recording_restarts_within_window() {
        // Фатальний обрив (reconnect вичерпано): запис зник без stop-команди →
        // НЕ в ledger → той самий тік перезапускає (обрив ≠ скасування, §3.3)
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:10", &schedules, &free), &no_dst);
        assert_eq!(start_actions(&actions).len(), 1, "got {actions:?}");
        assert!(fixations(&actions).is_empty(), "без фіксації");
    }

    #[test]
    fn session_survives_reconnect_and_stops_at_end() {
        // session_id стабільний через reconnect (його не змінює reconnect-цикл
        // manager-а) → у кінці вікна запис зупиняється як свій
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]); // той самий sid після реконектів
        let actions = core.tick(&ctx("2026-06-12T21:05", &schedules, &statuses), &no_dst);
        assert!(actions.iter().any(|a| matches!(a, TickAction::StopRecording { .. })));
    }

    #[test]
    fn dst_backward_does_not_extend_recording() {
        // window_end — інстант: переведення годинника назад під час запису
        // не подовжує його (§3.2). now_local «повернувся» в вікно, now_utc — ні.
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        let tick_ctx = TickCtx {
            now_local: at("2026-06-12T20:30"),       // годинник перевели назад
            now_utc: utc_of("2026-06-12T21:05"),     // реально вікно скінчилось
            schedules: &schedules,
            statuses: &statuses,
            pad_before_min: 0,
            pad_after_min: 0,
        };
        let actions = core.tick(&tick_ctx, &no_dst);
        assert!(actions.iter().any(|a| matches!(a, TickAction::StopRecording { .. })));
    }

    #[test]
    fn dst_backward_no_second_start_after_completion() {
        // Після завершення вікно наївно «збігається вдруге» — ledger гасить (§3.1)
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        core.tick(&ctx("2026-06-12T21:00", &schedules, &statuses), &no_dst); // завершення
        let free = busy(&[]);
        let tick_ctx = TickCtx {
            now_local: at("2026-06-12T20:30"), // повторна година
            now_utc: utc_of("2026-06-12T21:06"),
            schedules: &schedules,
            statuses: &free,
            pad_before_min: 0,
            pad_after_min: 0,
        };
        let actions = core.tick(&tick_ctx, &no_dst);
        assert!(actions.is_empty(), "got {actions:?}");
    }

    #[test]
    fn over_24h_window_second_occurrence_skipped_and_first_stopped_by_pass_a() {
        // duration + padAfter > 1440 хв (§2): вікна сусідніх днів перетинаються.
        // Перше входження завершує прохід A за збереженим window_end, друге → Skip.
        let schedules = [recurring("a", "st1", &[0, 1, 2, 3, 4, 5, 6], "20:00", 1430)];
        let mut core = SchedulerCore::default();
        let free = busy(&[]);
        let mut tick_ctx = ctx("2026-06-12T20:00", &schedules, &free);
        tick_ctx.pad_after_min = 60; // вікно: 20:00 → наступного дня 21:50
        let actions = core.tick(&tick_ctx, &no_dst);
        let TickAction::StartRecording { key, stream_id, window_end_utc, late } = actions[0].clone()
        else { panic!("got {actions:?}") };
        assert_eq!(window_end_utc, utc_of("2026-06-13T21:50"));
        core.confirm_start(key, stream_id, 1, window_end_utc, late, utc_of("2026-06-12T20:00"));

        // Наступного дня о 20:00 потік усе ще пише перше входження → друге Skipped
        let statuses = busy(&[("st1", 1)]);
        let mut tick_ctx = ctx("2026-06-13T20:00", &schedules, &statuses);
        tick_ctx.pad_after_min = 60;
        let actions = core.tick(&tick_ctx, &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes.len(), 1);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::SkippedAlreadyRecording);
        assert_eq!(fixes[0].result.occurrence, "2026-06-13T20:00");
        assert!(!actions.iter().any(|a| matches!(a, TickAction::StopRecording { .. })));

        // Кінець першого вікна обробляє прохід A, а не «найближче вікно» (§3.2)
        let mut tick_ctx = ctx("2026-06-13T21:50", &schedules, &statuses);
        tick_ctx.pad_after_min = 60;
        let actions = core.tick(&tick_ctx, &no_dst);
        assert!(actions.iter().any(|a| matches!(a, TickAction::StopRecording { .. })));
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.occurrence, "2026-06-12T20:00");
        assert_eq!(fixes[0].result.recorded_minutes, 1550);
    }
```

`owned_sessions` ще не існує — додамо мінімальну версію в цьому ж таску (повна роль — Task 5/9).

- [ ] **Step 2: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::core`
Expected: помилка компіляції (`owned_sessions` відсутній), після додавання — падіння тестів проходу A (заглушка нічого не робить).

- [ ] **Step 3: Реалізувати прохід A + owned_sessions**

Замінити заглушку `pass_a`:

```rust
    /// Прохід A (§3.2): активні входження. Зниклий або перезапущений
    /// користувачем запис (інший session_id) прибирається БЕЗ фіксації:
    /// входження не в ledger, тож прохід B перезапустить його в межах вікна.
    /// Кінець вікна — за збереженим інстантом window_end_utc.
    fn pass_a(&mut self, ctx: &TickCtx, actions: &mut Vec<TickAction>) {
        let mut still_active = Vec::new();
        for occ in std::mem::take(&mut self.active) {
            match ctx.statuses.get(&occ.stream_id) {
                None => {}                                // зник сам — без фіксації
                Some(&sid) if sid != occ.session_id => {} // перезапущений — чужий
                Some(_) if ctx.now_utc >= occ.window_end_utc => {
                    let schedule = ctx.schedules.iter().find(|s| s.id == occ.key.0);
                    actions.push(TickAction::StopRecording { stream_id: occ.stream_id.clone() });
                    let status = if occ.started_late {
                        ScheduleResultStatus::StartedLate
                    } else {
                        ScheduleResultStatus::Completed
                    };
                    actions.push(TickAction::Fix(Fixation {
                        schedule_id: occ.key.0.clone(),
                        stream_id: occ.stream_id.clone(),
                        schedule_name: schedule.map(|s| s.name.clone()).unwrap_or_default(),
                        result: ScheduleResult {
                            occurrence: occ.key.1.clone(),
                            status,
                            reason: None,
                            recorded_minutes: minutes_between(occ.started_at_utc, ctx.now_utc),
                            finished_at: finished_at(ctx.now_local),
                        },
                        disable_schedule: schedule
                            .is_some_and(|s| s.schedule_type == ScheduleType::Oneshot),
                    }));
                    self.remember(occ.key.clone(), ctx.now_local);
                }
                Some(_) => still_active.push(occ),
            }
        }
        self.active = still_active;
    }
```

В `impl SchedulerCore` додати:

```rust
    /// (stream_id, session_id) своїх активних записів — для фільтра
    /// active_recording_urls у graceful_shutdown (§3.5).
    pub fn owned_sessions(&self) -> Vec<(String, u64)> {
        self.active.iter().map(|a| (a.stream_id.clone(), a.session_id)).collect()
    }
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::core`
Expected: усі тести Task 3 + 9 нових PASS.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/scheduler/core.rs
git commit -m "feat(scheduler): add SchedulerCore pass A (completion, ownership, DST instant)"
```

---

### Task 5: `scheduler::core` — ручні зупинки, редагування розкладів, drain/reset

Решта чистої логіки: `on_manual_stop` (§3.3), `on_schedule_changed`/`on_schedule_deleted` (§3.5 «редагування розкладу, що зараз пише»), `drain_all`/`reset` (ProfileSwitch / AppClosing), `essential_fields_changed`.

**Files:**
- Modify: `src-tauri/src/scheduler/core.rs`

- [ ] **Step 1: Додати failing-тести**

У `mod tests` файлу `core.rs` додати:

```rust
    // --- Ручна зупинка (§3.3) ---

    #[test]
    fn manual_stop_fixes_and_blocks_restart() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:05");
        let fix = core
            .on_manual_stop("st1", 1, &schedules, at("2026-06-12T20:47"), utc_of("2026-06-12T20:47"))
            .expect("свій запис має зафіксуватись");
        assert_eq!(fix.result.status, ScheduleResultStatus::StoppedByUser);
        assert_eq!(fix.result.reason, Some(ScheduleResultReason::ManualStop));
        assert_eq!(fix.result.recorded_minutes, 42, "wall-clock 20:05 → 20:47");
        // У цьому вікні більше не перезапускати (ledger)
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:48", &schedules, &free), &no_dst);
        assert!(actions.is_empty(), "got {actions:?}");
    }

    #[test]
    fn manual_stop_with_foreign_session_is_ignored() {
        // Зупинили ручний запис, що зайняв потік після обриву планового (§3.3):
        // StoppedByUser НЕ фіксується, catch-up у вікні лишається можливим
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        assert!(core.on_manual_stop("st1", 99, &schedules, at("2026-06-12T20:30"), utc_of("2026-06-12T20:30")).is_none());
        // Планове входження досі активне у core; якщо запис справді зник —
        // наступний тік перезапустить (vanished_recording_restarts_within_window)
        assert_eq!(core.owned_sessions(), vec![("st1".to_string(), 1)]);
    }

    #[test]
    fn manual_stop_oneshot_stays_enabled_for_catch_up() {
        // Рішення №2 плану: oneshot не вимикається при StoppedByUser
        let schedules = [oneshot("a", "st1", "2026-06-12", "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let fix = core.on_manual_stop("st1", 1, &schedules, at("2026-06-12T20:30"), utc_of("2026-06-12T20:30")).unwrap();
        assert!(!fix.disable_schedule);
    }

    // --- Редагування / вимкнення / видалення під час запису (§3.5) ---

    #[test]
    fn schedule_change_stops_and_ledgers_old_key() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        let (stop_stream, fix) = core
            .on_schedule_changed(&schedules[0], &statuses, at("2026-06-12T20:30"), utc_of("2026-06-12T20:30"))
            .expect("активний запис має зупинитись");
        assert_eq!(stop_stream, "st1");
        assert_eq!(fix.result.status, ScheduleResultStatus::StoppedByUser);
        assert_eq!(fix.result.reason, Some(ScheduleResultReason::ScheduleEdited));
        assert!(!fix.disable_schedule, "далі — за новим станом (§3.5)");
        // Повторне увімкнення в тому ж вікні не рестартує (ledger під старим ключем)
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:31", &schedules, &free), &no_dst);
        assert!(actions.is_empty(), "got {actions:?}");
    }

    #[test]
    fn schedule_change_with_foreign_session_only_forgets() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 99)]);
        assert!(core.on_schedule_changed(&schedules[0], &statuses, at("2026-06-12T20:30"), utc_of("2026-06-12T20:30")).is_none());
        assert!(core.owned_sessions().is_empty(), "входження прибране з active");
    }

    #[test]
    fn schedule_delete_returns_stream_to_stop_without_fixation() {
        // «Видалення — просто зупинка (фіксувати нікуди)» (§3.5)
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        assert_eq!(core.on_schedule_deleted("a", &statuses), Some("st1".to_string()));
        assert!(core.owned_sessions().is_empty());
        // Нема активного запису → None
        assert_eq!(core.on_schedule_deleted("a", &statuses), None);
    }

    // --- ProfileSwitch / AppClosing (§3.5) ---

    #[test]
    fn drain_all_fixes_every_owned_recording() {
        let schedules = [
            recurring("a", "st1", &[4], "20:00", 60),
            recurring("b", "st2", &[4], "20:00", 60),
        ];
        let mut core = SchedulerCore::default();
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:00", &schedules, &free), &no_dst);
        for action in actions {
            let TickAction::StartRecording { key, stream_id, window_end_utc, late } = action else { panic!() };
            let sid = if stream_id == "st1" { 1 } else { 2 };
            core.confirm_start(key, stream_id, sid, window_end_utc, late, utc_of("2026-06-12T20:00"));
        }
        let statuses = busy(&[("st1", 1), ("st2", 2)]);
        let fixes = core.drain_all(
            ScheduleResultReason::ProfileSwitch,
            &schedules,
            &statuses,
            at("2026-06-12T20:30"),
            utc_of("2026-06-12T20:30"),
        );
        assert_eq!(fixes.len(), 2);
        for f in &fixes {
            assert_eq!(f.result.status, ScheduleResultStatus::StoppedByUser);
            assert_eq!(f.result.reason, Some(ScheduleResultReason::ProfileSwitch));
            assert_eq!(f.result.recorded_minutes, 30);
        }
        assert!(core.owned_sessions().is_empty());
    }

    #[test]
    fn reset_clears_ledger_for_new_profile() {
        // Після reset стара історія не блокує розклади нового профілю
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        core.tick(&ctx("2026-06-12T21:30", &schedules, &statuses), &no_dst); // Missed → ledger
        core.reset();
        let actions = core.tick(&ctx("2026-06-12T21:31", &schedules, &statuses), &no_dst);
        // Без last_result дедуплікація не спрацює — Missed фіксується знову,
        // що доводить: ledger порожній
        assert_eq!(fixations(&actions).len(), 1);
    }

    // --- essential_fields_changed (§3.5) ---

    #[test]
    fn name_change_is_not_essential() {
        let old = recurring("a", "st1", &[4], "20:00", 60);
        let mut new = old.clone();
        new.name = "Renamed".into();
        new.enabled = false; // enabled теж не суттєве — ним займається toggle
        assert!(!essential_fields_changed(&old, &new));
    }

    #[test]
    fn each_essential_field_triggers() {
        let old = recurring("a", "st1", &[4], "20:00", 60);
        let mut s = old.clone(); s.stream_id = "st2".into();
        assert!(essential_fields_changed(&old, &s));
        let mut s = old.clone(); s.time = "20:01".into();
        assert!(essential_fields_changed(&old, &s));
        let mut s = old.clone(); s.days = vec![0, 4];
        assert!(essential_fields_changed(&old, &s));
        let mut s = old.clone(); s.date = Some("2026-06-14".into());
        assert!(essential_fields_changed(&old, &s));
        let mut s = old.clone(); s.duration_minutes = 61;
        assert!(essential_fields_changed(&old, &s));
    }
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::core`
Expected: помилка компіляції — `on_manual_stop` тощо не існують.

- [ ] **Step 3: Реалізувати**

В `impl SchedulerCore` додати:

```rust
    /// §3.3: спільний хук чотирьох шляхів ручної зупинки. Фіксує
    /// StoppedByUser(ManualStop), ЛИШЕ якщо session_id збігається з активним
    /// входженням; інакше ігнор — зупинили ручний запис, що зайняв потік
    /// (catch-up у вікні має лишитися можливим).
    pub fn on_manual_stop(
        &mut self,
        stream_id: &str,
        session_id: u64,
        schedules: &[ScheduledRecording],
        now_local: NaiveDateTime,
        now_utc: DateTime<Utc>,
    ) -> Option<Fixation> {
        let idx = self
            .active
            .iter()
            .position(|a| a.stream_id == stream_id && a.session_id == session_id)?;
        let occ = self.active.remove(idx);
        self.remember(occ.key.clone(), now_local);
        Some(stopped_by_user_fixation(occ, ScheduleResultReason::ManualStop, schedules, now_local, now_utc))
    }

    /// §3.5: редагування суттєвих полів або toggle-off розкладу, що зараз
    /// пише: зупинка + StoppedByUser(ScheduleEdited) + ledger під СТАРИМ
    /// ключем. Якщо запис уже чужий — лише прибрати з active (None).
    pub fn on_schedule_changed(
        &mut self,
        schedule: &ScheduledRecording,
        statuses: &HashMap<String, u64>,
        now_local: NaiveDateTime,
        now_utc: DateTime<Utc>,
    ) -> Option<(String, Fixation)> {
        let idx = self.active.iter().position(|a| a.key.0 == schedule.id)?;
        let occ = self.active.remove(idx);
        if statuses.get(&occ.stream_id) != Some(&occ.session_id) {
            return None; // запис чужий (перезапущений) — не чіпаємо
        }
        self.remember(occ.key.clone(), now_local);
        let stream_id = occ.stream_id.clone();
        let fix = stopped_by_user_fixation(
            occ,
            ScheduleResultReason::ScheduleEdited,
            std::slice::from_ref(schedule),
            now_local,
            now_utc,
        );
        Some((stream_id, fix))
    }

    /// §3.5: видалення розкладу під час запису — просто зупинка (фіксувати
    /// нікуди, рядок зник). Повертає stream_id, якщо запис ще наш.
    pub fn on_schedule_deleted(
        &mut self,
        schedule_id: &str,
        statuses: &HashMap<String, u64>,
    ) -> Option<String> {
        let idx = self.active.iter().position(|a| a.key.0 == schedule_id)?;
        let occ = self.active.remove(idx);
        (statuses.get(&occ.stream_id) == Some(&occ.session_id)).then_some(occ.stream_id)
    }

    /// §3.5: ProfileSwitch / AppClosing — зафіксувати StoppedByUser(reason)
    /// для всіх своїх живих записів. Викликати ДО stop_all: статуси ще живі.
    /// Самі записи зупиняє викликач (stop_all / stop_all_async).
    pub fn drain_all(
        &mut self,
        reason: ScheduleResultReason,
        schedules: &[ScheduledRecording],
        statuses: &HashMap<String, u64>,
        now_local: NaiveDateTime,
        now_utc: DateTime<Utc>,
    ) -> Vec<Fixation> {
        std::mem::take(&mut self.active)
            .into_iter()
            .filter(|occ| statuses.get(&occ.stream_id) == Some(&occ.session_id))
            .map(|occ| stopped_by_user_fixation(occ, reason.clone(), schedules, now_local, now_utc))
            .collect()
    }

    /// Переключення профілю: ledger і спроби стартів — стан старого профілю.
    pub fn reset(&mut self) {
        self.active.clear();
        self.ledger.clear();
        self.start_attempted.clear();
    }
```

Поряд із `finished_at`/`minutes_between` додати вільні функції:

```rust
/// Спільна фіксація для ManualStop / ScheduleEdited / ProfileSwitch / AppClosing.
fn stopped_by_user_fixation(
    occ: ActiveOccurrence,
    reason: ScheduleResultReason,
    schedules: &[ScheduledRecording],
    now_local: NaiveDateTime,
    now_utc: DateTime<Utc>,
) -> Fixation {
    let schedule = schedules.iter().find(|s| s.id == occ.key.0);
    Fixation {
        schedule_id: occ.key.0.clone(),
        stream_id: occ.stream_id,
        schedule_name: schedule.map(|s| s.name.clone()).unwrap_or_default(),
        result: ScheduleResult {
            occurrence: occ.key.1,
            status: ScheduleResultStatus::StoppedByUser,
            reason: Some(reason),
            recorded_minutes: minutes_between(occ.started_at_utc, now_utc),
            finished_at: finished_at(now_local),
        },
        // Oneshot НЕ вимикаємо (рішення №2 плану): catch-up після
        // рестарту/повернення має лишитися можливим; відпрацьований
        // oneshot гасить дедуп-гілка проходу B.
        disable_schedule: false,
    }
}

/// §3.5: зміна назви запис не перериває; суттєві поля — фіксований перелік.
pub fn essential_fields_changed(old: &ScheduledRecording, new: &ScheduledRecording) -> bool {
    old.stream_id != new.stream_id
        || old.time != new.time
        || old.days != new.days
        || old.date != new.date
        || old.duration_minutes != new.duration_minutes
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::core`
Expected: усі тести Tasks 3–5 PASS (~25 тестів).

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/scheduler/core.rs
git commit -m "feat(scheduler): manual stop, schedule-edit hooks and drain/reset in core"
```

---

### Task 6: Shell `scheduler::timer` + `frontend_ready` + події `scheduled-*`

Imperative shell: tokio-задача тіка (щохвилини, на початку календарної хвилини), застосування `TickAction`, фіксації в профіль (один save на тік), події §4, хуки для команд. Старт — лише після ready-сигналу frontend (§3.5), інакше catch-up першого тіка емітив би `scheduled-started` до підписки webview.

Unit-тестабельні тут лише чисті хелпери (`ms_until_next_minute`, `truncate_to_minute`) — решта потребує AppHandle і покривається ручним сценарієм §7 спеки (Фаза 3).

**Files:**
- Create: `src-tauri/src/scheduler/timer.rs`
- Modify: `src-tauri/src/scheduler/mod.rs` (`pub mod timer;`)
- Modify: `src-tauri/src/app_state.rs` (поле `scheduler`)
- Modify: `src-tauri/src/commands/stream_commands.rs` (`check_disk_space` → `pub(crate)`)
- Create: `src-tauri/src/commands/app_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`, `src/App.tsx`

- [ ] **Step 1: Створити timer.rs із чистими хелперами і failing-тестами**

`src-tauri/src/scheduler/timer.rs`:

```rust
//! Imperative shell планувальника (§3.2, §3.5, §4): tokio-задача тіка,
//! застосування TickAction до StreamManager/профілю, події scheduled-*.
//! Усі рішення приймає core; тут — лише I/O і клей.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use chrono::{NaiveDateTime, Timelike};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::app_state::AppState;
use crate::profile::{ScheduleResultReason, ScheduleResultStatus, ScheduledRecording};
use super::core::{Fixation, SchedulerCore, TickAction, TickCtx};
use super::windows::{resolve_local, LocalKind};

pub struct SchedulerShared {
    pub core: tokio::sync::Mutex<SchedulerCore>,
    started: AtomicBool,
    pub cancel: CancellationToken,
}

impl SchedulerShared {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            core: tokio::sync::Mutex::new(SchedulerCore::default()),
            started: AtomicBool::new(false),
            cancel: CancellationToken::new(),
        })
    }

    /// Старт тік-задачі після ready-сигналу frontend (§3.5). Ідемпотентний:
    /// повторний frontend_ready (перезавантаження webview) — no-op.
    /// Перший тік — на початку наступної календарної хвилини.
    pub fn start(self: &Arc<Self>, app: AppHandle) {
        if self.started.swap(true, Ordering::SeqCst) {
            return;
        }
        let shared = self.clone();
        tauri::async_runtime::spawn(async move {
            log::info!("Scheduler tick loop started");
            loop {
                let wait = ms_until_next_minute(chrono::Local::now().timestamp_millis());
                tokio::select! {
                    _ = shared.cancel.cancelled() => break,
                    _ = tokio::time::sleep(std::time::Duration::from_millis(wait)) => {}
                }
                run_tick(&app).await;
            }
            log::info!("Scheduler tick loop stopped");
        });
    }
}

/// Чиста: мс до початку наступної календарної хвилини.
pub fn ms_until_next_minute(now_ms: i64) -> u64 {
    (60_000 - now_ms.rem_euclid(60_000)) as u64
}

/// Чиста: зріз до хвилини — гранулярність порівнянь §3.2.
pub fn truncate_to_minute(n: NaiveDateTime) -> NaiveDateTime {
    n.with_second(0).and_then(|n| n.with_nanosecond(0)).unwrap_or(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ms_until_next_minute_mid_minute() {
        assert_eq!(ms_until_next_minute(60_000 * 100 + 15_250), 44_750);
    }

    #[test]
    fn ms_until_next_minute_on_boundary_waits_full_minute() {
        assert_eq!(ms_until_next_minute(60_000 * 100), 60_000);
    }

    #[test]
    fn truncate_drops_seconds() {
        let n = NaiveDateTime::parse_from_str("2026-06-12T20:00:59", "%Y-%m-%dT%H:%M:%S").unwrap();
        assert_eq!(
            truncate_to_minute(n),
            NaiveDateTime::parse_from_str("2026-06-12T20:00:00", "%Y-%m-%dT%H:%M:%S").unwrap()
        );
    }
}
```

У `scheduler/mod.rs` додати `pub mod timer;`.

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::timer`
Expected: помилка компіляції (`run_tick` ще не існує) — це і є «failing»; далі дописуємо файл до компільованості.

- [ ] **Step 2: Дописати тік і застосування дій**

Перед `#[cfg(test)]` додати:

```rust
fn local_resolver(n: NaiveDateTime) -> LocalKind {
    resolve_local(&chrono::Local, n)
}

fn now_pair() -> (NaiveDateTime, chrono::DateTime<chrono::Utc>) {
    (truncate_to_minute(chrono::Local::now().naive_local()), chrono::Utc::now())
}

/// Знімок статусів: stream_id → session_id для активних станів
/// (recording / connecting / reconnecting).
async fn active_statuses(state: &AppState) -> HashMap<String, u64> {
    let mgr = state.stream_manager.read().await;
    mgr.get_all_statuses()
        .into_iter()
        .filter(|s| crate::recording_control::is_active(&s.state))
        .map(|s| (s.stream_id, s.session_id))
        .collect()
}

pub async fn run_tick(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (schedules, pad_before, pad_after) = {
        let p = state.active_profile.read().await;
        (
            p.scheduled_recordings.clone(),
            p.recording.schedule_pad_before_min,
            p.recording.schedule_pad_after_min,
        )
    };
    let statuses = active_statuses(&state).await;
    let (now_local, now_utc) = now_pair();

    let actions = {
        let ctx = TickCtx {
            now_local,
            now_utc,
            schedules: &schedules,
            statuses: &statuses,
            pad_before_min: pad_before,
            pad_after_min: pad_after,
        };
        state.scheduler.core.lock().await.tick(&ctx, &local_resolver)
    };

    let mut fixes = Vec::new();
    for action in actions {
        match action {
            TickAction::Fix(f) => fixes.push(f),
            TickAction::StopRecording { stream_id } => {
                log::info!("Scheduler: stopping '{stream_id}' (window end)");
                let _ = state.stream_manager.write().await.stop_recording(&stream_id);
            }
            TickAction::StartRecording { key, stream_id, window_end_utc, late } => {
                let started = try_start(app, &stream_id).await;
                let mut core = state.scheduler.core.lock().await;
                match started {
                    Ok(session_id) => {
                        core.confirm_start(
                            key.clone(), stream_id.clone(), session_id,
                            window_end_utc, late, now_utc,
                        );
                        drop(core);
                        let name = schedules.iter()
                            .find(|s| s.id == key.0)
                            .map(|s| s.name.clone())
                            .unwrap_or_default();
                        log::info!("Scheduler: started '{stream_id}' for schedule '{}' (late: {late})", key.0);
                        app.emit("scheduled-started", ScheduledStartedPayload {
                            recording_id: key.0.clone(),
                            stream_id,
                            name,
                        }).ok();
                    }
                    Err(e) => {
                        // §3.2: нічого не фіксуємо — наступний тік повторить
                        core.start_failed(&key);
                        log::warn!("Scheduler: start failed for schedule '{}': {e} (retry next tick)", key.0);
                    }
                }
            }
        }
    }
    apply_fixations(app, fixes).await;
}

/// Той самий шлях, що й ручний старт (§3.2): check_disk_space НЕ обходиться.
async fn try_start(app: &AppHandle, stream_id: &str) -> Result<u64, String> {
    let state = app.state::<AppState>();
    crate::commands::stream_commands::check_disk_space(&state)
        .await
        .map_err(|e| e.to_string())?;
    let (stream, settings) = {
        let p = state.active_profile.read().await;
        let stream = p.streams.iter().find(|s| s.id == stream_id).cloned()
            .ok_or_else(|| format!("Stream '{stream_id}' not found in active profile"))?;
        (stream, p.recording.clone())
    };
    let mgr_arc = state.stream_manager.clone();
    let mut mgr = mgr_arc.write().await;
    mgr.start_recording(stream, settings, mgr_arc.clone()).map_err(|e| e.to_string())
}

/// Кожна фіксація оновлює last_result і персистить профіль (§3.2 крок 5);
/// save один на пакет. Події — після save. Розклад міг зникнути між тіком
/// і фіксацією (delete) — такі пропускаються мовчки.
pub async fn apply_fixations(app: &AppHandle, fixes: Vec<Fixation>) {
    if fixes.is_empty() {
        return;
    }
    let state = app.state::<AppState>();
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        for f in &fixes {
            if let Some(s) = profile.scheduled_recordings.iter_mut().find(|s| s.id == f.schedule_id) {
                s.last_result = Some(f.result.clone());
                if f.disable_schedule {
                    s.enabled = false;
                }
            }
        }
        profile.clone()
    };
    match tokio::task::spawn_blocking(move || snapshot.save()).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => log::error!("Scheduler: failed to save profile after fixation: {e}"),
        Err(e) => log::error!("Scheduler: profile save task panicked: {e}"),
    }
    for f in &fixes {
        emit_result(app, f);
    }
}

// --- Події §4: розширені payload, live region озвучує без рефетчу ---

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledStartedPayload {
    recording_id: String,
    stream_id: String,
    name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledCompletedPayload {
    recording_id: String,
    stream_id: String,
    name: String,
    status: ScheduleResultStatus, // completed | startedLate | stoppedByUser
    recorded_minutes: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledMissedPayload {
    recording_id: String,
    stream_id: String,
    name: String,
    reason: Option<ScheduleResultReason>, // код — локалізує frontend (§5.6)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledSkippedPayload {
    recording_id: String,
    stream_id: String,
    name: String,
}

/// scheduled-completed емітиться і при StoppedByUser (§4) — інакше панель
/// не оновить результат; frontend для StoppedByUser не озвучує (Фаза 3).
fn emit_result(app: &AppHandle, f: &Fixation) {
    match f.result.status {
        ScheduleResultStatus::Completed
        | ScheduleResultStatus::StartedLate
        | ScheduleResultStatus::StoppedByUser => {
            app.emit("scheduled-completed", ScheduledCompletedPayload {
                recording_id: f.schedule_id.clone(),
                stream_id: f.stream_id.clone(),
                name: f.schedule_name.clone(),
                status: f.result.status.clone(),
                recorded_minutes: f.result.recorded_minutes,
            }).ok();
        }
        ScheduleResultStatus::Missed => {
            // §3.2 крок 3: запис у лог
            log::warn!("Scheduler: missed '{}' ({:?})", f.schedule_name, f.result.reason);
            app.emit("scheduled-missed", ScheduledMissedPayload {
                recording_id: f.schedule_id.clone(),
                stream_id: f.stream_id.clone(),
                name: f.schedule_name.clone(),
                reason: f.result.reason.clone(),
            }).ok();
        }
        ScheduleResultStatus::SkippedAlreadyRecording => {
            app.emit("scheduled-skipped", ScheduledSkippedPayload {
                recording_id: f.schedule_id.clone(),
                stream_id: f.stream_id.clone(),
                name: f.schedule_name.clone(),
            }).ok();
        }
    }
}

// --- Хуки для команд (Tasks 7–9) ---

/// §3.3: спільний хук ручної зупинки. Викликати ПІСЛЯ зчитування session_id
/// (до cancel) і самої зупинки.
pub async fn notify_manual_stop(app: &AppHandle, stream_id: &str, session_id: u64) {
    let state = app.state::<AppState>();
    let schedules = state.active_profile.read().await.scheduled_recordings.clone();
    let (now_local, now_utc) = now_pair();
    let fix = state.scheduler.core.lock().await
        .on_manual_stop(stream_id, session_id, &schedules, now_local, now_utc);
    if let Some(f) = fix {
        log::info!("Scheduler: scheduled recording '{}' stopped by user", f.schedule_name);
        apply_fixations(app, vec![f]).await;
    }
}

/// §3.5: редагування суттєвих полів / toggle-off розкладу під час запису.
pub async fn notify_schedule_changed(app: &AppHandle, schedule: &ScheduledRecording) {
    let state = app.state::<AppState>();
    let statuses = active_statuses(&state).await;
    let (now_local, now_utc) = now_pair();
    let hit = state.scheduler.core.lock().await
        .on_schedule_changed(schedule, &statuses, now_local, now_utc);
    if let Some((stream_id, f)) = hit {
        log::info!("Scheduler: stopping '{stream_id}' (schedule '{}' edited)", schedule.id);
        let _ = state.stream_manager.write().await.stop_recording(&stream_id);
        apply_fixations(app, vec![f]).await;
    }
}

/// §3.5: видалення розкладу під час запису — просто зупинка.
pub async fn notify_schedule_deleted(app: &AppHandle, schedule_id: &str) {
    let state = app.state::<AppState>();
    let statuses = active_statuses(&state).await;
    let stop = state.scheduler.core.lock().await.on_schedule_deleted(schedule_id, &statuses);
    if let Some(stream_id) = stop {
        log::info!("Scheduler: stopping '{stream_id}' (schedule '{schedule_id}' deleted)");
        let _ = state.stream_manager.write().await.stop_recording(&stream_id);
    }
}

/// §3.5: переключення профілю. Викликати ДО stop_all_async і ДО збереження
/// старого профілю — фіксації ProfileSwitch пишуться саме в нього.
pub async fn on_profile_switch(app: &AppHandle) {
    let state = app.state::<AppState>();
    let schedules = state.active_profile.read().await.scheduled_recordings.clone();
    let statuses = active_statuses(&state).await;
    let (now_local, now_utc) = now_pair();
    let fixes = {
        let mut core = state.scheduler.core.lock().await;
        let fixes = core.drain_all(
            ScheduleResultReason::ProfileSwitch, &schedules, &statuses, now_local, now_utc,
        );
        core.reset(); // ledger/спроби — стан старого профілю
        fixes
    };
    apply_fixations(app, fixes).await;
}

/// §3.5: graceful shutdown. Викликати ДО stop_all (статуси ще живі).
/// Зупиняє тік-задачу і фіксує StoppedByUser(AppClosing).
pub async fn on_app_closing(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.scheduler.cancel.cancel();
    let schedules = state.active_profile.read().await.scheduled_recordings.clone();
    let statuses = active_statuses(&state).await;
    let (now_local, now_utc) = now_pair();
    let fixes = state.scheduler.core.lock().await.drain_all(
        ScheduleResultReason::AppClosing, &schedules, &statuses, now_local, now_utc,
    );
    apply_fixations(app, fixes).await;
}
```

- [ ] **Step 3: Підключити AppState, check_disk_space, команду frontend_ready**

`src-tauri/src/app_state.rs` — у struct `AppState` додати поле, у `new` — ініціалізацію:

```rust
    pub scheduler: Arc<crate::scheduler::timer::SchedulerShared>,
```

```rust
            scheduler: crate::scheduler::timer::SchedulerShared::new(),
```

`src-tauri/src/commands/stream_commands.rs`: `async fn check_disk_space` → `pub(crate) async fn check_disk_space` (один токен видимості, тіло без змін).

Створити `src-tauri/src/commands/app_commands.rs`:

```rust
use crate::app_state::AppState;

/// Ready-сигнал webview (§3.5): scheduler стартує лише після нього, інакше
/// catch-up першого тіка емітив би scheduled-started до підписки frontend —
/// втрачене озвучення. Ідемпотентна: повторний виклик — no-op.
#[tauri::command]
pub async fn frontend_ready(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.scheduler.start(app);
    Ok(())
}
```

У `src-tauri/src/commands/mod.rs` додати `pub mod app_commands;`.
У `src-tauri/src/lib.rs` у `generate_handler![...]` додати:

```rust
            commands::app_commands::frontend_ready,
```

- [ ] **Step 4: Прогнати Rust-тести й компіляцію**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS; warnings про невикористані хуки (`notify_*`, `on_profile_switch`) допустимі ДО Tasks 7–9 — якщо компілятор лається, тимчасово ігнорувати, НЕ додавати `#[allow(dead_code)]` (хуки підключаються за два таски).

- [ ] **Step 5: Frontend: обгортка і виклик ready-сигналу**

`src/lib/tauri.ts` — після `toggleSchedule`:

```typescript
/** Ready-сигнал: backend стартує scheduler лише після підписки webview на події. */
export async function frontendReady(): Promise<void> {
  return invoke("frontend_ready");
}
```

`src/App.tsx` — в ефекті «Load initial data» доповнити `.finally()`:

```typescript
    ]).catch(console.error).finally(() => {
      // The window is already visible and OS-foreground (shown from Rust setup —
      // see src-tauri/src/lib.rs) so the webview initialized while foreground,
      // which is what lets NVDA attach to the document. Now that initial data has
      // loaded, move focus to the first nav item; NVDA announces it reliably.
      activityBarZoneRef.current?.focus("forward");
      // Scheduler (Phase 3D §3.5): тік-цикл стартує лише після ready-сигналу,
      // щоб catch-up першого тіка не емітив події до підписки webview.
      tauri.frontendReady().catch(console.error);
    });
```

- [ ] **Step 6: Перевірити гейти**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS
Run: `pnpm test` → PASS; `pnpm vite:build` → успішно.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/scheduler src-tauri/src/app_state.rs src-tauri/src/commands src-tauri/src/lib.rs src/lib/tauri.ts src/App.tsx
git commit -m "feat(scheduler): add tick loop shell, scheduled-* events and frontend_ready"
```

---

### Task 7: `notify_manual_stop` у всіх шляхах ручної зупинки

Спека §3.3 + рішення №1 плану. Шляхи: (1) команда `stop_recording`; (2) команда `stop_all_recordings`; (3) глобальний хоткей toggle-recording (stop-гілка `toggle_all`); (4) глобальний хоткей stop-all; (5) tray-меню «Зупинити всі записи». Шляхи 2–5 уніфікуються через `stop_all_now`, тож хук живе у двох місцях. `remove_stream` і `switch_profile` хук НЕ викликають (спека: осиротілий розклад → Missed(StartFailed); ProfileSwitch — окрема фіксація, Task 9).

Уся семантика вже покрита тестами core (Task 5); тут — лише I/O-клей, верифікація компіляційна + повний прогін тестів.

**Files:**
- Modify: `src-tauri/src/recording_control.rs` (`stop_all_now`, `toggle_all` → `&AppHandle`)
- Modify: `src-tauri/src/shortcuts.rs` (виклики)
- Modify: `src-tauri/src/tray/handlers.rs` (`spawn_stop_all`)
- Modify: `src-tauri/src/commands/stream_commands.rs` (`stop_recording`, `stop_all_recordings`)

- [ ] **Step 1: Переписати `stop_all_now` і `toggle_all` на `&AppHandle`**

У `recording_control.rs` замінити обидві функції (імпорти доповнити `use tauri::{AppHandle, Manager};`):

```rust
/// Stop all active recordings unconditionally; returns how many were active.
/// Єдиний шлях для всіх stop-all поверхонь (IPC-команда, tray, глобальні
/// хоткеї): session_id читаються ДО cancel (§3.3 — після нього записи
/// зникають із manager асинхронно), потім спільний хук notify_manual_stop.
pub async fn stop_all_now(app: &AppHandle) -> usize {
    let state = app.state::<AppState>();
    let active: Vec<(String, u64)> = {
        let mut mgr = state.stream_manager.write().await;
        let active: Vec<(String, u64)> = mgr
            .get_all_statuses()
            .iter()
            .filter(|s| is_active(&s.state))
            .map(|s| (s.stream_id.clone(), s.session_id))
            .collect();
        mgr.stop_all();
        active
    };
    for (stream_id, session_id) in &active {
        crate::scheduler::timer::notify_manual_stop(app, stream_id, *session_id).await;
    }
    active.len()
}

/// Toggle recording for the whole active profile. Reads the manager to decide,
/// then reuses `stop_all_now` / `start_all`. Returns the outcome for the toast.
pub async fn toggle_all(app: &AppHandle) -> ToggleOutcome {
    let state = app.state::<AppState>();
    let active = {
        let mgr = state.stream_manager.read().await;
        count_active(&mgr.get_all_statuses())
    };

    match decide(active) {
        ToggleAction::Stop => ToggleOutcome::Stopped(stop_all_now(app).await),
        ToggleAction::Start => {
            let (streams, settings) = {
                let profile = state.active_profile.read().await;
                (profile.streams.clone(), profile.recording.clone())
            };
            let mgr_arc = state.stream_manager.clone();
            let mut mgr = mgr_arc.write().await;
            let started = mgr.start_all(streams, settings, mgr_arc.clone());
            if started == 0 {
                ToggleOutcome::NothingToStart
            } else {
                ToggleOutcome::Started(started)
            }
        }
    }
}
```

- [ ] **Step 2: Оновити викликачів**

`shortcuts.rs`, гілки `"toggle_recording"` і `"stop_all"` у `handle_shortcut_action`:

```rust
                    let outcome = crate::recording_control::toggle_all(&app).await;
```

```rust
                    let stopped = crate::recording_control::stop_all_now(&app).await;
```

(Локальна змінна `state` в обох гілках більше не потрібна для цих викликів — інші гілки її використовують, лишити як є.)

`tray/handlers.rs::spawn_stop_all` — тіло замінити:

```rust
fn spawn_stop_all(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // П'ятий шлях ручної зупинки (§3.3): та сама точка, що й хоткей stop-all
        let _ = crate::recording_control::stop_all_now(&app).await;
        crate::tray::notify_state_changed(&app);
    });
}
```

(Імпорт `Manager` у handlers.rs уже є; `state` локально не потрібен.)

`stream_commands.rs`:

```rust
#[tauri::command]
pub async fn stop_recording(
    stream_id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // §3.3: session_id читається ДО cancel — після нього запис зникає
    // з manager асинхронно, звіряти було б ні з чим
    let session_id = {
        let manager = state.stream_manager.read().await;
        manager.get_status(&stream_id).map(|s| s.session_id)
    };
    {
        let mut manager = state.stream_manager.write().await;
        manager.stop_recording(&stream_id).map_err(|e| e.to_string())?;
    }
    if let Some(session_id) = session_id {
        crate::scheduler::timer::notify_manual_stop(&app, &stream_id, session_id).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_all_recordings(app: tauri::AppHandle) -> Result<(), String> {
    crate::recording_control::stop_all_now(&app).await;
    Ok(())
}
```

(Параметр `state` у `stop_all_recordings` більше не потрібен — Tauri сам інжектить `AppHandle`; фронтенд-виклик `invoke("stop_all_recordings")` без аргументів не змінюється.)

- [ ] **Step 3: Повний прогін Rust-тестів**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (чисті тести recording_control не зачеплені — `is_active`/`decide`/`count_active` без змін).

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/recording_control.rs src-tauri/src/shortcuts.rs src-tauri/src/tray/handlers.rs src-tauri/src/commands/stream_commands.rs
git commit -m "feat(scheduler): route all manual stop paths through notify_manual_stop"
```

---

### Task 8: `schedule_commands` — реальний `nextRun` + хуки редагування

§4: `nextRun` обчислюється в Rust (frontend лише форматує). §3.5: редагування суттєвих полів / toggle-off зупиняє запис із фіксацією `ScheduleEdited`; видалення — просто зупинка.

**Files:**
- Modify: `src-tauri/src/commands/schedule_commands.rs`

- [ ] **Step 1: Написати failing-тести для dto_for**

У `mod tests` файлу `schedule_commands.rs` додати (`use chrono::NaiveDateTime;` в імпорти тестів):

```rust
    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").unwrap()
    }

    #[test]
    fn dto_computes_next_run_for_enabled() {
        // 2026-06-12 — п'ятниця; valid_input має days [0,2,4] (пн/ср/пт) 20:00
        let mut p = profile_with_stream();
        let schedule = add_schedule_impl(&mut p, valid_input()).unwrap();
        let dto = dto_for(schedule, at("2026-06-12T10:00"));
        assert_eq!(dto.next_run.as_deref(), Some("2026-06-12T20:00"));
    }

    #[test]
    fn dto_next_run_none_when_disabled() {
        let mut p = profile_with_stream();
        let mut schedule = add_schedule_impl(&mut p, valid_input()).unwrap();
        schedule.enabled = false;
        let dto = dto_for(schedule, at("2026-06-12T10:00"));
        assert!(dto.next_run.is_none());
    }

    #[test]
    fn dto_next_run_none_for_past_oneshot() {
        // Будуємо напряму, НЕ через add_schedule_impl: той валідує проти
        // реального Local::now(), і фіксована дата з часом стала б минулою
        let schedule = ScheduledRecording {
            id: "o1".into(),
            stream_id: "st1".into(),
            name: "Once".into(),
            schedule_type: ScheduleType::Oneshot,
            days: vec![],
            date: Some("2026-06-14".into()),
            time: "20:00".into(),
            duration_minutes: 60,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        };
        let dto = dto_for(schedule.clone(), at("2026-06-15T10:00"));
        assert!(dto.next_run.is_none(), "початок у минулому → None, frontend покаже «—»");
        let dto = dto_for(schedule, at("2026-06-12T10:00"));
        assert_eq!(dto.next_run.as_deref(), Some("2026-06-14T20:00"));
    }
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml schedule_commands`
Expected: помилка компіляції — `dto_for` не існує.

- [ ] **Step 3: Реалізувати dto_for і підключити до get_schedules**

У `schedule_commands.rs` (після impl-функцій) додати:

```rust
/// §4: nextRun — ISO локальний datetime "YYYY-MM-DDTHH:MM" наступного
/// номінального старту; None для вимкнених і відпрацьованих oneshot
/// (frontend рендерить «—»). Обчислення — тільки в Rust.
fn dto_for(schedule: ScheduledRecording, now: chrono::NaiveDateTime) -> ScheduleDto {
    let next_run = if schedule.enabled {
        crate::scheduler::windows::next_run(&schedule, now)
            .map(crate::scheduler::windows::occurrence_key)
    } else {
        None
    };
    ScheduleDto { schedule, next_run }
}
```

Команду `get_schedules` переписати:

```rust
#[tauri::command]
pub async fn get_schedules(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScheduleDto>, String> {
    let now = chrono::Local::now().naive_local();
    let profile = state.active_profile.read().await;
    Ok(profile
        .scheduled_recordings
        .iter()
        .cloned()
        .map(|schedule| dto_for(schedule, now))
        .collect())
}
```

Застарілий коментар на `ScheduleDto` («Фаза 1: nextRun завжди None…») замінити на:

```rust
/// Відповідь get_schedules: розклад + обчислюване nextRun
/// ("YYYY-MM-DDTHH:MM", §4; None — вимкнено або oneshot у минулому).
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml schedule_commands`
Expected: PASS (нові 3 + старі 10).

- [ ] **Step 5: Підключити хуки §3.5 до update/toggle/delete**

`update_schedule`: додати параметр `app: tauri::AppHandle`, зберегти старий стан до мутації, після save викликати хук при зміні суттєвих полів:

```rust
#[tauri::command]
pub async fn update_schedule(
    schedule: ScheduledRecording,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ScheduledRecording, String> {
    let (entry, old, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let old = profile.scheduled_recordings.iter().find(|s| s.id == schedule.id).cloned();
        let entry = update_schedule_impl(&mut profile, schedule).map_err(|e| e.to_string())?;
        (entry, old, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    // §3.5: зміна назви запис не перериває; суттєві поля — зупинка
    // з фіксацією StoppedByUser(ScheduleEdited)
    if let Some(old) = old {
        if crate::scheduler::core::essential_fields_changed(&old, &entry) {
            crate::scheduler::timer::notify_schedule_changed(&app, &entry).await;
        }
    }
    Ok(entry)
}
```

`toggle_schedule` замінити цілком:

```rust
#[tauri::command]
pub async fn toggle_schedule(
    id: String,
    enabled: bool,
    app: tauri::AppHandle,
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
    // §3.5: вимкнення під час запису — та сама фіксація (ScheduleEdited) +
    // ledger: повторне увімкнення в тому ж вікні не рестартує
    if !enabled {
        crate::scheduler::timer::notify_schedule_changed(&app, &entry).await;
    }
    Ok(entry)
}
```

`delete_schedule` замінити цілком:

```rust
#[tauri::command]
pub async fn delete_schedule(
    id: String,
    app: tauri::AppHandle,
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
        .map_err(|e| e.to_string())?;
    // §3.5: видалення під час запису — просто зупинка (фіксувати нікуди)
    crate::scheduler::timer::notify_schedule_deleted(&app, &id).await;
    Ok(())
}
```

Frontend-обгортки (`updateSchedule` тощо) не змінюються: `AppHandle` Tauri інжектить сам.

- [ ] **Step 6: Повний прогін Rust-тестів**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/commands/schedule_commands.rs
git commit -m "feat(scheduler): real nextRun in get_schedules and schedule-edit hooks"
```

---

### Task 9: Lifecycle — `switch_profile` і `graceful_shutdown`

§3.5: переключення профілю фіксує `StoppedByUser(ProfileSwitch)` у СТАРИЙ профіль і скидає ledger; shutdown фіксує `AppClosing`, зупиняє тік-задачу і фільтрує `active_recording_urls` від scheduler-owned записів (відновлення планових — виключно через catch-up). Статуси читаються ДО `stop_all` (рішення №7 плану — зараз код читає після, покладаючись на асинхронність зникнення).

**Files:**
- Modify: `src-tauri/src/app_state.rs` (`graceful_shutdown` + чиста `manual_resume_urls` + тести)
- Modify: `src-tauri/src/commands/profile_commands.rs` (`switch_profile`)

- [ ] **Step 1: Написати failing-тести для `manual_resume_urls`**

В кінець `app_state.rs` додати:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::StreamInfo;
    use crate::stream::manager::StreamStatus;

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
    fn scheduler_owned_recordings_are_excluded_from_resume() {
        // §3.5: планові записи не потрапляють в active_recording_urls —
        // інакше після рестарту вони стали б «нічийними» і не зупинились би
        let statuses = [
            status("manual", StreamState::Recording, 1),
            status("planned", StreamState::Recording, 2),
        ];
        let owned = [("planned".to_string(), 2u64)];
        let streams = [stream("manual", "http://m"), stream("planned", "http://p")];
        assert_eq!(manual_resume_urls(&statuses, &owned, &streams), vec!["http://m".to_string()]);
    }

    #[test]
    fn same_stream_with_other_session_is_manual() {
        // Пара (stream_id, session_id): якщо плановий запис обірвався і потік
        // зайняв ручний запис (інший session) — він має відновитися
        let statuses = [status("st1", StreamState::Recording, 5)];
        let owned = [("st1".to_string(), 2u64)]; // застаріла пара scheduler-а
        let streams = [stream("st1", "http://x")];
        assert_eq!(manual_resume_urls(&statuses, &owned, &streams), vec!["http://x".to_string()]);
    }

    #[test]
    fn idle_and_error_states_are_not_resumed() {
        let statuses = [
            status("a", StreamState::Idle, 1),
            status("b", StreamState::Error, 2),
            status("c", StreamState::Connecting, 3),
            status("d", StreamState::Reconnecting, 4),
        ];
        let streams = [stream("a", "ua"), stream("b", "ub"), stream("c", "uc"), stream("d", "ud")];
        assert_eq!(manual_resume_urls(&statuses, &[], &streams), vec!["uc".to_string(), "ud".to_string()]);
    }

    #[test]
    fn unknown_stream_id_is_skipped() {
        // Статус без відповідного StreamInfo (потік видалили) — без URL
        let statuses = [status("ghost", StreamState::Recording, 1)];
        assert!(manual_resume_urls(&statuses, &[], &[]).is_empty());
    }
}
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml app_state`
Expected: помилка компіляції — `manual_resume_urls` не існує.

- [ ] **Step 3: Переписати `graceful_shutdown` + додати хелпер**

В `app_state.rs` замінити `graceful_shutdown` цілком (імпорт `StreamState` уже є; додати `use crate::stream::manager::StreamStatus;` до верхніх імпортів):

```rust
/// Stop all recordings, save active URLs, stop player, save volume,
/// then briefly wait for in-flight tasks. Used by close-button shutdown
/// (when minimize_to_tray is false) and by tray "Quit".
pub async fn graceful_shutdown(app: &AppHandle) {
    let state = app.state::<AppState>();

    // Статуси і scheduler-owned пари — ДО stop_all (§3.5): після скасування
    // записи зникають із manager асинхронно, фільтрувати було б ні по чому.
    let statuses = state.stream_manager.read().await.get_all_statuses();
    let scheduler_owned = state.scheduler.core.lock().await.owned_sessions();

    // Зупинити тік-задачу і зафіксувати StoppedByUser(AppClosing) для своїх
    // записів (пише last_result + save + подія scheduled-completed).
    crate::scheduler::timer::on_app_closing(app).await;

    state.stream_manager.write().await.stop_all();

    // active_recording_urls — лише ручні записи: відновлення планових
    // після рестарту — виключно через catch-up (§3.5).
    let urls = {
        let profile = state.active_profile.read().await;
        manual_resume_urls(&statuses, &scheduler_owned, &profile.streams)
    };

    let mut profile = state.active_profile.write().await;
    profile.active_recording_urls = urls;
    if let Err(e) = profile.save() {
        log::error!("Failed to save profile on shutdown: {e}");
    }
    drop(profile);

    state.player.stop_session_public().await;
    let volume = state.player.current_volume().await;
    let mut profile = state.active_profile.write().await;
    profile.player_session.volume = volume;
    if let Err(e) = profile.save() {
        log::error!("Failed to save profile volume on shutdown: {e}");
    }
    drop(profile);

    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
}

/// Чиста (§3.5): URL-и активних НЕпланових записів для відновлення після
/// рестарту. Scheduler-owned визначається парою (stream_id, session_id) —
/// сам stream_id недостатній: потік міг перейти до ручного запису.
pub fn manual_resume_urls(
    statuses: &[StreamStatus],
    scheduler_owned: &[(String, u64)],
    streams: &[crate::profile::StreamInfo],
) -> Vec<String> {
    statuses
        .iter()
        .filter(|s| !matches!(s.state, StreamState::Idle | StreamState::Error))
        .filter(|s| {
            !scheduler_owned
                .iter()
                .any(|(id, sid)| *id == s.stream_id && *sid == s.session_id)
        })
        .filter_map(|s| streams.iter().find(|st| st.id == s.stream_id).map(|st| st.url.clone()))
        .collect()
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `cargo test --manifest-path src-tauri/Cargo.toml app_state`
Expected: 4 нових тести PASS.

- [ ] **Step 5: Хук у `switch_profile`**

У `profile_commands.rs::switch_profile` одразу після блоку «Step 1: no-op if already active» (перед «Steps 3-5: stop recordings…») додати:

```rust
    // Phase 3D §3.5: зафіксувати StoppedByUser(ProfileSwitch) у СТАРИЙ профіль
    // і скинути ledger/активні входження ДО зупинки записів (статуси ще живі).
    // Confirm-діалог — Фаза 3; поки що переключення зупиняє без підтвердження.
    crate::scheduler::timer::on_profile_switch(&app).await;
```

Примітка: подальший крок 6-7 (`active_recording_urls = vec![]`) затирає список у старому профілі вже ПІСЛЯ фіксацій — порядок коректний, нічого не міняти.

- [ ] **Step 6: Повний прогін Rust-тестів**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS; warnings про невикористані функції scheduler-а зникли (всі хуки підключені).

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/app_state.rs src-tauri/src/commands/profile_commands.rs
git commit -m "feat(scheduler): profile-switch and shutdown lifecycle with resume-url filter"
```

---

### Task 10: Документація + фінальний прогін gates

Спека вимагає синхронного оновлення data-models.md (§4 «Runtime-only типи» — `sessionId`; §5 «IPC Event Payloads» — розширені payload `scheduled-*`) і лінк плану в §9.

**Files:**
- Modify: `docs/data-models.md` (§4.1 ~рядки 652–706, §5 ~рядки 894–904)
- Modify: `docs/superpowers/specs/2026-06-12-scheduler-design.md` (§9, блок «Плани»)

- [ ] **Step 1: §4.1 StreamStatus**

У TS-блоці §4.1 після `reconnectAttempt: number | null;` додати:

```typescript
  sessionId: number;            // стабільний id сесії запису; reconnect не змінює (Phase 3D §3.3)
```

У Rust-блоці §4.1 після `pub reconnect_attempt: Option<u32>,` додати:

```rust
    pub session_id: u64,
```

- [ ] **Step 2: §5 події scheduled-***

Блок (~рядки 894–904):

```typescript
// scheduled-started / scheduled-completed
interface ScheduledEventPayload {
  recordingId: string;
  streamId: string;
}

// scheduled-missed
interface ScheduledMissedPayload {
  recordingId: string;
  reason: string;
}
```

замінити на:

```typescript
// scheduled-started / scheduled-skipped (Phase 3D §4)
interface ScheduledEventPayload {
  recordingId: string;          // ScheduledRecording.id
  streamId: string;
  name: string;                 // мітка розкладу — live region озвучує без рефетчу
}

// scheduled-completed: і в кінці вікна, і при StoppedByUser
interface ScheduledCompletedPayload {
  recordingId: string;
  streamId: string;
  name: string;
  status: "completed" | "startedLate" | "stoppedByUser";
  recordedMinutes: number;
}

// scheduled-missed
interface ScheduledMissedPayload {
  recordingId: string;
  streamId: string;
  name: string;
  reason: ScheduleResultReason | null;  // код — локалізує frontend (§5.6 спеки)
}
```

- [ ] **Step 3: Лінк плану в спеці**

У `docs/superpowers/specs/2026-06-12-scheduler-design.md` замінити:

```markdown
- Фаза 2: _план ще не написано_
```

на:

```markdown
- Фаза 2: [2026-06-12-scheduler-phase-2-core.md](../plans/2026-06-12-scheduler-phase-2-core.md)
```

- [ ] **Step 4: Повний прогін усіх gates**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
pnpm vite:build
```

Expected: усі три зелені. Якщо щось червоне — виправити до коміту.

- [ ] **Step 5: Commit**

```powershell
git add docs/data-models.md docs/superpowers/specs/2026-06-12-scheduler-design.md
git commit -m "docs(scheduler): sessionId, scheduled-* payloads, link Phase 2 plan"
```

---

## Смоук-перевірка вручну (опційно, без NVDA-сценарію — він у Фазі 3)

`just dev`, створити розклад на now+2 хв тривалістю 2 хв (через devtools: `window.__TAURI__` або тимчасово через `add_schedule` у консолі) → у лозі: `Scheduler tick loop started`, через ~2 хв `Scheduler: started ...`, ще через 2 хв `Scheduler: stopping ... (window end)`; у профілі (`data/profiles/*.tapirprofile`) — `lastResult` зі статусом `completed`. Це не gate, лише рання валідація клею.

## Поза скоупом Фази 2 (НЕ реалізовувати)

- UI: SchedulePanel/ScheduleTable/ScheduleForm, store `src/stores/schedule.ts`, група «Планувальник» у Settings, live region, balloon tips, Paraglide-рядки — Фаза 3.
- Confirm-діалоги при переключенні профілю / закритті з активним плановим записом — Фаза 3 (поки що зупинка без підтвердження).
- Слухачі подій `scheduled-*` на frontend і TS-типи їх payload-ів — Фаза 3 (разом зі store).
- Wake-from-sleep, Windows Task Scheduler, per-schedule padding, `%schedule%` у шаблонах, tray-пункт «наступний плановий запис» — backlog спеки (§1).
