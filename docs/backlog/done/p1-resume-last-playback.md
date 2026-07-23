---
slug: resume-last-playback
title: "Відновлення останнього відтворення при запуску"
priority: P1
type: planned
status: done
effort: M
kind: feature
target: 0.1.0
updated: 2026-07-23
completed: 2026-07-23
a11y: true
depends_on: [playback-toggle-stop-pause, resume-file-from-setting, autostart, crash-recovery]
blocks: []
touches: [src-tauri/src/profile.rs, src-tauri/src/commands/profile_commands.rs, src-tauri/src/commands/app_commands.rs, src-tauri/src/playback_control.rs, src/components/profile/]
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
depends_on_external: ["Phase 3G CLI (--play/--stop-playback, StartupPlan)"]
notes: ["злито в develop 2026-07-23, fast-forward merge 26b7f1e (гілка feature/p1-resume-last-playback, TDD)", "NVDA-прогін нового ProfileSettingsDialog (фокус-трап, анонс заголовка, Escape) та авто-старту не проведено — рекомендовано перед релізом"]
---

# Відновлення останнього відтворення при запуску

> **Контекст:** реалізовано й злито в `develop` 2026-07-23 (fast-forward `26b7f1e`) — тонка надбудова над готовим `resume_last` з [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md). Усі критерії коду закриті й гейти зелені; стандартний NVDA-прогін нового діалогу ще не проведено (див. «Відкриті питання»).

## Опис

При наступному запуску програма — **за бажанням користувача, налаштованим окремо для кожного профілю** — починає відтворювати те, що грало під час попереднього сеансу в цьому профілі: чи то живий радіо-потік, чи записаний файл.

**UX-цінність:**
- Типовий радіо-слухач очікує «продовжити з того ж місця» без зайвих дій.
- Для незрячого користувача (NVDA) — критично менша кількість кроків навігації: замість пошуку потоку у списку, вибору, запуску — одразу звук (коли користувач свідомо це ввімкнув).
- Особливо цінно у поєднанні з autostart: програма запускається у фоні і одразу починає грати — користувач просто вмикає комп'ютер.

## Модель (A1 + фіналізація 2026-07-19)

Закрито в [OPEN-QUESTIONS.md](../OPEN-QUESTIONS.md) (A1) і рішеннями 2026-07-19. Цей запис — **тонкий шар політики + UI поверх готового `resume_last`** з [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md), а не друге джерело правди:

