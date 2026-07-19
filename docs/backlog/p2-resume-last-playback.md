# Відновлення останнього відтворення при запуску

- **Слаг:** `resume-last-playback`
- **Тип:** покращення
- **Стан:** ready (рішення фіналізовано 2026-07-19; модель A1 узгоджена 2026-06-25)
- **Зусилля:** M (діалог «Налаштування профілю» + IPC + startup-hook; зменшилось проти попередньої оцінки: `always_paused` викинуто → не треба engine-API «load без play», у діалозі чекбокс замість Select → знято питання «Select у модалці», анонси реюзаються з #1)
- **Оновлено:** 2026-07-19
- **Залежності:** **#1 [playback-toggle-stop-pause](done/p1-playback-toggle-stop-pause.md) ✅** (злито в `develop` 2026-07-18) — єдине джерело правди `PlayerSession` + готова функція `resume_last` ([playback_control.rs](../../src-tauri/src/playback_control.rs)); цей запис — **тонка надбудова** над нею. Також: [resume-file-from-setting](done/p2-resume-file-from-setting.md) ✅ (`resume_file_from`), [autostart](done/p2-autostart.md) ✅ (`--minimize`), [crash-recovery](done/p1-crash-recovery.md) ✅, Phase 3G CLI (`--play`/`--stop-playback`, `StartupPlan`).

## Опис

При наступному запуску програма — **за бажанням користувача, налаштованим окремо для кожного профілю** — починає відтворювати те, що грало під час попереднього сеансу в цьому профілі: чи то живий радіо-потік, чи записаний файл.

**UX-цінність:**
- Типовий радіо-слухач очікує «продовжити з того ж місця» без зайвих дій.
- Для незрячого користувача (NVDA) — критично менша кількість кроків навігації: замість пошуку потоку у списку, вибору, запуску — одразу звук (коли користувач свідомо це ввімкнув).
- Особливо цінно у поєднанні з autostart: програма запускається у фоні і одразу починає грати — користувач просто вмикає комп'ютер.

## Модель (A1 + фіналізація 2026-07-19)

Закрито в [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) (A1) і рішеннями 2026-07-19. Цей запис — **тонкий шар політики + UI поверх готового `resume_last` з #1**, а не друге джерело правди:

- **Дані** («що грало + позиція») — у `PlayerSession` профілю: `last_stream_id`, `last_file_position {path, position_ms}`, `last_active`. Їх **уже пише й читає #1** ([playback_control.rs:136](../../src-tauri/src/playback_control.rs#L136), `apply_session_snapshot`). Окремого `data/last_playback.json` немає.
- **Політика** («чи стартувати») — нове поле **`autoplay_on_startup: bool`** у тому ж `PlayerSession`, тобто **per-profile**; `#[serde(default)]` → `false`. **Бінарне, не enum:** режим `always_paused` викинуто (див. «Прийняті рішення» — cold-start `Ctrl+Shift+K` з #1 уже дає «тишу зі зведеною ціллю» на вимогу, а pre-load файлу потребував би нового engine-API «завантажити без гри» заради мілісекунд). Breaking changes дозволені — якщо колись знадобиться третій режим, поле перейменується.
- Наслідок: на старті **один read активного профілю** дає одразу і «чи грати», і «що грати» — політика й ціль подорожують разом.

## Критерії готовності

- [ ] У `PlayerSession` ([profile.rs:250](../../src-tauri/src/profile.rs#L250)) додано `autoplay_on_startup: bool`, `#[serde(default)]` → `false`. Жодного глобального поля в `settings.json`.
- [ ] Авто-гра — **явний opt-in**; дефолт `false`. Підпис у діалозі попереджає: звук почне грати одразу після запуску і **накладеться на мовлення NVDA** (вікно фокусується з Rust — [[nvda-startup-foreground]] — NVDA говорить, але поверх музики).
- [ ] Тригер — **не** `lib.rs` setup, а **`frontend_ready`** ([app_commands.rs:10](../../src-tauri/src/commands/app_commands.rs#L10)), тим самим гейт-патерном, що `StartupPlan`/`StartupNotice`/`ResumeNotice`: інакше анонси `player-announce` емітяться до підписки webview і губляться, а блокуючий конект `play_stream` (≤15 с) не має права висіти в setup. Виконання — `spawn`-нута async-задача, що викликає **наявний `resume_last`** з #1.
- [ ] **Одноразовість:** `frontend_ready` ідемпотентна (reload webview кличе її знову) — авто-гра захищена one-shot guard'ом (managed state з `take()`, як `StartupNotice`), інакше reload після ручного стопу перезапустив би звук.
- [ ] **CLI скасовує авто-гру:** якщо `StartupPlan` містить `Play` або `StopPlayback` — авто-гра скипається повністю (явна команда важливіша за збережену політику; без подвійного старту й гонки). `--record` та інші дії авто-гру не чіпають.
- [ ] Помилка / недоступний таргет — startup **не блокується**; поведінка = поведінка `resume_last`: протухлий таргет → анонс «недоступно» + очистка запису; транзієнтна помилка конекту → анонс «помилка», запис лишається.
- [ ] Файл відновлюється з урахуванням глобального **`resume_file_from`** (`position|start`) — безкоштовно через реюз `resume_last` (`plan_file_resume`).
- [ ] Режим діє **лише при запуску застосунку**; `switch_profile` авто-гру нового профілю **не** запускає (семантика «startup», і перемикання профілю й так зупиняє все — [[profiles-recording-model]]).
- [ ] Окремий діалог **«Налаштування профілю»** (новий компонент, `role="dialog"`), вхід із `ProfileContextMenu` для **обраного** (не обов'язково активного) профілю — **не** розширення спільного `ProfileNameDialog`. Містить **чекбокс** «Автовідтворення при запуску» + попереджувальний підпис (NVDA). Розширюваний під майбутні per-profile налаштування.
- [ ] Нова IPC-команда `set_profile_autoplay(name, enabled)`. Неактивний профіль: load→modify→save. **Активний:** модифікувати in-memory `AppState.active_profile` під write-lock → clone → `spawn_blocking` save (патерн `persist_session_snapshot`, [playback_control.rs:157](../../src-tauri/src/playback_control.rs#L157)) — **не** load-з-диска→save, бо це затерло б свіжіший in-memory стан (resume-поля, volume).
- [ ] `duplicate()` ([profile.rs:525](../../src-tauri/src/profile.rs#L525)) скидає у дубля `autoplay_on_startup→false` і resume-трійку (`last_active`/`last_stream_id`/`last_file_position`) → `None`; `volume` переноситься. _(Зараз `duplicate()` копіює все — з #1 resume-поля вже живі, тож без скидання дубль «тягне» чуже останнє відтворення.)_
- [ ] `export_json_str` (поряд зі стрипом паролів) скидає `autoplay_on_startup→false` і **всю resume-трійку** (не лише `last_file_position` — інакше лишається висячий дискримінатор `last_active=file`; абсолютний шлях — приватність + протухає на чужій машині). `commit_import` додатково клампить `autoplay_on_startup→false` (defense-in-depth).
- [ ] NVDA-анонси при авто-старті — **ті самі, що в #1** («Підключення — станція», «Відтворення — трек, з mm:ss»): реюз `player-announce`, нових рядків i18n для анонсів не треба (лише для діалогу).

## Технічні деталі

### Де зберігати (єдине джерело правди)

Усе — в `PlayerSession` профілю (`*.tapirprofile` JSON), поряд з уже живими полями #1:

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
| `false` (дефолт) | нічого; resume-поля все одно пишуться (#1), перший `Ctrl+Shift+K` відновлює вручну |
| `true` | викликати `resume_last`: потік → reconnect + грати; файл → play + seek за `resume_file_from` + грати |

> `always_paused` викинуто (2026-07-19): для потоку він вироджувався в «тишу + зведену ціль» — рівно те, що вже дає cold-start `Ctrl+Shift+K` без жодного налаштування; для файлу унікальна цінність (pre-load) — мілісекунди, а коштувала б нового API «завантажити без гри» в `PlayerEngine` (наявний `play_file` одразу грає; play→pause дав би чутний блип). `restore` («грати, лише якщо грало») відкинуто ще раніше — потребував би окремого поля стану. Двері на повернення будь-якого з них — відчинені, але свідомо не закладаються.

### Точка тригера і порядок (frontend_ready)

`frontend_ready` ([app_commands.rs:10](../../src-tauri/src/commands/app_commands.rs#L10)) — єдине місце, де webview гарантовано підписаний на події:

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

### Rust-модулі (орієнтовно)

- `src-tauri/src/profile.rs` — поле `autoplay_on_startup` у `PlayerSession`; скидання в `duplicate()`; стрип у `export_json_str` (поле + resume-трійка); кламп у `commit_import`.
- `src-tauri/src/commands/profile_commands.rs` — IPC `set_profile_autoplay(name, enabled)`; для активного профілю — in-memory-патерн (див. критерії).
- `src-tauri/src/commands/app_commands.rs` (`frontend_ready`) — one-shot тригер: перевірка `StartupPlan` → `spawn(resume_last)`.
- `src-tauri/src/playback_control.rs` — `resume_last` стає `pub(crate)`; іншого коду не треба.

### Frontend (орієнтовно)

- `src/components/profile/ProfileSettingsDialog.tsx` — **новий** діалог `role="dialog"`: чекбокс «Автовідтворення при запуску» + попереджувальний підпис про накладання звуку на мовлення NVDA. **Не** розширювати `ProfileNameDialog` (він узагальнений і спільний для create/rename). Чекбокс — без Select-портала, але діалог усе одно рендерити **сиблінгом** колекційних компонентів ([[portal-dialog-inside-collection-double-mount]]).
- `src/components/profile/ProfileContextMenu.tsx` — пункт «Налаштування профілю…» для **обраного** профілю.
- Анонси авто-старту — наявна обробка `player-announce` з #1; нового не треба.

## Прийняті рішення

| Питання | Рішення |
|---------|--------|
| Де зберігати стан? | **`PlayerSession` профілю** (єдине джерело правди з #1). Окремого `last_playback.json` немає. (A1) |
| Скоуп політики? | **Per-profile** — `autoplay_on_startup` у `PlayerSession`, не глобально в `settings.json`. |
| Форма політики? | **`bool`** (2026-07-19). `always_paused` викинуто — дублює cold-start `Ctrl+Shift+K`; `restore` відкинуто ще раніше. |
| Авто-гра на старті? | **Явний opt-in**, дефолт `false`. Той, хто вмикає, свідомо приймає звук поверх мовлення NVDA на старті. |
| Точка тригера? | **`frontend_ready`** (гейт-патерн `StartupPlan`), spawn-нутий реюз `resume_last`; one-shot guard проти reload. **Не** `lib.rs` setup (загублені анонси + блокуючий конект). (2026-07-19) |
| Конфлікт із CLI? | **CLI скасовує авто-гру**: `Play`/`StopPlayback` у `StartupPlan` → скип. (2026-07-19) |
| Протухлий таргет? | **Анонс «недоступно»** + очистка — реюз `resume_last` як є, без silent-флага. (2026-07-19) |
| Перемикання профілю? | Режим діє **лише при запуску застосунку**; `switch_profile` авто-гру не запускає. (2026-07-19) |
| Де в UI? | **Окремий діалог «Налаштування профілю»** з `ProfileContextMenu` (`role="dialog"`), чекбокс. Розширюваний під майбутні per-profile налаштування. (2026-07-19) |
| Дублювання профілю | Скидати `autoplay_on_startup→false` + resume-трійку в `None`; `volume` переноситься. _(Нова поведінка — зараз `duplicate()` копіює все.)_ |
| Експорт/імпорт | На експорті скидати поле + **всю** resume-трійку (без висячого `last_active`); на імпорті кламп `→false`. |
| Позиція для файлів | Через реюз `resume_last`: seek за глобальним `resume_file_from` (`position|start`). Для потоків позиції немає. |
| Назва для анонсу | Реюз анонсів #1 (`connecting`/`resuming`) — резолвиться на льоту, не кешується. |

## Відкриті питання (рівень реалізації)

- 🟨 **Порядок у `frontend_ready`** — акуратно вбудувати перевірку `StartupPlan` до/поряд із `take()` (зараз план одразу дренажиться в spawn); не зламати ідемпотентність.
- 🟨 **NVDA-прогін діалогу** — стандартна перевірка нового модального діалогу (фокус-трап, анонс заголовка, Escape); Select-портал-ризик знято (чекбокс).

## Документи

- [docs/data-models.md](../data-models.md) — §3.7 `PlayerSession` (нове поле `autoplay_on_startup`)
- [docs/architecture.md](../architecture.md) — backend-first, IPC, startup-послідовність (`frontend_ready`)
- [docs/accessibility.md](../accessibility.md) — NVDA, модальні діалоги, `player-announce`
- Код: [src-tauri/src/playback_control.rs](../../src-tauri/src/playback_control.rs) (`resume_last`), [src-tauri/src/profile.rs](../../src-tauri/src/profile.rs), [src-tauri/src/commands/profile_commands.rs](../../src-tauri/src/commands/profile_commands.rs), [src-tauri/src/commands/app_commands.rs](../../src-tauri/src/commands/app_commands.rs), [src-tauri/src/cli.rs](../../src-tauri/src/cli.rs) (`StartupPlan`), [src/components/profile/](../../src/components/profile/)
- Пам'ять: [[nvda-startup-foreground]], [[portal-dialog-inside-collection-double-mount]], [[profiles-recording-model]]
- Перехресне: [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) (A1 ✅, A2 знято, A3 per-profile), [IMPLEMENTATION-ORDER.md](IMPLEMENTATION-ORDER.md) (хвиля 3, #1)

## Промпт для агента

```text
Реалізація фіналізованої моделі (усі рішення закриті — див. «Прийняті рішення»). Спершу звірся з контекстом, не починай правок наосліп. База вже в коді: #1 (playback-toggle-stop-pause) злито — playback_control.rs має resume_last, apply_session_snapshot, persist_session_snapshot; resume_file_from теж реалізовано.

Що зробити:
1) profile.rs: у PlayerSession додати autoplay_on_startup: bool, #[serde(default)] = false. Жодного глобального поля в settings.json.
2) duplicate(): скинути autoplay_on_startup→false + last_active/last_stream_id/last_file_position→None; volume лишити. (Зараз duplicate копіює все — це нова поведінка, з #1 resume-поля живі.)
3) export_json_str(): поряд зі стрипом паролів скинути autoplay_on_startup→false і ВСЮ resume-трійку (не лише last_file_position — без висячого last_active). commit_import: кламп autoplay_on_startup→false.
4) profile_commands.rs: IPC set_profile_autoplay(name, enabled). Неактивний профіль: load→modify→save. Активний: write-lock in-memory AppState.active_profile → set → clone → spawn_blocking save (патерн persist_session_snapshot) — НЕ load-з-диска, щоб не затерти in-memory resume-поля/volume.
5) frontend_ready (app_commands.rs): one-shot тригер (managed state з take(), як StartupNotice). Якщо StartupPlan містить Play або StopPlayback → скип авто-гри (перевірити ДО/поряд із дренажем плану, не зламавши ідемпотентність). Інакше якщо active_profile.player_session.autoplay_on_startup → spawn(resume_last). resume_last зробити pub(crate). НЕ в lib.rs setup (анонси до підписки webview губляться; play_stream блокує ≤15 с).
6) Поведінка помилок/seek/анонсів = resume_last як є: «недоступно»+очистка для протухлого, «помилка» без очистки для транзієнтного, resume_file_from для файлів, анонси connecting/resuming реюзаються. switch_profile авто-гру НЕ запускає.
7) Frontend: новий ProfileSettingsDialog (role="dialog") з чекбоксом «Автовідтворення при запуску» + підпис-попередження (звук накладеться на мовлення NVDA при запуску); вхід із ProfileContextMenu для ОБРАНОГО профілю, пункт «Налаштування профілю…». НЕ розширювати ProfileNameDialog. Діалог — сиблінгом колекційних компонентів ([[portal-dialog-inside-collection-double-mount]]). i18n uk/en.
8) Оновити доки: data-models.md §3.7, architecture.md (startup/frontend_ready), accessibility.md.

Звірся: playback_control.rs (resume_last, persist_session_snapshot), app_commands.rs (frontend_ready, гейт-патерн), cli.rs (StartupPlan, Action::Play/StopPlayback), profile.rs (PlayerSession, duplicate, export_json_str, commit_import), profile_commands.rs, src/components/profile/. Узгодь з autostart (--minimize: webview ініціалізований, frontend_ready приходить, авто-гра працює; анонс у прихованому вікні не озвучиться — ок).

Гейти: cargo test + cargo clippy; pnpm test + pnpm vite:build (tsc має ~51 преекзистинг-помилку від paraglide — не блокер, [[typecheck-paraglide-gotchas]]); ручний прогін з NVDA: діалог профілю, авто-старт на потоці й файлі (вкл. resume_file_from=start), tapir --play X при увімкненій авто-грі (CLI виграє), reload webview не перезапускає звук, дубль/експорт скидає поле.
```
