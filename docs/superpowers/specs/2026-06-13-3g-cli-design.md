# Phase 3G — CLI Arguments: дизайн v2

Дата: 2026-06-13
Статус: затверджено (brainstorming-сесія), ревізовано після code-review, очікує план імплементації

> **Ревізія v2 (code-review 2026-06-13).** Закрито дві суперечності й один баг
> скетчу: (1) ранній `exit` переміщено з-перед білдера у `.setup`, бо до білдера
> код біжить і в 2-й інстанції → parse-error з'їдав би форвардинг (§3.6, §6);
> (2) стартові дії гейтяться на `frontend_ready`, інакше анонси губляться до
> підписки вебв'ю (§3.6, §5); (3) `clap` отримав `version`, інакше `--version`
> був би `UnknownArgument` (§3.2). Також: `execute` тепер озвучує збій дії
> (§3.4, §5); «глобальний wishlist» уточнено до «рівня активного профілю».

## 1. Мета й обсяг

Підтримка аргументів командного рядка для автоматизації та скриптів. Tapir має
розпізнавати прапори і виконувати дії — як на власному старті (перша інстанція),
так і коли аргументи приходять від повторного запуску (forwarded argv → колбек
single-instance із Фази 3E).

Підтримувані прапори:

| Прапор | Дія | Контекст |
|--------|-----|----------|
| `--record <name\|url>` | старт запису потоку | Startup + Forwarded |
| `--play <name\|url>` | старт відтворення потоку | Startup + Forwarded |
| `--stop-recording` | зупинити всі записи | Startup + Forwarded |
| `--stop-playback` | зупинити відтворення | Startup + Forwarded |
| `--wish-add <pattern>` | додати wishlist-патерн (активного профілю) | Startup + Forwarded |
| `--wish-remove <pattern>` | видалити wishlist-патерн (активного профілю) | Startup + Forwarded |
| `--profile <name>` | вибрати активний профіль | **лише Startup** |
| `--minimize` | стартувати згорнутим у трей | **лише Startup** |

**Свідомо поза 3G** (винесено / відкинуто):

- **`--datadir` — відкинуто.** Глобальний mutex (3E) робить його напівробочим
  (діяв би лише на першій інстанції), а реалізація вимагала б рефактору всього
  `portable.rs` (вільні функції від шляху EXE, читаються ще до `tauri::Builder`).
  Ціна не виправдана. Якщо колись знадобиться — окрема фаза з конфігурованим
  коренем даних (`OnceLock<PathBuf>`) і парсингом до `ensure_data_dirs()`.
- Текстовий вивід CLI (`--help`/`--version` у консоль) — поза обсягом, бо
  release-білд має `windows_subsystem = "windows"` (немає консолі). Див. §6.

## 2. Зафіксовані дизайнерські рішення

Усі сім прийнято на brainstorming-сесії 2026-06-13 (№7 — на code-review спеки).

1. **Парсер — `clap` напряму (бібліотека), без `tauri-plugin-cli`.** Плагін
   бачить лише власні process-args першої інстанції (`app.cli().matches()` у
   `setup`), а forwarded argv другої інстанції приходить як сирий `Vec<String>` у
   колбек — плагін його не парсить. Отже плагін не покриває головний сценарій;
   `clap`-бібліотека дає єдиний шлях парсингу для обох контекстів і чисту,
   TDD-придатну функцію (виконує ноту 3E §3.2).
2. **Exit-коди — мінімальні, без тексту.** Перша інстанція: clap parse-error →
   `exit(2)` ще до показу вікна; інакше 0. **Exit ухвалюємо на початку `.setup`,
   а НЕ перед білдером** — код перед білдером біжить і в 2-й інстанції, тож ранній
   `exit(2)` там з'їв би форвардинг; `.setup` же доходить лише до 1-ї інстанції
   (§3.6). Forwarded — **завжди 0** (2-га інстанція не парсить сама, а форвардить
   сирий argv і виходить `exit(0)` у setup-хуку плагіна; результат назад не
   передається). Документується як обмеження. Без stdout / `AttachConsole`. Див. §6.
3. **`--record`/`--play <X>` — збіг по `name` або `URL` в активному профілі.**
   Знайти наявний потік → запустити звичайним шляхом (по `stream_id`). Немає збігу
   → a11y-анонс «потік не знайдено», профіль НЕ змінюється. Без нового
   recording-шляху і без мутації профілю з CLI.
4. **Startup-only прапори на forwarded — ігнор + warn.** `--profile` і
   `--minimize` діють лише на справжньому старті. На forwarded вони ігноруються
   (warn у лог + a11y-анонс «проігноровано при повторному запуску»). Безпека:
   forwarded `--profile` не зупинить активні записи раптово (switch_profile зупиняє
   все), forwarded `--minimize` не боротиметься з `show→unminimize→set_focus`, що
   його колбек 3E щойно зробив.
