# KB-12: Глобальний stop_all (`Ctrl+Shift+S`) — план імплементації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OS-глобальний конфігуровний хоткей `Ctrl+Shift+S`, що зупиняє весь активний запис і показує NVDA-readable тост.

**Architecture:** Дзеркало KB-01: нове поле `stop_all` у `HotkeyMap` (з per-field serde-default для міграції старих settings.json), чиста оркестрація `stop_all_now()` у `recording_control`, тост `notify_stop_all` у `tray/notify`, реєстрація + дебаунс у `shortcuts.rs`. Фронтенд: рядок у Settings → Hotkeys через `HOTKEY_FIELDS` (валідація/auto-save/reset підхоплюються автоматично).

**Tech Stack:** Tauri 2 (Rust: tauri-plugin-global-shortcut, tauri-plugin-notification, serde), React + nanostores + react-aria, vitest + @testing-library/react, paraglide i18n (регенерація через vite-плагін).

**Спека:** [2026-06-10-kb12-global-stop-all-design.md](../specs/2026-06-10-kb12-global-stop-all-design.md)
**Гілка:** `feature/kb-12-new-global-shortcuts`

**Гейти якості (з memory/CLAUDE):** `pnpm test` + `pnpm vite:build` (НЕ `tsc` — там ~51 наявна помилка через нетипізований paraglide) + `cargo test` у `src-tauri`.

---

### Task 1: `HotkeyMap.stop_all` + serde-міграція

**Files:**
- Modify: `src-tauri/src/settings.rs:105-125` (струкура + Default), `:188+` (tests)

- [ ] **Step 1: Написати падаючі тести**