- **Дані** («що грало + позиція») — у `PlayerSession` профілю: `last_stream_id`, `last_file_position {path, position_ms}`, `last_active`. Їх **уже пише й читає** [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md) ([playback_control.rs:136](../../../src-tauri/src/playback_control.rs#L136), `apply_session_snapshot`). Окремого `data/last_playback.json` немає.
- **Політика** («чи стартувати») — нове поле **`autoplay_on_startup: bool`** у тому ж `PlayerSession`, тобто **per-profile**; `#[serde(default)]` → `false`. **Бінарне, не enum:** режим `always_paused` викинуто (див. «Прийняті рішення» — cold-start `Ctrl+Shift+K` уже дає «тишу зі зведеною ціллю» на вимогу, а pre-load файлу потребував би нового engine-API «завантажити без гри» заради мілісекунд). Breaking changes дозволені — якщо колись знадобиться третій режим, поле перейменується.
- Наслідок: на старті **один read активного профілю** дає одразу і «чи грати», і «що грати» — політика й ціль подорожують разом.

## Критерії готовності

- [x] У `PlayerSession` ([profile.rs:250](../../../src-tauri/src/profile.rs#L250)) додано `autoplay_on_startup: bool`, `#[serde(default)]` → `false`. Жодного глобального поля в `settings.json`.
- [x] Авто-гра — **явний opt-in**; дефолт `false`. Підпис у діалозі попереджає: звук почне грати одразу після запуску і **накладеться на мовлення NVDA** (вікно фокусується з Rust — [[nvda-startup-foreground]] — NVDA говорить, але поверх музики).
- [x] Тригер — **не** `lib.rs` setup, а **`frontend_ready`** ([app_commands.rs:10](../../../src-tauri/src/commands/app_commands.rs#L10)), тим самим гейт-патерном, що `StartupPlan`/`StartupNotice`/`ResumeNotice`: інакше анонси `player-announce` емітяться до підписки webview і губляться, а блокуючий конект `play_stream` (≤15 с) не має права висіти в setup. Виконання — `spawn`-нута async-задача, що викликає **наявний `resume_last`** з [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md).
- [x] **Одноразовість:** `frontend_ready` ідемпотентна (reload webview кличе її знову) — авто-гра захищена one-shot guard'ом (managed state з `take()`, як `StartupNotice`), інакше reload після ручного стопу перезапустив би звук.
- [x] **CLI скасовує авто-гру:** якщо `StartupPlan` містить `Play` або `StopPlayback` — авто-гра скипається повністю (явна команда важливіша за збережену політику; без подвійного старту й гонки). `--record` та інші дії авто-гру не чіпають.
- [x] Помилка / недоступний таргет — startup **не блокується**; поведінка = поведінка `resume_last`: протухлий таргет → анонс «недоступно» + очистка запису; транзієнтна помилка конекту → анонс «помилка», запис лишається.
- [x] Файл відновлюється з урахуванням глобального **`resume_file_from`** (`position|start`) — безкоштовно через реюз `resume_last` (`plan_file_resume`).
- [x] Режим діє **лише при запуску застосунку**; `switch_profile` авто-гру нового профілю **не** запускає (семантика «startup», і перемикання профілю й так зупиняє все — [[profiles-recording-model]]).
- [x] Окремий діалог **«Налаштування профілю»** (новий компонент, `role="dialog"`), вхід із `ProfileContextMenu` для **обраного** (не обов'язково активного) профілю — **не** розширення спільного `ProfileNameDialog`. Містить **чекбокс** «Автовідтворення при запуску» + попереджувальний підпис (NVDA). Розширюваний під майбутні per-profile налаштування.
- [x] Нова IPC-команда `set_profile_autoplay(name, enabled)`. Неактивний профіль: load→modify→save. **Активний:** модифікувати in-memory `AppState.active_profile` під write-lock → clone → `spawn_blocking` save (патерн `persist_session_snapshot`, [playback_control.rs:157](../../../src-tauri/src/playback_control.rs#L157)) — **не** load-з-диска→save, бо це затерло б свіжіший in-memory стан (resume-поля, volume).
- [x] `duplicate()` ([profile.rs:525](../../../src-tauri/src/profile.rs#L525)) скидає у дубля `autoplay_on_startup→false` і resume-трійку (`last_active`/`last_stream_id`/`last_file_position`) → `None`; `volume` переноситься. _(Реалізовано через спільний `PlayerSession::reset_for_share()`.)_
- [x] `export_json_str` (поряд зі стрипом паролів) скидає `autoplay_on_startup→false` і **всю resume-трійку** (не лише `last_file_position` — інакше лишається висячий дискримінатор `last_active=file`; абсолютний шлях — приватність + протухає на чужій машині). `commit_import` додатково клампить `autoplay_on_startup→false` (defense-in-depth).
- [x] NVDA-анонси при авто-старті — **ті самі, що в [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md)** («Підключення — станція», «Відтворення — трек, з mm:ss»): реюз `player-announce`, нових рядків i18n для анонсів не треба (лише для діалогу).

## Технічні деталі

### Де зберігати (єдине джерело правди)

Усе — в `PlayerSession` профілю (`*.tapirprofile` JSON), поряд з уже живими полями [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md):

```rust
pub struct PlayerSession {
    pub volume: f32,
    pub last_stream_id: Option<String>,           // пише/читає #1
    pub last_file_position: Option<FilePosition>, // { path, position_ms } — #1
    pub last_active: Option<LastActive>,          // дискримінатор — #1
    pub autoplay_on_startup: bool,                // ЦЯ фіча; #[serde(default)] = false
}
```

### Поведінка на старті

| `autoplay_on_startup` | Дія |
|---|---|
| `false` (дефолт) | нічого; resume-поля все одно пишуться ([playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md)), перший `Ctrl+Shift+K` відновлює вручну |
| `true` | викликати `resume_last`: потік → reconnect + грати; файл → play + seek за `resume_file_from` + грати |

> `always_paused` викинуто (2026-07-19): для потоку він вироджувався в «тишу + зведену ціль» — рівно те, що вже дає cold-start `Ctrl+Shift+K` без жодного налаштування; для файлу унікальна цінність (pre-load) — мілісекунди, а коштувала б нового API «завантажити без гри» в `PlayerEngine` (наявний `play_file` одразу грає; play→pause дав би чутний блип). `restore` («грати, лише якщо грало») відкинуто ще раніше — потребував би окремого поля стану. Двері на повернення будь-якого з них — відчинені, але свідомо не закладаються.

### Точка тригера і порядок (frontend_ready)

`frontend_ready` ([app_commands.rs:10](../../../src-tauri/src/commands/app_commands.rs#L10)) — єдине місце, де webview гарантовано підписаний на події:

1. Прочитати `StartupPlan` **до** дренажу (або передати рішення поряд): якщо план містить `Play`/`StopPlayback` → **скип** авто-гри.
2. Інакше, якщо `active_profile.player_session.autoplay_on_startup` і one-shot guard не спрацьовував → `spawn(resume_last(app))`.
3. Crash-recovery (`ResumeNotice`) незалежний: відновлення записів і авто-гра співіснують; анонси йдуть послідовно.

`--minimize` (autostart): вікно ховається ще в setup, але webview уже ініціалізований і `frontend_ready` приходить — авто-гра працює. Анонс у прихованому вікні NVDA не прочитає (нема фокуса) — це ок: звук сам по собі є підтвердженням, трей-стан оновлюється (`notify_state_changed`).

### Помилки (= поведінка `resume_last`, без відхилень)

| Ситуація | Поведінка |
|----------|-----------|
| Файл не знайдено / потік видалений з профілю | Анонс «недоступно», очистити resume-поля, startup продовжується |
| Потік не відповідає (транзієнтно) | Анонс «помилка», запис **лишається** (наступний запуск/K спробує знову) |
| Висячий дискримінатор / нічого не збережено | Тихо очистити, нічого не грати |
| Профіль пошкоджений | Існуюча обробка завантаження профілю; авто-гра просто не спрацьовує |

### Rust-модулі

- `src-tauri/src/profile.rs` — поле `autoplay_on_startup` у `PlayerSession`; `PlayerSession::reset_for_share()`; скидання в `duplicate()`; стрип у `export_json_str` (поле + resume-трійка); кламп у `commit_import`.
- `src-tauri/src/commands/profile_commands.rs` — IPC `set_profile_autoplay(name, enabled)`; для активного профілю — in-memory-патерн (див. критерії).
- `src-tauri/src/commands/app_commands.rs` (`frontend_ready`) — one-shot тригер: перевірка `StartupPlan` (`cli::plan_controls_playback`) → `spawn(resume_last)`.
- `src-tauri/src/cli.rs` — pure-хелпер `plan_controls_playback`.
- `src-tauri/src/playback_control.rs` — `resume_last` став `pub(crate)`; новий `AutoplayGuard` (one-shot latch).

### Frontend

- `src/components/profile/ProfileSettingsDialog.tsx` — **новий** діалог `role="dialog"`: чекбокс «Автовідтворення при запуску» + попереджувальний підпис про накладання звуку на мовлення NVDA. **Не** розширює `ProfileNameDialog` (він узагальнений і спільний для create/rename). Чекбокс — без Select-портала, діалог рендериться **сиблінгом** колекційних компонентів ([[portal-dialog-inside-collection-double-mount]]).
- `src/components/profile/ProfileContextMenu.tsx` — пункт «Налаштування профілю…» для **обраного** профілю.
- Анонси авто-старту — наявна обробка `player-announce` з [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md); нового не було потрібно.

## Прийняті рішення

| Питання | Рішення |
|---------|--------|
| Де зберігати стан? | **`PlayerSession` профілю** (єдине джерело правди з [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md)). Окремого `last_playback.json` немає. (A1) |
| Скоуп політики? | **Per-profile** — `autoplay_on_startup` у `PlayerSession`, не глобально в `settings.json`. |
| Форма політики? | **`bool`** (2026-07-19). `always_paused` викинуто — дублює cold-start `Ctrl+Shift+K`; `restore` відкинуто ще раніше. |
| Авто-гра на старті? | **Явний opt-in**, дефолт `false`. Той, хто вмикає, свідомо приймає звук поверх мовлення NVDA на старті. |
| Точка тригера? | **`frontend_ready`** (гейт-патерн `StartupPlan`), spawn-нутий реюз `resume_last`; one-shot guard проти reload. **Не** `lib.rs` setup (загублені анонси + блокуючий конект). (2026-07-19) |
| Конфлікт із CLI? | **CLI скасовує авто-гру**: `Play`/`StopPlayback` у `StartupPlan` → скип. (2026-07-19) |
| Протухлий таргет? | **Анонс «недоступно»** + очистка — реюз `resume_last` як є, без silent-флага. (2026-07-19) |
| Перемикання профілю? | Режим діє **лише при запуску застосунку**; `switch_profile` авто-гру не запускає. (2026-07-19) |
| Де в UI? | **Окремий діалог «Налаштування профілю»** з `ProfileContextMenu` (`role="dialog"`), чекбокс. Розширюваний під майбутні per-profile налаштування. (2026-07-19) |
| Дублювання профілю | Скидати `autoplay_on_startup→false` + resume-трійку в `None`; `volume` переноситься. Реалізовано через `PlayerSession::reset_for_share()`. |
| Експорт/імпорт | На експорті скидати поле + **всю** resume-трійку (без висячого `last_active`); на імпорті кламп `→false`. |
| Позиція для файлів | Через реюз `resume_last`: seek за глобальним `resume_file_from` (`position|start`). Для потоків позиції немає. |
| Назва для анонсу | Реюз анонсів [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md) (`connecting`/`resuming`) — резолвиться на льоту, не кешується. |

## Відкриті питання (рівень реалізації)

- ✅ **Порядок у `frontend_ready`** — вирішено: `plan_controls_playback(&plan.actions)` рахується ДО дренажу плану (перед `spawn(execute)`); `AutoplayGuard::take()` споживається завжди, навіть коли CLI скасовує авто-гру — reload після цього не може її «оживити».
- 🟨 **NVDA-прогін діалогу** — стандартна перевірка нового модального діалогу (фокус-трап, анонс заголовка, Escape) та самого авто-старту (озвучення поверх мовлення при запуску) **не проведена** — рекомендовано перед релізом. Select-портал-ризик знято (чекбокс, не Select).

## Документи

- [docs/data-models.md](../../data-models.md) — §3.7 `PlayerSession` (нове поле `autoplayOnStartup`/`autoplay_on_startup`)
- [docs/architecture.md](../../architecture.md) — backend-first, IPC, startup-послідовність (`frontend_ready`)
- [docs/accessibility.md](../../accessibility.md) — NVDA, модальні діалоги, `player-announce`
- Код: [src-tauri/src/playback_control.rs](../../../src-tauri/src/playback_control.rs) (`resume_last`, `AutoplayGuard`), [src-tauri/src/profile.rs](../../../src-tauri/src/profile.rs), [src-tauri/src/commands/profile_commands.rs](../../../src-tauri/src/commands/profile_commands.rs), [src-tauri/src/commands/app_commands.rs](../../../src-tauri/src/commands/app_commands.rs), [src-tauri/src/cli.rs](../../../src-tauri/src/cli.rs) (`StartupPlan`, `plan_controls_playback`), [src/components/profile/](../../../src/components/profile/)
- Пам'ять: [[nvda-startup-foreground]], [[portal-dialog-inside-collection-double-mount]], [[profiles-recording-model]], [[resume-last-playback-status]]
- Перехресне: [OPEN-QUESTIONS.md](../OPEN-QUESTIONS.md) (A1 ✅, A2 знято, A3 per-profile), [ROADMAP.md](../ROADMAP.md)