5. **Контекст — явний `CliContext { Startup, Forwarded }`.** Не проксі через
   `cwd: Option`. Передається у фазу планування, яка вирішує, що відсікти.
6. **Зворотний зв'язок — toast + aria-live на кожну дію.** Розробник незрячий;
   тиха дія неприйнятна. Реалізація — §5.
7. **`--profile` — разовий (session-only) override, без проактивного
   збереження.** Установлюється в пам'яті до `AppState::new`. `GlobalSettings::load()`
   пише `settings.json` лише за відсутності файлу (вже повернувся до override), а
   `graceful_shutdown` зберігає ПРОФІЛЬ, не settings — тож на чистому виході
   `active_profile` у `settings.json` не змінюється. Стає «липким», якщо сесія
   викличе будь-який `settings.save()` — не лише `switch_profile`/`save_settings`,
   а й, напр., `set_output_device` (зміна аудіопристрою теж персиститься разом із
   усім `GlobalSettings`, включно з `active_profile`). У всіх цих випадках
   персиститься свідома дія користувача в сесії, що прийнятно. Деталі — §3.6.

## 3. Архітектура

Розширюємо наявний шов `cli.rs` (з 3E) трьома шарами: **parse → plan → execute**.
Перші два — чисті й покриті юніт-тестами; третій — async-диспатч (impure).

### 3.1 Шари

```
argv: Vec<String>
   │  parse()  — clap, чисто
   ▼
Cli  (структура прапорів)
   │  plan(cli, ctx)  — чисто, контекст-залежно
   ▼
Plan { actions: Vec<Action>, ignored: Vec<IgnoredFlag> }
   │  execute(app, plan)  — async, impure (spawn)
   ▼
виклики stream_manager / player / wishlist + cli-feedback події
```

### 3.2 Типи (новий `cli.rs`)

```rust
use clap::Parser;

/// Сирий розбір argv. Усі поля опціональні — порожній argv (звичайний
/// подвійний клік) парситься в "жодних дій". try_parse_from працює і для
/// власного argv, і для forwarded (обидва містять argv[0] = шлях до EXE).
#[derive(Parser, Debug, Default, PartialEq, Eq)]
// `version` ОБОВ'ЯЗКОВИЙ: без нього clap НЕ генерує прапор --version, і `--version`
// став би UnknownArgument (exit 2), а не DisplayVersion. disable_*_flag лишаємо
// false (це й так дефолт) — help генерується автоматично.
#[command(name = "tapir", version = env!("CARGO_PKG_VERSION"))]
pub struct Cli {
    #[arg(long, value_name = "NAME|URL")] pub record: Option<String>,
    #[arg(long, value_name = "NAME|URL")] pub play: Option<String>,
    #[arg(long)] pub stop_recording: bool,
    #[arg(long)] pub stop_playback: bool,
    #[arg(long, value_name = "PATTERN")] pub wish_add: Option<String>,
    #[arg(long, value_name = "PATTERN")] pub wish_remove: Option<String>,
    #[arg(long, value_name = "NAME")] pub profile: Option<String>, // startup-only
    #[arg(long)] pub minimize: bool,                                // startup-only
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CliContext { Startup, Forwarded }

/// Одна виконувана дія. Порядок у Plan визначає порядок виконання.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    Record(String), Play(String),
    StopRecording, StopPlayback,
    WishAdd(String), WishRemove(String),
    SwitchProfile(String),   // лише Startup
    // Minimize обробляється у setup напряму, не як runtime-Action.
}

/// Прапор, відсічений через контекст (для warn + анонсу).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IgnoredFlag { Profile, Minimize }

pub struct Plan { pub actions: Vec<Action>, pub ignored: Vec<IgnoredFlag> }

/// Стартовий план, відкладений до готовності вебв'ю. Кладеться в керований стан
/// у `setup`, дренажиться (`take`) у `frontend_ready` (§3.6) — щоб анонси дій не
/// загубилися до підписки вебв'ю. `Mutex<Option<…>>`: `take()` → одноразовість
/// (повторний `frontend_ready` на reload вебв'ю безпечний).
pub struct StartupPlan(pub std::sync::Mutex<Option<Plan>>);

impl StartupPlan {
    pub fn new(plan: Plan) -> Self { Self(std::sync::Mutex::new(Some(plan))) }
    pub fn take(&self) -> Option<Plan> { self.0.lock().unwrap().take() }
}
```