У `mod tests` ([settings.rs:188](../../../src-tauri/src/settings.rs#L188)) додати:

```rust
#[test]
fn default_stop_all_combo() {
    assert_eq!(HotkeyMap::default().stop_all, "Ctrl+Shift+S");
}

#[test]
fn hotkeys_object_without_stop_all_still_loads() {
    // A settings.json written before KB-12 has a `hotkeys` object with five
    // fields. It must deserialize, the new field gets its default, and the
    // user's customized combos survive.
    let json = r#"{ "hotkeys": {
        "toggleRecording": "Ctrl+Shift+R",
        "togglePlayback": "Ctrl+Shift+P",
        "volumeUp": "Ctrl+Shift+Up",
        "volumeDown": "Ctrl+Shift+Down",
        "toggleWindow": "Ctrl+Alt+J"
    } }"#;
    let settings: GlobalSettings = serde_json::from_str(json).unwrap();
    assert_eq!(settings.hotkeys.stop_all, "Ctrl+Shift+S");
    assert_eq!(settings.hotkeys.toggle_window, "Ctrl+Alt+J");
}
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml settings::tests`
Expected: compile error — `no field stop_all on HotkeyMap`.

- [ ] **Step 3: Імплементація**

Замінити `HotkeyMap` + `Default` ([settings.rs:105-125](../../../src-tauri/src/settings.rs#L105-L125)) на:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyMap {
    // Per-field defaults: an old settings.json whose `hotkeys` object predates
    // a field must still deserialize (missing field → default combo), without
    // discarding the user's other customized combos.
    #[serde(default = "default_hk_toggle_recording")]
    pub toggle_recording: String,
    #[serde(default = "default_hk_toggle_playback")]
    pub toggle_playback: String,
    #[serde(default = "default_hk_volume_up")]
    pub volume_up: String,
    #[serde(default = "default_hk_volume_down")]
    pub volume_down: String,
    #[serde(default = "default_hk_toggle_window")]
    pub toggle_window: String,
    #[serde(default = "default_hk_stop_all")]
    pub stop_all: String,
}

fn default_hk_toggle_recording() -> String { "Ctrl+Shift+R".to_string() }
fn default_hk_toggle_playback() -> String { "Ctrl+Shift+P".to_string() }
fn default_hk_volume_up() -> String { "Ctrl+Shift+Up".to_string() }
fn default_hk_volume_down() -> String { "Ctrl+Shift+Down".to_string() }
fn default_hk_toggle_window() -> String { "Ctrl+Shift+H".to_string() }
fn default_hk_stop_all() -> String { "Ctrl+Shift+S".to_string() }

impl Default for HotkeyMap {
    fn default() -> Self {
        Self {
            toggle_recording: default_hk_toggle_recording(),
            toggle_playback: default_hk_toggle_playback(),
            volume_up: default_hk_volume_up(),
            volume_down: default_hk_volume_down(),
            toggle_window: default_hk_toggle_window(),
            stop_all: default_hk_stop_all(),
        }
    }
}
```

(Комбо-літерали живуть лише у `default_hk_*` — `Default` збирається з них, нуль дублювання.)

- [ ] **Step 4: Тести зелені**

Run: `cargo test --manifest-path src-tauri/Cargo.toml settings::tests`
Expected: PASS (нові 2 + наявні).
Примітка: решта крейта ще не компілюється далі по плану — якщо `shortcuts.rs` поки не чіпали, все збирається, бо нове поле ніхто не читає.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat(settings): stop_all hotkey field with per-field serde defaults (KB-12)"
```

---

### Task 2: `recording_control::stop_all_now`

**Files:**
- Modify: `src-tauri/src/recording_control.rs` (нова fn + DRY гілки Stop у `toggle_all`)

- [ ] **Step 1: Імплементація** (оркестрація над уже покритими чистими помічниками; юніт-тести не додаємо — `count_active` покритий, менеджер інтеграційний, як у KB-01)

Додати після `decide`:

```rust
/// Stop all active recordings unconditionally; returns how many were active.
/// Used by the global `stop_all` shortcut (KB-12): unlike `toggle_all` it can
/// never start anything, so it is safe to mash.
pub async fn stop_all_now(state: &AppState) -> usize {
    let mut mgr = state.stream_manager.write().await;
    let stopped = count_active(&mgr.get_all_statuses());
    mgr.stop_all();
    stopped
}
```

Гілку Stop у `toggle_all` ([recording_control.rs:64-69](../../../src-tauri/src/recording_control.rs#L64-L69)) замінити на виклик:

```rust
        ToggleAction::Stop => ToggleOutcome::Stopped(stop_all_now(state).await),
```

- [ ] **Step 2: Тести/компіляція зелені**

Run: `cargo test --manifest-path src-tauri/Cargo.toml recording_control`
Expected: PASS (наявні 5 тестів модуля).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/recording_control.rs
git commit -m "feat(recording): stop_all_now orchestration, reused by toggle_all (KB-12)"
```

---

### Task 3: Тост `notify_stop_all`

**Files:**
- Modify: `src-tauri/src/tray/notify.rs` (нова pure fn + тост-fn + тести)

- [ ] **Step 1: Написати падаючі тести**

У `mod tests` ([notify.rs:176](../../../src-tauri/src/tray/notify.rs#L176)):

```rust
#[test]
fn stop_all_toast_body_with_streams() {
    assert_eq!(stop_all_toast_body(1), "Запис зупинено: 1 потік");
    assert_eq!(stop_all_toast_body(3), "Запис зупинено: 3 потоки");
    assert_eq!(stop_all_toast_body(5), "Запис зупинено: 5 потоків");
}

#[test]
fn stop_all_toast_body_when_idle() {
    assert_eq!(stop_all_toast_body(0), "Запис не йшов");
}
```

- [ ] **Step 2: Переконатися, що падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tray::notify`
Expected: compile error — `stop_all_toast_body not found`.

- [ ] **Step 3: Імплементація**

Після `notify_recording_toggle` ([notify.rs:155-174](../../../src-tauri/src/tray/notify.rs#L155-L174)) додати:

```rust
/// Body for the stop-all toast. `0` is not "stopped 0 streams" — recording
/// simply wasn't running, and the silent no-op is unacceptable for NVDA.
fn stop_all_toast_body(stopped: usize) -> String {
    if stopped > 0 {
        format!("Запис зупинено: {stopped} {}", plural_streams(stopped))
    } else {
        "Запис не йшов".to_string()
    }
}

/// Show the NVDA-readable toast for the global stop-all shortcut (KB-12).
///
/// Like `notify_recording_toggle`: intentionally bypasses
/// `show_tray_notifications` (sole feedback for a backgrounded hotkey) and is
/// synchronous — the shortcut handler calls it from a spawned task.
pub fn notify_stop_all(app: &tauri::AppHandle, stopped: usize) {
    let body = stop_all_toast_body(stopped);
    log::info!("notify_stop_all: {body:?}");
    if let Err(e) = app
        .notification()
        .builder()
        .title("Tapir")
        .body(&body)
        .show()
    {
        log::warn!("notify_stop_all: failed to show toast: {e}");
    }
}
```

- [ ] **Step 4: Тести зелені**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tray::notify`
Expected: PASS (2 нові + 3 наявні plural-тести). `notify_stop_all` поки dead code — це ок до Task 4 (можливий warn).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tray/notify.rs
git commit -m "feat(notify): NVDA toast for global stop-all (KB-12)"
```

---

### Task 4: Реєстрація шортката + дебаунс у `shortcuts.rs`

**Files:**
- Modify: `src-tauri/src/shortcuts.rs` (combos, узагальнений дебаунс, гілка handler, тести)

- [ ] **Step 1: Написати падаючий тест дебаунс-хелпера**

У кінці `shortcuts.rs` (модуля тестів ще немає — створити):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recently_fired_debounces_second_call() {
        static CELL: AtomicU64 = AtomicU64::new(0);
        assert!(!recently_fired(&CELL), "first call must pass");
        assert!(recently_fired(&CELL), "immediate repeat must be debounced");
    }
}
```

- [ ] **Step 2: Переконатися, що падає**

Run: `cargo test --manifest-path src-tauri/Cargo.toml shortcuts`
Expected: compile error — `recently_fired not found`.

- [ ] **Step 3: Імплементація**

Замінити блок дебаунсу ([shortcuts.rs:48-67](../../../src-tauri/src/shortcuts.rs#L48-L67)) на узагальнений (та сама CAS-логіка, параметризований лічильник — окремий на дію, щоб «R → ой → S» за пів секунди не ковтався):

```rust
static LAST_TOGGLE_RECORDING_MS: AtomicU64 = AtomicU64::new(0);
static LAST_STOP_ALL_MS: AtomicU64 = AtomicU64::new(0);
const SHORTCUT_DEBOUNCE_MS: u64 = 500;

/// True if the action behind `last` already fired within the debounce window.
/// Swallows OS key auto-repeat so a held combo can't flap the action. Each
/// action gets its own cell: debouncing one must not swallow another.
fn recently_fired(last: &AtomicU64) -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let prev = last.load(Ordering::Relaxed);
    if now.saturating_sub(prev) < SHORTCUT_DEBOUNCE_MS {
        return true;
    }
    // CAS so two near-simultaneous fires can't both pass: only one caller wins
    // the swap; the loser is treated as a repeat (returns true → debounced).
    last.compare_exchange(prev, now, Ordering::Relaxed, Ordering::Relaxed)
        .is_err()
}
```

У масив `combos` ([shortcuts.rs:18-24](../../../src-tauri/src/shortcuts.rs#L18-L24)) додати рядок:

```rust
        (&hotkeys.stop_all, "stop_all"),
```

У `handle_shortcut_action`: гілку `"toggle_recording"` перевести на хелпер і додати `"stop_all"`:

```rust
            "toggle_recording" => {
                if recently_fired(&LAST_TOGGLE_RECORDING_MS) {
                    debug!("Global shortcut: toggle_recording ignored (debounce)");
                } else {
                    let outcome = crate::recording_control::toggle_all(state.inner()).await;
                    info!("Global shortcut: toggle_recording → {outcome:?}");
                    crate::tray::notify::notify_recording_toggle(&app, outcome);
                }
            }
            "stop_all" => {
                if recently_fired(&LAST_STOP_ALL_MS) {
                    debug!("Global shortcut: stop_all ignored (debounce)");
                } else {
                    let stopped = crate::recording_control::stop_all_now(state.inner()).await;
                    info!("Global shortcut: stop_all → stopped {stopped}");
                    crate::tray::notify::notify_stop_all(&app, stopped);
                }
            }
```

(Стару `recently_toggled_recording` і `TOGGLE_RECORDING_DEBOUNCE_MS` видалити.)

- [ ] **Step 4: Всі Rust-тести зелені**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, без warnings про dead code у notify.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/shortcuts.rs
git commit -m "feat(shortcuts): global stop_all action with per-action debounce (KB-12)"
```

---

### Task 5: Фронтенд — тип, i18n, рядок у Settings → Hotkeys

**Files:**
- Modify: `src/lib/tauri.ts:62-68` (тип `HotkeyMap`)
- Modify: `src/i18n/messages/en.json:243+`, `src/i18n/messages/uk.json:243+`
- Modify: `src/components/settings/HotkeysTab.tsx:12-18` (`HOTKEY_FIELDS`)
- Modify: `src/components/settings/HotkeysTab.test.tsx` (мок/фікстура + 2 нові тести)
- Modify: `src/components/settings/AudioTab.test.tsx:33`, `src/components/streams/StreamList.test.tsx:51`, `src/components/player/PlayerPanel.test.tsx:22` (фікстури `hotkeys`)

- [ ] **Step 1: i18n-ключі**

В `en.json` після рядка 243 (`"settings_hotkey_toggle_window"`):

```json
  "settings_hotkey_stop_all": "Stop all recording",
```

В `uk.json` після відповідного рядка 243:

```json
  "settings_hotkey_stop_all": "Зупинити весь запис",
```

- [ ] **Step 2: Регенерувати paraglide**

Run: `pnpm vite:build`
Expected: успішна збірка; `src/i18n/paraglide/messages` тепер містить `settings_hotkey_stop_all`. (Регенерація йде через vite-плагін — інакше тести не побачать новий ключ.)

- [ ] **Step 3: Написати падаючі тести**

У [HotkeysTab.test.tsx](../../../src/components/settings/HotkeysTab.test.tsx):

1. Мок `defaultHotkeys` (рядки 13-19) і `baseSettings.hotkeys` (рядки 36-42) доповнити полем:

```ts
    stopAll: "Ctrl+Shift+S",   // у моку defaultHotkeys
    stopAll: "",               // у baseSettings.hotkeys
```

2. Нові тести в кінці файлу:

```tsx
describe("HotkeysTab — global stop_all (KB-12)", () => {
  it("renders a recorder row for the stop-all hotkey", () => {
    const { getByRole } = render(<HotkeysTab />);
    const label = m.settings_hotkey_stop_all();
    expect(
      getByRole("button", { name: (name: string) => name.startsWith(label) }),
    ).toBeInTheDocument();
  });

  it("rejects a combo already taken by stop_all as a duplicate", () => {
    $settings.set({
      ...baseSettings,
      hotkeys: { ...baseSettings.hotkeys, stopAll: "Ctrl+Shift+J" },
    });
    const { getByRole } = render(<HotkeysTab />);
    const button = recordButton(getByRole);
    fireEvent.click(button); // arm the recorder
    fireEvent.keyDown(button, { code: "KeyJ", key: "j", ctrlKey: true, shiftKey: true });

    expect(getByRole("alert")).toHaveTextContent(
      m.settings_hotkey_duplicate({ action: m.settings_hotkey_stop_all() }),
    );
    expect($settings.get()?.hotkeys.toggleRecording).toBe("");
  });
});
```

- [ ] **Step 4: Переконатися, що падають**

Run: `pnpm test -- HotkeysTab`
Expected: FAIL — немає рядка з лейблом stop-all; дублікатний тест не знаходить alert (поле `stopAll` ще не у `HOTKEY_FIELDS`).

- [ ] **Step 5: Імплементація**

`src/lib/tauri.ts` — у `interface HotkeyMap` після `toggleWindow`:

```ts
  stopAll: string;
```

`HotkeysTab.tsx` — у `HOTKEY_FIELDS` після `toggleWindow`-рядка:

```ts
  { key: "stopAll", label: () => m.settings_hotkey_stop_all() },
```

Фікстури `hotkeys` в `AudioTab.test.tsx:33`, `StreamList.test.tsx:51`, `PlayerPanel.test.tsx:22` доповнити `stopAll: ""` (рантайм не зламався б, але фікстури мають відповідати типу).

- [ ] **Step 6: Тести зелені**

Run: `pnpm test`
Expected: PASS — всі сьюти, включно з двома новими тестами (валідація дублікатів і reset-to-defaults підхоплюють нове поле автоматично, бо ітерують `HOTKEY_FIELDS`/`HotkeyMap::default()`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/tauri.ts src/i18n/messages/en.json src/i18n/messages/uk.json src/components/settings/HotkeysTab.tsx src/components/settings/HotkeysTab.test.tsx src/components/settings/AudioTab.test.tsx src/components/streams/StreamList.test.tsx src/components/player/PlayerPanel.test.tsx
git commit -m "feat(settings): stop-all hotkey row in Hotkeys tab + i18n (KB-12)"
```

(Якщо vite:build згенерував зміни в `src/i18n/paraglide/` і вони трекаються git-ом — додати їх у цей же коміт.)

---

### Task 6: Документація — реєстр і беклог

**Files:**
- Modify: `docs/keyboard-shortcuts.md` (таблиця Tier 1 + виноска)
- Modify: `docs/keyboard-shortcuts-backlog.md` (KB-12 → `[x]`)

- [ ] **Step 1: Реєстр** ([keyboard-shortcuts.md:33-46](../../keyboard-shortcuts.md#L33-L46))

У таблиці Tier 1:
- рядок `Ctrl+Shift+S` → стан `✅`, дія: `stop_all (зупинити весь запис, тост для NVDA)`;
- рядок `Ctrl+Shift+M` лишити `⬜`;
- рядок `Ctrl+Shift+Right / Ctrl+Shift+Left` **видалити**.

Виноску під таблицею замінити на:

```markdown
> ⬜-кандидат `Ctrl+Shift+M` — з [KB-12](keyboard-shortcuts-backlog.md#L195):
> відкладено (2026-06-10) — mute-логіка живе у фронтенді (`$muteState`),
> глобальний хоткей потребує моста Rust→webview. Там само вирішено: глобальний
> stop-playback не додаємо (`Ctrl+Shift+P` достатньо), next/prev трек
> (`Ctrl+Shift+←/→`) відхилено до появи моделі черги плеєра.
```

Оновити «Останнє звірення з кодом» на `2026-06-10`.

- [ ] **Step 2: Беклог** ([keyboard-shortcuts-backlog.md:195-197](../../keyboard-shortcuts-backlog.md#L195-L197))

`### ☐ KB-12` → `### [x] KB-12`, додати нотатку:

```markdown
- **Зроблено (2026-06-10):** додано лише `stop_all` (`Ctrl+Shift+S`, Tier 1,
  конфігуровний): гарантована зупинка без ризику випадкового старту (toggle R
  стартує, коли нічого не активно). Дзеркало KB-01: `stop_all_now()`
  ([recording_control.rs](../src-tauri/src/recording_control.rs)) + тост
  «Запис зупинено: n потоків» / «Запис не йшов»
  ([notify.rs](../src-tauri/src/tray/notify.rs)), окремий дебаунс 500 мс.
  Міграція: per-field `#[serde(default)]` на всі поля `HotkeyMap`. Решта
  кандидатів: mute — відкладено (міст Rust→webview), stop-playback — не
  додаємо, next/prev — відхилено до моделі черги. Спека/план:
  `docs/superpowers/{specs,plans}/2026-06-10-kb12-global-stop-all*`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/keyboard-shortcuts.md docs/keyboard-shortcuts-backlog.md
git commit -m "docs(shortcuts): KB-12 decisions — stop_all shipped, mute deferred, tracks rejected"
```

---

### Task 7: Фінальна верифікація

- [ ] **Step 1: Повні гейти**

Run (усі три мають пройти):
```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
pnpm vite:build
```
Expected: усе зелене/успішне.

- [ ] **Step 2: Ручна NVDA-приймальня (відкласти до спільної сесії з KB-01)**

Зібрати (`pnpm build:fast`), запустити, перевірити: `Ctrl+Shift+S` при активному записі (вікно у фокусі та у фоні/сховане) → запис зупинено, тост озвучено NVDA; без запису → тост «Запис не йшов»; утримання клавіші → один тост. Це той самий пункт ручної приймальні, що висить за KB-01/KB-05.