```rust
/// Чисто: argv -> Cli (або clap::Error для help/version/parse-error).
pub fn parse(argv: &[String]) -> Result<Cli, clap::Error> {
    Cli::try_parse_from(argv)
}

/// Чисто: Cli + контекст -> впорядкований план. Startup-only прапори на
/// Forwarded потрапляють до `ignored`, а не до `actions`.
pub fn plan(cli: Cli, ctx: CliContext) -> Plan { /* див. §3.3 */ }

/// Impure: виконати план на живій інстанції. Викликається з async-рантайму.
/// Кожна дія, що повернула `Err`, мапиться у `CliFeedback::ActionFailed`
/// (§5) — мовчазний збій неприйнятний (рішення №6). Стартовий виклик
/// гейтиться на `frontend_ready` (§3.6); forwarded — одразу.
pub async fn execute(app: &AppHandle, plan: Plan) { /* §3.4 */ }
```

### 3.3 Правила планування (`plan`, чисто — головна ціль TDD)

- `record`/`play`/`stop_*`/`wish_*` → відповідний `Action`, незалежно від
  контексту.
- `profile`: `Startup` → `Action::SwitchProfile`; `Forwarded` →
  `IgnoredFlag::Profile`.
- `minimize`: на `Startup` обробляється у `setup` (видимість вікна), не як
  `Action`; на `Forwarded` → `IgnoredFlag::Minimize`.
- Порядок дій фіксований і детермінований: `SwitchProfile` → `stop_*` → `wish_*`
  → `record`/`play`. (Перемикання профілю перше, бо змінює, де шукати потік.)
- Взаємовиключність не нав'язуємо: дозволяємо комбінації (напр. `--stop-playback
  --record X`); конфліктні комбінації (`--record` + `--play` того ж потоку)
  виконуються в заданому порядку, останній виграє за станом.

### 3.4 Виконання (`execute`, async)

Кожна дія мапиться на наявну логіку (НЕ дублюємо — викликаємо ту саму, що IPC):

| Action | Виклик |
|--------|--------|
| `Record(x)` | resolve `x`→stream у профілі → `start_recording`-логіка (шлях `stream_commands::start_recording`) |
| `Play(x)` | resolve `x`→stream → `play_stream`-логіка (шлях `player_commands::play_stream`: бере `stream_id`, url резолвить сам) |
| `StopRecording` | `recording_control::stop_all_now(app)` |
| `StopPlayback` | `player.stop_playback(app)` (шлях `player_commands::stop_playback`) |
| `WishAdd(p)` | `add_to_wishlist`-логіка (патерн активного профілю) |
| `WishRemove(p)` | `remove_from_wishlist`-логіка |
| `SwitchProfile(n)` | **безумовний no-op в `execute`** — потрапляє лише у Startup-план (на Forwarded → `IgnoredFlag::Profile`), а там профіль уже застосовано до `AppState::new` (§3.6). Тому `execute` не потребує `CliContext` |

**Обробка `Err` (рішення №6 — без мовчазних збоїв).** `execute` не ковтає
результати: дія, що повернула `Err` (напр. `--record` при браку диску —
`check_disk_space` віддає `Err` ще до менеджера, без жодної `recording-status`;
або `--play` при збої аудіопристрою), мапиться у
`CliFeedback::ActionFailed { action }` (§5). Деталь помилки — у лог; на фронт
іде структурний ключ дії, локалізований через Paraglide.

**Резолвер** (чисто-тестований хелпер): `find_stream<'a>(streams: &'a [StreamInfo],
needle: &str) -> Option<&'a StreamInfo>` — точний збіг `name`, інакше точний збіг
`url`. Немає → `None` → анонс «не знайдено» (§5). Перед резолвом для `--record`/
`--play` валідувати: якщо `needle` схожий на URL (`://`), приймати лише
`http`/`https`-схему; інакше трактувати як назву.

### 3.5 Зміни в `single_instance.rs` (колбек, Forwarded)

Колбек 3E ([single_instance.rs](../../../src-tauri/src/single_instance.rs)) уже
активує вікно (інлайн `show→unminimize→set_focus` + `notify_state_changed`) і
кличе `cli::handle_args`. Зберігаємо ту саму активацію (винесену в хелпер
`activate_window` АБО лишену інлайн — на вибір реалізації), замінюємо хвіст на:

```rust
fn on_second_instance(app: &AppHandle, argv: Vec<String>, _cwd: String) {
    activate_window(app);                       // show→unminimize→set_focus (як зараз)
    crate::tray::notify_state_changed(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {    // НЕ блокувати колбек!
        match crate::cli::parse(&argv) {
            Ok(cli) => crate::cli::execute(&app, crate::cli::plan(cli, CliContext::Forwarded)).await,
            Err(e)  => {
                use clap::error::ErrorKind::*;
                match e.kind() {
                    // help/version форвардити нема куди (нема консолі) — тихо
                    // (NVDA вже озвучив активацію вікна). Лише справжня
                    // parse-error → анонс «невалідні аргументи».
                    DisplayHelp | DisplayHelpOnMissingArgumentOrSubcommand | DisplayVersion => {}
                    _ => crate::cli::feedback(&app, CliFeedback::InvalidArgs), // §5
                }
            }
        }
    });
}
```

> Ця гілка `Err` тепер ДОСЯЖНА (на відміну від наївного «exit перед білдером»):
> 2-га інстанція з невалідним argv не вмирає рано, а форвардить сирий argv (її
> власний `parse` у `run()` НЕ виходить — рішення про exit перенесено в `.setup`,
> куди 2-га не доходить, §3.6). Тож саме тут 1-ша інстанція й озвучує `InvalidArgs`.

> **Чому spawn:** колбек біжить на UI-потоці під синхронним `SendMessageW(
> WM_COPYDATA)` (спека 3E §5) — друга інстанція блокована, доки колбек не
> повернеться. Виконання дій (async, тримають локи менеджера/плеєра) має йти у
> рантайм, щоб колбек повернувся миттєво і друга інстанція швидко вийшла.
> Активацію вікна робимо ДО spawn (синхронно), поки грант foreground дійсний.

### 3.6 Зміни в `lib.rs` (Startup)

`run()` отримує ранній **парсинг** до `tauri::Builder` (бо `--profile` впливає на
вибір профілю), але **рішення про `exit` — у `.setup`**, не перед білдером.
Причина: код перед білдером біжить і в 2-й інстанції (плагін single-instance
завершує її пізніше, у власному setup-хуку під час `.run()`). Якби ми робили
`exit(2)` перед білдером, 2-га інстанція з parse-error вмирала б ДО форвардингу —
і §3.5 ніколи не озвучив би `InvalidArgs`, а §6 «forwarded завжди 0» був би хибним.
У `.setup` доходить **лише 1-ша інстанція**, тож там `exit` безпечний.

```rust
pub fn run() {
    single_instance::allow_foreground_handoff();

    // Ранній парсинг власного argv. args_os (не args) — args() панікує на
    // невалідному UTF-16; кирилиця у назвах/шляхах реальна.
    let argv: Vec<String> = std::env::args_os()
        .map(|s| s.to_string_lossy().into_owned()).collect();
    // НЕ виходимо тут! Цей код біжить і в 2-й інстанції (плагін вб'є її пізніше).
    // Ранній exit(2) тут з'їв би форвардинг. Рішення про exit — у .setup нижче.
    let parsed: Result<cli::Cli, clap::Error> = cli::parse(&argv);

    portable::ensure_data_dirs().expect(...);
    let mut initial_settings = GlobalSettings::load().expect(...);

    // --profile: вибрати профіль ДО AppState::new, щоб вантажити одразу
    // потрібний (а не Default→switch). Лише для Ok-парсингу; на Err override не
    // чіпаємо — все одно вийдемо exit(2) у .setup. Невідома назва → лог-warn + дефолт.
    // Існування — через Profile::list (profile::exists НЕ існує; Profile::load(name).is_ok()
    // важче ще й має side-effect: load("Default") СТВОРЮЄ файл). РАЗОВИЙ override
    // (рішення №7): settings.json тут НЕ зберігаємо.
    if let Ok(cli) = &parsed {
        if let Some(name) = &cli.profile {
            let known = Profile::list(&initial_settings.active_profile)
                .map(|metas| metas.iter().any(|m| &m.name == name))
                .unwrap_or(false);
            if known { initial_settings.active_profile = name.clone(); }
            else { log::warn!("--profile: профіль '{name}' не існує, ігнорую"); }
        }
    }
    // ... builder з single_instance::plugin() першим (без змін) ...
    .setup(move |app| {
        // exit ТУТ, не перед білдером: .setup досяжний лише 1-й інстанції (2-гу
        // плагін завершив раніше). try_parse_from НЕ виходить сам на help/version —
        // повертає Err, виходимо ми. §6.
        let cli = match parsed {
            Ok(c) => c,
            Err(e) => {
                use clap::error::ErrorKind::*;
                match e.kind() {
                    DisplayHelp | DisplayHelpOnMissingArgumentOrSubcommand | DisplayVersion
                        => std::process::exit(0),
                    _   => std::process::exit(2),   // parse-error, ще ДО показу вікна
                }
            }
        };

        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();              // webview ініціалізується у foreground (NVDA)
            if cli.minimize {                   // --minimize = старт у трей (роадмап)
                let _ = w.hide();               // НЕ w.minimize() (то таскбар, не трей)
                crate::tray::notify_state_changed(app.handle());
            }
        }
        // ... AppState::new, tray, shortcuts (без змін) ...

        // Дієві прапори НЕ запускаємо тут: вебв'ю ще не підписане на події
        // (підписка → frontend_ready, App.tsx). Інакше recording-status /
        // cli-feedback земітяться до підписки → втрачене озвучення — той самий
        // гейт, що в scheduler. Складаємо план у керований стан; запустить
        // frontend_ready (§5). .take() там → одноразово (reload вебв'ю безпечний).
        let plan = cli::plan(cli, CliContext::Startup); // profile вже застосовано вище
        app.manage(cli::StartupPlan::new(plan));        // Mutex<Option<Plan>>, дренаж у frontend_ready
        Ok(())
    })
}
```

> **Гейт на `frontend_ready` (нове в v2).** Стартовий `execute` НЕ спавниться у
> `setup` — там вебв'ю ще не підписане на події (воно кличе `frontend_ready` лише
> після початкового завантаження даних, [App.tsx](../../../src/App.tsx)). Інакше
> анонси `--record`/`--play`/`--wish-*` і `cli-feedback` губляться → NVDA мовчить,
> що прямо суперечить рішенню №6. Це **той самий клас бага**, який scheduler уже
> вирішив гейтом на `frontend_ready`
> ([app_commands.rs](../../../src-tauri/src/commands/app_commands.rs)). Рішення:
> зберегти `Plan` у керований `StartupPlan(Mutex<Option<Plan>>)`, а
> `frontend_ready` поряд зі `scheduler.start(app)` робить `.take()` плану і
> `spawn(execute(plan, …))`. `.take()` гарантує одноразовість (повторний
> `frontend_ready` на reload вебв'ю — порожньо). Forwarded цього гейта не потребує
> (вебв'ю 1-ї інстанції давно підписане); вузький виняток — 2-га інстанція,
> запущена ПІД ЧАС старту 1-ї (до її `frontend_ready`): рідкісна гонка, приймаємо.

> `plan(cli, Startup)` усе ще поверне `SwitchProfile`, якщо передали `--profile`;
> у `execute` ця дія — **безумовний** no-op: `SwitchProfile` буває лише в
> Startup-плані (на Forwarded → `IgnoredFlag`), а на старті профіль уже завантажено
> вище. Тому `execute` не приймає `CliContext`. Альтернатива — виключати
> `SwitchProfile` зі Startup-плану; обрано no-op, щоб `plan` лишалась простою і
> симетричною. Зафіксувати в коментарі.
>
> **Персистентність (рішення №7):** override лишається session-only — ми НЕ
> кличемо `settings.save()` тут. Він стане «липким» лише якщо сесія викличе
> будь-який `settings.save()` (напр. `switch_profile`, `save_settings`,
> `set_output_device`). Першозапуск без `settings.json`: `load()` запише дефолт із
> `active_profile="Default"` ДО override → на диску «Default», у сесії — обраний
> профіль (узгоджено з session-only).

## 4. Потік виконання

**Startup (перша інстанція):** `run()` → ранній `parse` (БЕЗ exit) → `--profile`
коригує `active_profile` (лише для Ok) → builder → `setup` (лише 1-ша інстанція):
parse-error → `exit(2)`/help-version → `exit(0)`, ще до показу вікна → показ вікна
(+`minimize` якщо просили) → `AppState::new` → план кладеться у `StartupPlan` →
… → **`frontend_ready`** (вебв'ю готове й підписане) → `scheduler.start` +
`StartupPlan.take()` → `spawn(execute(plan, Startup))` → дії виконуються, кожна
дає анонс/`cli-feedback` (§5).

**Forwarded (повторний запуск):** друга інстанція вмирає у setup-хуку
single-instance (`exit(0)`), віддавши foreground (3E) → перша отримує
`on_second_instance` → активує вікно → `spawn`: `parse` → `plan(_, Forwarded)` →
`execute`. Startup-only прапори потрапляють у `ignored` → warn + анонс
«проігноровано». NVDA озвучує і активацію вікна, і результат дії.

## 5. Зворотний зв'язок (toast + aria-live)

Локалізація анонсів — на фронті (Paraglide, `m.*`), бекенд емітить **структурний
ключ + параметри**, не готовий рядок.

**Що вже покрито наявними каналами** (нічого додавати не треба):
- `--record`/`--play` успіх → `start_recording`/`play_stream` емітять
  `recording-status`/`player-status`, які [App.tsx](../../../src/App.tsx) уже
  озвучує (`m.recording_started`, …).
- `--stop-recording`/`--stop-playback` → ті самі статус-події + `notify_manual_stop`.

**Що потребує нового каналу** (немає бекенд-ініційованого шляху):
- `--wish-add`/`--wish-remove` — команди wishlist не емітять подій (фронт озвучує
  сам після свого виклику); CLI-ініційована зміна мовчазна й не оновлює панель.
- **Збій дії** — `--record`/`--play`/`--stop-*`, що повернули `Err`. Найгостріший
  кейс: `--record` при браку диску (`check_disk_space` віддає `Err` ДО менеджера,
  без жодної `recording-status` → інакше тиша). `execute` ловить `Err` і шле
  `ActionFailed` (рішення №6: мовчазний збій неприйнятний).
- Помилки/едж-кейси CLI: «потік не знайдено», «невалідний URL», «прапор
  проігноровано при повторному запуску», «невалідні аргументи».

**Рішення:** одна нова подія `cli-feedback` з payload:

```rust
#[derive(Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CliFeedback {
    WishlistAdded { pattern: String },
    WishlistRemoved { pattern: String },
    StreamNotFound { needle: String },
    InvalidUrl { needle: String },
    FlagIgnoredForwarded { flag: String },
    ActionFailed { action: String },   // action = "record"|"play"|"stop-recording"|… ; деталь Err → лог
    InvalidArgs,
}
```

Фронт: `useTauriEvent("cli-feedback", …)` в `App.tsx` (той самий патерн, що
`streams-changed` на рядку 335) мапить `kind` → Paraglide-повідомлення →
`announce(..., "polite")` (+ toast для `*Added/Removed`; `ActionFailed` —
`"assertive"` + error-toast). Нові ключі в `src/i18n/messages/{uk,en}.json`:
`cli_wishlist_added`, `cli_wishlist_removed`, `cli_stream_not_found`,
`cli_invalid_url`, `cli_flag_ignored`, `cli_action_failed`, `cli_invalid_args`.
Поза модалкою анонс вимагає `data-live-announcer` (див. live-region-inside-modals).

Додатково: після `--wish-add/remove` емітити подію оновлення панелі. Наявної
події для wishlist немає (`WishlistPanel`/store рефрешиться лише на `profile-changed`,
[useProfileSync.ts](../../../src/hooks/useProfileSync.ts)) — отже **додаємо
`wishlist-changed`** і підписуємо `$wishlist` store, щоб CLI-зміна відобразилась.

**Запуск стартового плану.** `frontend_ready`
([app_commands.rs](../../../src-tauri/src/commands/app_commands.rs)) поряд зі
`scheduler.start(app)` дренує `StartupPlan` (`.take()`) і
`spawn(execute(&app, plan))`. Так усі стартові `cli-feedback`/статус-події летять
ПІСЛЯ підписки вебв'ю (§3.6). Forwarded виконується одразу з колбека (§3.5).

## 6. Exit-коди й Windows-консоль

`main.rs`: `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` —
release не має приєднаної консолі. Наслідки й рішення:

- **Звичайний запуск (подвійний клік):** argv порожній → `parse` повертає Cli з
  усіма None/false → жодних дій → запуск без змін. Exit-коди не зачіпають цей шлях.
- **Parse-error на старті** (`Err` із `kind()` не Display*) → `exit(2)` **на початку
  `.setup`, ДО показу вікна** (не перед білдером — інакше так само вийшла б 2-га
  інстанція, §3.6). Тексту помилки не друкуємо (немає консолі) — це прийнятно для
  скриптового сценарію (важливий код, не текст).
- **`--help`/`--version`** → `clap::Error` типу `DisplayHelp`/`DisplayVersion`
  (визначаємо через `e.kind()`; `try_parse_from` НЕ виходить сам — повертає `Err`;
  `--version` працює лише тому, що в `#[command]` задано `version`, §3.2)
  → `exit(0)` у `.setup`, без видимого тексту. Документоване обмеження; не робимо
  `AttachConsole` (рішення №2).
- **Forwarded** → друга інстанція **завжди `exit(0)`**: вона не парсить сама (її
  `parse` у `run()` НЕ виходить — рішення про exit лише в `.setup`, куди вона не
  доходить), а форвардить сирий argv і вмирає у setup-хуку плагіна. Осмислений код
  назад повернути нічим; невалідні forwarded-аргументи дають лише
  `cli-feedback: InvalidArgs` у першій інстанції (§3.5). Документоване обмеження.

Тобто exit-коди значущі лише для **виходу першої інстанції у `.setup`**: `0` (ок /
help / version), `2` (parse-error). Done-критерій роадмапу «0/1/2» переписано (§8).

## 7. Тестування й приймання

**Юніт-тести (чисті шари — реальна TDD-цінність):**
- `parse`: відомі прапори → очікувана `Cli`; невідомий прапор → `Err`
  (`UnknownArgument`); порожній argv (лише `argv[0]`) → `Cli::default`; `--help`
  → `DisplayHelp`; **`--version` → `DisplayVersion`** (регресія на пропущений
  `version` у `#[command]` — без нього був би `UnknownArgument`).
- `plan`: Startup vs Forwarded — `--profile`/`--minimize` на Forwarded йдуть в
  `ignored`, не в `actions`; порядок дій детермінований; комбінації прапорів.
- `find_stream`: збіг по name; збіг по url; пріоритет name над url; немає → None.
- валідація URL: `http`/`https` приймається; інші схеми → `InvalidUrl`.

`execute` (impure, `&AppHandle`) юніт-тестом не покривається — як і в 3E, це
тонка оркестрація над уже протестованими менеджером/плеєром.

**Ворота складання:** `cargo build`, `cargo test`, `pnpm test`, `pnpm vite:build`.

**Ручна перевірка під NVDA** (основне приймання, розробник тестує слухом):
1. `tapir.exe --record "<name>"` при запущеній інстанції → запис стартує, NVDA
   озвучує і активацію вікна, і «запис розпочато».
2. `--play <url>` з відомим/невідомим URL (анонс «не знайдено»).
3. `--stop-recording` зупиняє все (анонс).
4. `--wish-add "*test*"` → панель оновилась, анонс «додано».
5. `--profile X --minimize` на холодному старті → потрібний профіль, вікно в треї.
6. `--profile X` при запущеній інстанції → ігнор + warn + анонс «проігноровано»,
   активні записи НЕ зупинено.
7. Невалідний прапор на холодному старті → процес не стартує (exit 2); звичайний
   подвійний клік працює як завжди.
8. **Гейт `frontend_ready`:** `--record "<name>"` на **холодному** старті (інстанції
   ще нема) → попри те, що дія йде на самому старті, NVDA таки озвучує «запис
   розпочато» (анонс не загубився до підписки вебв'ю).
9. **Збій дії:** `--record "<name>"` при заповненому диску (поріг disk-space) →
   анонс «не вдалося» + error-toast, а не тиша.
10. Невалідний прапор при **запущеній** інстанції → процес-1 живе; 2-га тихо
    форвардить і виходить `exit(0)`; перша озвучує «невалідні аргументи».

## 8. Переписані Done-критерії 3G

Замість [implementation-phases.md §3G](../../implementation-phases.md):

- [ ] `--record <name|url>` / `--play <name|url>` — старт по збігу в активному
      профілі; не знайдено → анонс, профіль не змінюється; збій (диск/пристрій) → анонс
- [ ] `--stop-recording` / `--stop-playback` зупиняють (reuse наявних шляхів)
- [ ] `--wish-add` / `--wish-remove` керують wishlist активного профілю + оновлюють панель
- [ ] `--profile NAME` вибирає профіль **лише на старті**; на forwarded ігнор+warn
- [ ] `--minimize` стартує у трей **лише на старті**; на forwarded ігнор+warn
- [ ] Повторний запуск проксує argv першій інстанції (готово з 3E)
- [ ] Кожна дія/едж-кейс → toast + aria-live (`cli-feedback` + наявні канали);
      **стартові дії гейтяться на `frontend_ready` — анонс не губиться до підписки вебв'ю**
- [ ] Exit-коди: перша інстанція `exit(2)` на parse-error **на початку `.setup`**
      (до показу вікна), інакше `0`; **forwarded завжди `0` — задокументоване обмеження**
- [ ] `parse`/`plan`/`find_stream`/валідація URL покриті юніт-тестами (вкл. `--version`→`DisplayVersion`)

## 9. Залежності й ризики

- **Нова залежність:** `clap = { version = "4", features = ["derive"] }`. Чистий
  Rust-крейт, без C-залежностей; вписується у release-профіль (`opt-level="s"`,
  lto). `derive` додає `clap_derive` (proc-macro, build-time).
- **Ризик — `clap` друкує у відсутню консоль.** Знято: використовуємо
  `try_parse_from` і обробляємо `clap::Error` самі (НЕ `parse()`, що авто-друкує
  й виходить). Help/version → тихий `exit(0)`.
- **Баг скетчу v1 (знято в v2) — `--version` без `version`.** clap генерує прапор
  `--version` лише за наявності `version` у `#[command]`; без нього `--version` був
  би `UnknownArgument` (exit 2), а §6/§3.6 чекали `DisplayVersion` (exit 0).
  Додано `version = env!("CARGO_PKG_VERSION")` (§3.2); регресія в юніт-тесті (§7).
- **Суперечність v1 (знято в v2) — ранній `exit` у 2-й інстанції.** Скетч робив
  `exit` перед `tauri::Builder`, але цей код біжить і в 2-й інстанції (плагін вб'є
  її пізніше) → parse-error з'їдав би форвардинг, а «forwarded завжди 0» і
  `InvalidArgs`-зворотний-зв'язок ставали хибними. Знято: `exit` перенесено на
  початок `.setup` (досяжний лише 1-й інстанції), §3.6/§6.
- **Суперечність v1 (знято в v2) — стартові анонси до підписки вебв'ю.** Скетч
  спавнив `execute` у `setup`, але вебв'ю підписується на події лише після
  `frontend_ready` → анонси губилися (порушення рішення №6). Знято гейтом: план
  кладеться у `StartupPlan` і дренажиться з `frontend_ready` (§3.6/§5), як у
  scheduler.
- **Ризик — async у sync-колбеці.** Знято через `spawn` (§3.5); активація вікна
  лишається синхронною до spawn.
- **Перевірено (джерело плагіна) — forwarded `argv` містить `argv[0]`.** Друга
  інстанція шле `std::env::args().collect()`, перша отримує повний argv (з шляхом
  EXE першим). Тож `Cli::try_parse_from(argv)` коректний і для startup, і для
  forwarded — фіктивний `argv[0]` НЕ потрібен. (Знахідка E з рев'ю — закрита.)
- **Обмеження плагіна — роздільник `|`.** `tauri-plugin-single-instance` (Windows)
  серіалізує forwarded-дані як `cwd|arg0|arg1|…` (`args.join("|")` →
  `split('|')`). Аргумент, що містить `|`, при forwarding **спотвориться**:
  стосується wishlist-патернів і URL із літеральним `|` (у URL зазвичай %7C —
  безпечно). Низька ймовірність, але реальна. Дії: (а) задокументувати «не
  передавайте `|` у forwarded-аргументах»; (б) опц. при парсингу forwarded
  попереджати, якщо токен містив `|`. Startup-шлях (`args_os`) цієї вади не має.
- **Обмеження плагіна — `std::env::args()` на forwarded.** Друга інстанція форвардить
  через `std::env::args().collect()` (джерело плагіна), що **панікує** на невалідному
  UTF-16 в аргументі. Поза нашим контролем (на startup ми навмисне беремо `args_os`,
  §3.6, але forwarded іде через плагін). Edge-case (рідкісні невалідні-Unicode
  аргументи); приймаємо й документуємо поряд із `|`-обмеженням.
- **Ризик — Startup `--profile` ordering.** Знято: корекція `active_profile` до
  `AppState::new`; `SwitchProfile` у Startup-execute — no-op.
- **Ризик — `--minimize` vs NVDA-старт.** Вікно стартує `visible:false`, у setup
  робимо `show→set_focus` (щоб webview ініціалізувався у foreground — критично для
  NVDA, див. nvda-startup-foreground), і лише ПОТІМ `hide()` у трей. Тобто NVDA
  встигає приєднатися до документа; перевірити ручним сценарієм 5. (Якщо й це дасть
  тишу — відкласти `hide()` на кілька кадрів після готовності webview.)
- **Не-ризик:** `capabilities/`, CSP, i18n-інфраструктура — без змін, окрім нових
  Paraglide-ключів. Колбек робить Rust-side виклики, не нові IPC-команди.

## 10. Відкриті дрібниці (дефолти зафіксовано — переглянути на старті імплементації)

- **`--stop-recording` без аргументу = зупинити все.** Точкове
  `--stop-recording=<name|url>` — відкладено (не в Done-критеріях).
- **`--wish-*` = патерн активного профілю** (wishlist — поле `Profile`, не
  крос-профільний; «глобальний» у v1 означало саме це). У парі з `--profile X`
  додається до wishlist профілю X — порядок дій `SwitchProfile → wish_*` (§3.3) це
  гарантує. Per-stream wishlist через CLI — відкладено.
- **Тихі no-op edge-и (прийнято).** `--stop-recording`, коли нічого не пишеться
  (0 подій), і `--profile Typo` на старті (лише `log::warn`, без анонсу) лишаємо
  без окремого `cli-feedback` — функціонально нічого не сталося. Якщо ручне
  тестування покаже плутанину для незрячого — додати «нічого зупиняти» /
  «профіль не знайдено» у `CliFeedback` пізніше.
- **Кілька дій за один запуск дозволено** (напр. `--stop-playback --record X`),
  порядок детермінований (§3.3). Якщо небажано — обмежити пізніше.
- **Локалізація `--help`** не робиться (текст у консоль усе одно не йде).

## 11. План імплементації

Окремий план імплементації — наступний крок (skill `writing-plans`), розбитий на:
парсер+plan (TDD, вкл. `--version`→`DisplayVersion`) → резолвер+валідація URL (TDD)
→ execute-диспатч (з `Err`→`ActionFailed`) → інтеграція в `lib.rs` (deferred-exit
у `.setup`, `StartupPlan`) / `single_instance.rs` → дренаж `StartupPlan` із
`frontend_ready` → `cli-feedback` + `wishlist-changed` + фронт-listener + i18n-ключі
→ ручна NVDA-перевірка (вкл. сценарії 8–10: гейт, збій дії, forwarded-invalid).
