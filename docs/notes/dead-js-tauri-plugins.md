# Мертві JS-обгортки: чи можна зняти `@tauri-apps/plugin-dialog` і `@tauri-apps/plugin-log`

> Дослідницька нотатка з виміром до запису беклогу
> [p3-dead-js-tauri-plugins](../backlog/done/p3-dead-js-tauri-plugins.md).
> Дата: 2026-09-06. Код Tapir читано на `f838820`, гілка `chore/dead-js-tauri-plugins`
> (робоче дерево, без комітів).
>
> Версії на момент читання. npm: `@tauri-apps/api` 2.10.1, `@tauri-apps/plugin-dialog`
> 2.7.0, `@tauri-apps/plugin-log` 2.8.0, `@tauri-apps/cli` 2.10.1. Крейти
> (`src-tauri/Cargo.lock`): `tauri` 2.10.3, `tauri-build` 2.5.6, `tauri-plugin` 2.5.4,
> `tauri-utils` 2.8.3, `tauri-plugin-dialog` 2.7.0, `tauri-plugin-log` 2.8.0,
> `tauri-plugin-fs` 2.5.0 (транзитивна, від dialog), `rfd` 0.16.0. Середовище:
> Windows 11 10.0.26200, WebView2 152.0.4191.62, rustc 1.98.1, node 26.8.1, pnpm 10.32.1.
>
> Першоджерела читано 2026-09-06 на: `tauri-apps/plugins-workspace` теги
> `dialog-js-v2.7.0`, `log-js-v2.8.0`, `dialog-v2.7.0`, `log-v2.8.0`;
> `tauri-apps/tauri` тег `tauri-cli-v2.10.1`; локальний реєстр cargo
> (`…\registry\src\index.crates.io-1949cf8c6b5b557f`) — саме ті вихідники, які
> компілюються в Tapir; офіційна документація v2.tauri.app.
>
> Роди тверджень позначено явно: **[Дж n]** — першоджерело (номер у списку «Джерела»
> наприкінці), **[Код]** — прочитано в коді Tapir на `f838820`, **[Вимір]** — виміряно
> в цій сесії, **[Висновок]** — власне міркування поверх процитованого.

## Коротко (TL;DR)

- **Обидва npm-пакети — чисті IPC-обгортки без жодного побічного ефекту.** У тарболах є
  рівно `dist-js/`, `README.md`, `LICENSE`, `package.json`; жодного `postinstall`, жодного
  top-level виклику в `dist-js/index.js`. Увесь їхній вміст — `invoke('plugin:dialog|…')`
  і `invoke('plugin:log|log')` плюс `listen('log://log')` [Дж 1, 2; Вимір].
- **Дозволи `dialog:default` / `log:default` приходять із Rust-крейта, не з npm.** Ланцюг
  повністю всередині cargo: `permissions/default.toml` у крейті → `tauri_plugin::Builder`
  → `cargo:PERMISSION_FILES_PATH=…` → через `links = "tauri-plugin-dialog"` цар стає
  `DEP_TAURI_PLUGIN_DIALOG_PERMISSION_FILES_PATH` → `tauri-build` у застосунку читає його
  в `read_permissions()`. npm у цьому ланцюзі не згадується жодного разу [Дж 3–8].
  Заразом це видно й у самому Tapir: `src-tauri/gen/schemas/acl-manifests.json` несе текст
  `permissions/default.toml` крейта **дослівно** [Код, Вимір].
- **JS-бік логера потрібен рівно для одного — `TargetKind::Webview`.** Це єдине місце в
  плагіні, що емітить подію `log://log`, і його доккоментар каже прямо: «This requires the
  webview to subscribe to log events, via this plugins `attachConsole` function». Tapir має
  тільки `Folder` і `Stdout` [Дж 5; Код].
- **Головний позитивний аргумент за зняття — не «зайві 20 рядків локу», а латентна пастка
  Tauri CLI.** `check_mismatched_packages` звіряє major.minor **кожного** відомого плагіна:
  крейт `tauri-plugin-<p>` проти npm `@tauri-apps/plugin-<p>`. На `tauri build` розбіжність
  — **Err**, тобто збірка падає (обхід — прапорець `--ignore-version-mismatches`); на
  `tauri dev` — `log::error!` у фоновому потоці. Пара потрапляє в перевірку **лише якщо
  присутні обидві сторони**, тож зняття npm-пакета цю пару з перевірки прибирає [Дж 10, 11].
  Пастка не гіпотетична: станом на сьогодні крейт `tauri-plugin-log` 2.8.0, а остання
  версія крейта — 2.9.1; самотній `cargo update` підняв би крейт до 2.9.x при npm 2.8.0 і
  **зламав би `tauri build`** [Вимір].
- **Питання-стоп із запису закрите, і в несподіваний бік: потреба «відкрити діалог із
  webview» уже видима й уже реалізована — без npm-пакета.** `openDirectoryPicker()` у
  `src/lib/tauri.ts:530` кличе власну Tapir-команду `open_directory_picker`, яка на боці
  Rust робить `blocking_pick_folder()` [Код]. А команди `plugin:dialog|open`/`|save`,
  які кличе npm-обгортка, самі всередині роблять **ті самі** `blocking_pick_file()` /
  `blocking_pick_folder()` — тобто JS-шлях не дає іншого механізму, лише інший фасад [Дж 4].
- **Вимір зроблено; ворота зелені з першого прогону.** `pnpm remove` обох пакетів дає
  `-2` рядки в `package.json` і `-20` у `pnpm-lock.yaml`; резолюція `@tauri-apps/api`
  **не змінилась** (2.10.1 до і після). `pnpm vite:build` — 2,19 с, чисто; `pnpm test` —
  101 файл / 1249 тестів зелені; `pnpm typecheck` — чисто [Вимір].
- **Для скрінрідера різниці немає.** Обидва шляхи сходяться в один виклик
  `rfd::AsyncFileDialog` на головному потоці — це буквально ті самі рядки коду плагіна
  [Дж 4]. Єдина справжня різниця в поведінці — `set_parent(&window)`, який JS-шлях робить
  на Windows/macOS автоматично, а Tapir у своїх викликах **не робить** [Дж 4; Код]; і це
  лікується одним рядком Rust, а не npm-пакетом.
- **Рекомендація: зняти обидва.** Тригер повернення — поява `TargetKind::Webview` у
  конфігурації логера або першої функції, яку Rust-API діалогу не покриває. Ціна
  повернення — один `pnpm add`, +20 рядків локу, **нуль** змін у Rust і в capabilities.

## Питання (чекліст завдання)

| # | Питання | Відповідь | Де в нотатці |
|---|---|---|---|
| 1 | Що роблять ці два npm-пакети; чи є щось, що працює без явного імпорту | Чисті IPC-обгортки. Побічних ефектів немає: ні lifecycle-скриптів у `package.json`, ні top-level коду в `dist-js` | §1 |
| 2 | Чи ламає зняття Rust-бік | Ні. Дозволи — з крейта; JS-бік логера потрібен лише для `TargetKind::Webview`; Rust-діалог JS не кличе ніколи | §2 |
| 3 | Чи звіряє Tauri CLI версії npm ↔ крейт для плагінів | **Так**, major.minor, і на `tauri build` це помилка. Зняття прибирає пару з перевірки, тобто **гасить** латентний ризик | §3 |
| 4 | Ціна у `pnpm-lock.yaml` | −20 рядків; резолюція `@tauri-apps/api` не змінюється (обидва плагіни залежали від тієї самої 2.10.1) | §4 |
| 5 | Чи видима потреба відкривати діалог із webview | Видима й **уже задоволена** власною командою `open_directory_picker`; npm-обгортка додає лише `set_parent` і FS-scope, які Tapir не потребує | §5 |
| 6 | Різниця для NVDA між Rust- і JS-діалогом | Нативний діалог той самий (`rfd` на головному потоці). Відрізняється лише власник вікна | §6 |

---

## 1. Що роблять ці два npm-пакети

### 1.1. Вміст тарболів

Розпаковані пакети (`node_modules` після `pnpm install`, до зняття) [Вимір]:

| Пакет | Вміст | `files` у `package.json` | Залежності |
|---|---|---|---|
| `@tauri-apps/plugin-dialog@2.7.0` | `dist-js/{index.js,index.cjs,index.d.ts,init.d.ts}`, `README.md`, `LICENSE.spdx`, `package.json` | `["dist-js", "README.md", "LICENSE"]` | `@tauri-apps/api: ^2.10.1` |
| `@tauri-apps/plugin-log@2.8.0` | `dist-js/{index.js,index.cjs,index.d.ts}`, `README.md`, `LICENSE.spdx`, `package.json` | те саме | `@tauri-apps/api: ^2.8.0` |

Обидва `package.json` мають рівно один скрипт — `"build": "rollup -c"`, і це **не**
lifecycle-хук npm/pnpm: він не запускається ні на `install`, ні на `postinstall`. Жодного
`postinstall`, `preinstall`, `prepare` немає [Вимір].

### 1.2. Що всередині

`plugins/dialog/guest-js/index.ts` @ `dialog-js-v2.7.0`: один імпорт
`import { invoke } from '@tauri-apps/api/core'`, п'ять експортованих функцій —
`open`, `save`, `message`, `ask`, `confirm` — і рівно два імені команд:
`plugin:dialog|open`, `plugin:dialog|save`, `plugin:dialog|message`. Top-level коду немає
[Дж 1].

`plugins/log/guest-js/index.ts` @ `log-js-v2.8.0`: імпорти `invoke` з
`@tauri-apps/api/core` і `listen` з `@tauri-apps/api/event`; п'ять функцій рівнів
(`trace`…`error`) через одну внутрішню, яка робить `invoke('plugin:log|log', …)`; плюс
`attachLogger(fn)` і `attachConsole()`, обидва — обгортки над
`listen('log://log', …)`. Top-level коду немає [Дж 2]. Хвіст зібраного
`dist-js/index.js` — один рядок `export { LogLevel, attachConsole, attachLogger, debug,
error, info, trace, warn }`, тобто в бандлі теж нічого не виконується на імпорті [Вимір].

**[Висновок]** Нічого, що працювало б «саме собою». Пакет, який ніхто не імпортує, у
Tapir робить рівно нуль роботи: Vite його не бачить (це вже написано в записі й
підтверджується виміром §7), а рантайм про нього не знає.

### 1.3. Один нюанс: `window.__TAURI__` приходить не з npm

Обидва плагіни в `build.rs` кличуть `.global_api_script_path("./api-iife.js")` [Дж 3], а
`tauri_utils::plugin::define_global_api_script_path` друкує
`cargo:GLOBAL_API_SCRIPT_PATH=<абсолютний шлях у крейті>`; далі `tauri-build` збирає всі
такі шляхи в `save_global_api_scripts_paths` [Дж 7, 8]. Тобто навіть шлях
`withGlobalTauri` обслуговує **файл усередині крейта**, а не npm-пакет. Сам
`api-iife.js` крейта самодостатній — він починається з `if("__TAURI__"in window)` і несе
власні копії `invoke`/`transformCallback` замість імпорту з `@tauri-apps/api` [Дж 5, Вимір].

У Tapir `withGlobalTauri` не встановлено взагалі (як і секції `plugins`) — у
`tauri.conf.json` є лише `productName`, `identifier`, `build`, `app`, `bundle` [Код]. Отже
цей шлях і так вимкнений; згадую його тільки щоб закрити питання «а раптом npm-пакет
потрібен для глобалів».

Побічно: крейти самі несуть `guest-js/index.ts` і `package.json` того самого npm-пакета
(це монорепо, і тарбол крейта тягне вихідники JS) [Вимір]. Тобто джерело JS-обгортки
фізично лежить у `~/.cargo/registry` навіть після зняття npm-залежності.

---

## 2. Чи ламає зняття Rust-бік

### 2.1. Звідки беруться `dialog:default` і `log:default` — вирішальне питання

Ланцюг цілком у cargo, крок за кроком:

1. **Крейт несе дозволи файлами.** `tauri-plugin-dialog-2.7.0/permissions/` містить
   `default.toml`, `ask.toml`, `confirm.toml`, `schemas/schema.json` і
   `autogenerated/commands/{open,save,message}.toml`. `default.toml` дослівно:
   `permissions = ["allow-message", "allow-save", "allow-open"]`.
   `tauri-plugin-log-2.8.0/permissions/default.toml` — `permissions = ["allow-log"]`
   [Дж 4, 5].
2. **`build.rs` плагіна перетворює їх на дані для збірки.** `tauri_plugin::Builder::new(COMMANDS)`,
   де `COMMANDS = &["open", "save", "message"]` (dialog) і `&["log"]` (log) [Дж 3].
   У `try_build` — `acl::build::autogenerate_command_permissions(&commands_dir, self.commands, "", true)`
   і `acl::build::define_permissions("./permissions/**/*.*", &name, &out_dir, |_| true)?`,
   далі `tauri_utils::acl::build::generate_allowed_commands(&out_dir, None, permissions_map)?`
   [Дж 6].
3. **`define_permissions` віддає шлях назовні через cargo.** Друкує
   `cargo:{PERMISSION_FILES_PATH_KEY}={}` — тобто `cargo:PERMISSION_FILES_PATH=<OUT_DIR>/<pkg>-permission-files`
   [Дж 7]. Обидва крейти мають у `Cargo.toml` `links = "tauri-plugin-dialog"` /
   `links = "tauri-plugin-log"` [Дж 4, 5], а `try_build` цього навіть **вимагає**:
   `std::env::var("CARGO_MANIFEST_LINKS").map_err(|_| Error::LinksMissing)?` [Дж 6]. Саме
   ключ `links` змушує cargo прокинути метадані в залежні крейти як
   `DEP_TAURI_PLUGIN_DIALOG_PERMISSION_FILES_PATH`.
4. **`tauri-build` застосунку їх зчитує.** `acl::build::read_permissions()` сканує
   `env::vars_os()` на `DEP_*_PERMISSION_FILES_PATH`, знімає префікс `tauri-plugin-` з
   імені крейта й кладе дозволи в мапу під іменем плагіна [Дж 7]; викликається з
   `tauri-build-2.5.6/src/acl.rs:145` [Дж 8].

**npm у цьому ланцюзі не згадується жодного разу** [Дж 3, 6, 7, 8]. Офіційна документація
каже те саме коротше: файли дозволів плагіна лежать у `permissions/` **усередині крейта
плагіна** [Дж 15].

Це видно і в самому Tapir: `src-tauri/gen/schemas/acl-manifests.json` (файл під git,
75 786 байт) містить `dialog.default_permission` з тим самим текстом опису й тим самим
`["allow-message","allow-save","allow-open"]`, що й `default.toml` крейта, а
`dialog.permissions` — десять ключів `allow-*`/`deny-*` для трьох команд плюс
`ask`/`confirm`; `log.permissions` — `allow-log`/`deny-log` [Код, Вимір].

**Висновок пункту:** зняття npm-пакета не може вплинути на ACL — його там немає.

### 2.2. Побічне спостереження: самі `dialog:default` / `log:default` у capabilities теж мертві

ACL перевіряється **лише на IPC**. `RuntimeAuthority::resolve_access` має доккоментар
«Checks if the given IPC execution is allowed…», і поза власним модулем його кличуть рівно
два місця, обидва в `tauri-2.10.3/src/webview/mod.rs` (рядки 1440 і 1778) [Дж 9].
Rust-виклик `app.dialog().file().blocking_pick_folder()` не проходить через IPC узагалі.

**[Висновок]** Оскільки з webview ніхто не кличе ні `plugin:dialog|*`, ні `plugin:log|log`
(у `src/` немає жодного відповідного `invoke`) [Код], рядки `"dialog:default"` і
`"log:default"` у `src-tauri/capabilities/default.json` теж нічого не обслуговують. Це
**не** частина цієї рекомендації і **не перевірено прогоном** — знімати їх наосліп не
варто, бо ціна помилки («плагін мовчки не працює», як застерігає `tech-stack.md:206-207`)
несиметрична. Це матеріал для окремого запису, і саме там йому місце.

Заразом: `docs/tech-stack.md:201` описує capabilities як «дозволи IPC — ядро плюс чотири
плагіни, **які webview кличе**: `dialog`, `log`, `global-shortcut`, `notification`». Це
твердження неточне вже сьогодні, до будь-якого зняття [Код]. Нотатка документів не
редагує; фіксую як знахідку.

### 2.3. Чи потрібен `@tauri-apps/plugin-log` для `Folder`/`Stdout`

Ні. У `tauri-plugin-log-2.8.0/src/lib.rs` подія `log://log` емітиться рівно в одній гілці
`match` по `TargetKind` — у `TargetKind::Webview` (рядки 642–654):

```rust
TargetKind::Webview => {
    let app_handle = app_handle.clone();
    fern::Output::call(move |record| {
        let payload = RecordPayload { … };
        let app_handle = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            let _ = app_handle.emit("log://log", payload);
        });
    })
}
```

Доккоментар самого варіанта каже прямо [Дж 5]:

> «Forward logs to the webview (via the `log://log` event). This requires the webview to
> subscribe to log events, via this plugins `attachConsole` function.»

Документація v2.tauri.app повторює це як зв'язану пару: увімкнути
`TargetKind::Webview` у Rust **і** викликати `attachConsole` у фронтенді [Дж 14].

Tapir конфігурує `Target::new(TargetKind::Folder { path: portable::logs_dir(), file_name:
Some("tapir".into()) })` і `Target::new(TargetKind::Stdout)` — Webview-таргета немає
[Код: `src-tauri/src/lib.rs:112-131`]. Отже подія `log://log` не емітиться ніколи, і
`attachLogger`/`attachConsole` не мають на що підписуватись.

Друга (і єдина решта) поверхня JS-боку — команда `plugin:log|log`: плагін реєструє
`plugin::Builder::new("log").invoke_handler(tauri::generate_handler![commands::log])`
[Дж 5]. Вона потрібна лише щоб **webview писав у той самий лог**. Tapir цього не робить:
фронтенд не має жодного `invoke("plugin:log|log")` [Код].

### 2.4. Чи кличе `tauri-plugin-dialog` (Rust) JS-бік

Ні, у жодному режимі. `src/commands.rs` — це вхід **із** webview (`plugin:dialog|open`,
`|save`, `|message`), а не вихід у нього; `src/desktop.rs` працює з `rfd` напряму;
`src/lib.rs` (`FileDialogBuilder`, `MessageDialogBuilder`) не має жодної згадки про emit,
подію чи webview-скрипт [Дж 4]. Реєстрація команд відбувається незалежно від того, чи їх
хтось кличе; незатребувана команда — просто мертвий хендлер.

---

## 3. Чи звіряє Tauri CLI версії npm-пакетів плагінів із крейтами

**Так — і це найважливіший практичний висновок нотатки.**

`crates/tauri-cli/src/info/plugins.rs` @ `tauri-cli-v2.10.1` будує два паралельні списки
[Дж 10]:

```rust
let crate_names: Vec<String> = iter::once("tauri".to_owned())
  .chain(know_plugins.keys().map(|p| format!("tauri-plugin-{p}")))
  .collect();
let npm_names: Vec<String> = iter::once("@tauri-apps/api".to_owned())
  .chain(know_plugins.keys().map(|p| format!("@tauri-apps/plugin-{p}")))
  .collect();
```

Тобто перевірка `tauri` ↔ `@tauri-apps/api`, про яку в записі йшлося, — це лише **перший
елемент** того самого списку; плагіни звіряються тим самим механізмом. Критерій:

```rust
.filter(|p| p.crate_version.major != p.npm_version.major
         || p.crate_version.minor != p.npm_version.minor)
```

— тобто розбіжність **major або minor** (patch дозволено).

Ключова деталь для нашого питання — як формуються пари:

```rust
let (crate_name, crate_version) = rust_plugins.remove_entry(crate_name)?;
let (npm_name, npm_version) = npm_plugins.remove_entry(npm_name)?;
```

Обидва `?` у `filter_map`: **якщо npm-пакета немає, пара просто не потрапляє в перевірку**
[Дж 10]. Отже зняття робить перевірку для цих двох плагінів неможливою — не «тихішою», а
відсутньою.

Наслідки розбіжності різні за суворістю [Дж 11]:

| Команда | Що робить | Обхід |
|---|---|---|
| `tauri build` | `return Err(error)` — збірка **падає**: «Found version mismatched Tauri packages. Make sure the NPM package and Rust crate versions are on the same major/minor releases» | прапорець `--ignore-version-mismatches` («Only use this when you are sure the mismatch is incorrectly detected…») |
| `tauri dev` | `std::thread::spawn` + `log::error!` — гучно, але не фатально | — |

**Пастка не гіпотетична.** `package.json` тримає `^2`, `Cargo.toml` — `"2"`; лок-файли
незалежні (`pnpm-lock.yaml` і `Cargo.lock` оновлюються різними командами). Станом на
2026-09-06 [Вимір, `pnpm tauri info`]:

- `tauri-plugin-log` 🦀 2.8.0, остання 2.9.1; `@tauri-apps/plugin-log` ⱼₛ 2.8.0, остання 2.9.1;
- `tauri-plugin-dialog` 🦀 2.7.0, остання 2.7.3; `@tauri-apps/plugin-dialog` ⱼₛ 2.7.0, остання 2.7.3.

Тобто **самотній `cargo update`**, який підняв би `tauri-plugin-log` до 2.9.x, залишивши
npm на 2.8.0, зробив би `tauri build` червоним із помилкою, що не має жодного стосунку до
коду. Це і є справжня ціна тримати мертвий пакет.

### 3.1. Чи стане тихіше або гучніше в `tauri info`

Прогнав до і після [Вимір]. Секція `[-] Plugins`:

| | До зняття | Після зняття |
|---|---|---|
| Статус секції | `[-]` | `[-]` (без змін) |
| `@tauri-apps/plugin-dialog` ⱼₛ | `2.7.0 (outdated, latest: 2.7.3)` | `not installed!` |
| `@tauri-apps/plugin-log` ⱼₛ | `2.8.0 (outdated, latest: 2.9.1)` | `not installed!` |
| Рядків `not installed!` | 4 (`global-shortcut`, `single-instance`, `fs`, `notification`) | 6 |

**[Висновок]** Формально «гучніше» на два рядки, по суті — навпаки: секція стає
**однорідною**. Сьогодні вона бреше читачеві двома способами одразу — показує два
встановлені JS-пакети, які ніхто не імпортує, і ще й позначає їх `outdated`, тобто
запрошує їх оновлювати. Після зняття всі шість плагінів Tapir виглядають однаково:
крейт є, JS-обгортки немає. Це рівно та форма, яку `tech-stack.md:32-34` вже описує
словами («З боку JS імпортується лише `@tauri-apps/api`»). Маркер `not installed!` тут не
помилка, а стан: `nodejs_section_item` друкує його, коли версію не знайдено, без будь-якого
статусу-провалу [Дж 12].

---

## 4. Ціна у `pnpm-lock.yaml`

`pnpm remove @tauri-apps/plugin-dialog @tauri-apps/plugin-log` [Вимір]:

```
 package.json   |  2 --
 pnpm-lock.yaml | 20 --------------------
 2 files changed, 22 deletions(-)
```

Двадцять рядків локу — три блоки:

| Блок | Рядків | Що зникає |
|---|---|---|
| `importers['.'].dependencies` | 6 | два записи `specifier: ^2` / `version: 2.7.0` і `2.8.0` |
| `packages` | 6 | дві `resolution: {integrity: sha512-…}` |
| `snapshots` | 8 | два блоки `dependencies: '@tauri-apps/api': 2.10.1` |

**Резолюція `@tauri-apps/api` не змінилась: 2.10.1 до і після** [Вимір]. Це варто
пояснити, а не просто зафіксувати: `plugin-dialog@2.7.0` вимагав `@tauri-apps/api: ^2.10.1`,
`plugin-log@2.8.0` — `^2.8.0`, а пряма залежність Tapir — `^2`. Найвужчий із трьох
діапазонів (`^2.10.1`) уже задовольнявся тією самою версією, що й найширший, тож зняття
не піднімає й не опускає стелю. Іншими словами, ризик «зняли пакет — переїхала версія
сусіда», який у цьому проєкті вже ловили на `Cargo.lock`
([dead-dependencies](../backlog/done/p2-dead-dependencies.md)), тут **виміряно й не
підтвердився**.

`node_modules` після зняття не містить каталогів `@tauri-apps/plugin-*` узагалі [Вимір].

---

## 5. Питання-стоп: чи потрібен буде діалог із webview

### 5.1. Потреба вже видима — і вже задоволена без npm

Запис просив перевірити, «чи не з'явиться потреба у JS-обгортці `plugin-dialog`, коли
діалог доведеться відкривати **з** webview (наприклад, вибір теки в налаштуваннях)».

Ця потреба не «з'явиться» — вона є, і закрита. `src/lib/tauri.ts:530-532` [Код]:

```ts
export async function openDirectoryPicker(defaultPath?: string): Promise<string | null> {
  return invoke("open_directory_picker", { defaultPath: defaultPath ?? null });
}
```

Викликають `ProfileRecordingTab.tsx` і `SettingsDialog` [Код]. На боці Rust —
`settings_commands.rs:82-97`: `tokio::task::spawn_blocking(move || { … builder.blocking_pick_folder() })`.

Тобто «діалог із webview» у Tapir реалізовано як **власну команду**, а не як плагінну.
Вибір теки записів у налаштуваннях — це буквально приклад із запису, і він працює.

Усі п'ять місць, де Tapir відкриває нативний діалог [Код]:

| Місце | Виклик | Контекст потоку |
|---|---|---|
| `profile_commands.rs:67-71` (`export_profile`) | `blocking_save_file()` | `async fn` команда |
| `profile_commands.rs:83-86` (`begin_import`) | `blocking_pick_file()` | `async fn` команда |
| `stream_io_commands.rs:118-121` | `blocking_pick_file()` | `async fn` команда |
| `stream_io_commands.rs:310-314` | `blocking_save_file()` | `async fn` команда |
| `settings_commands.rs:88-92` (`open_directory_picker`) | `blocking_pick_folder()` | `async fn` + `spawn_blocking` |

### 5.2. Що JS-API дає такого, чого немає в Rust-API

Прочитав `plugins/dialog/src/commands.rs` — тобто **точну** реалізацію того, що робить
npm-обгортка, коли її кличуть [Дж 4]. Результат: команда `open` сама будує
`FileDialogBuilder` і кличе ті самі `blocking_pick_file()` / `blocking_pick_files()` /
`blocking_pick_folder()` / `blocking_pick_folders()`, що й Tapir. Понад це вона робить
рівно дві речі:

| Що додає JS-шлях | Код | Чи потрібне Tapir |
|---|---|---|
| Батьківське вікно | `#[cfg(any(windows, target_os = "macos"))] dialog_builder = dialog_builder.set_parent(&window);` | Корисне (див. §6), але доступне з Rust одним рядком — `set_parent` є в публічному `FileDialogBuilder` [Дж 4] |
| Гранти FS-scope на обраний шлях | `window.try_fs_scope()` → `s.allow_file(&path)` / `s.allow_directory(&path, recursive)` плюс `window.state::<tauri::scope::Scopes>()` | Ні: `tauri-plugin-fs` у Tapir присутній лише транзитивно (залежність dialog), а файли читає й пише Rust [Код, Вимір] |

Плюс дрібниці, які на десктопі нічого не роблять: `pickerMode` і `fileAccessMode` —
за коментарями в коді це мобільні опції, «On desktop, this option is ignored» [Дж 4].

**[Висновок]** JS-API діалогу не має жодної можливості, якої немає в Rust-API. Технічного
тиску переносити діалог у JS немає.

### 5.3. Пастки `blocking_pick_folder` — реальні, але не на користь JS

Механіка, а не порада. `blocking_*` — це макрос [Дж 4]:

```rust
macro_rules! blocking_fn {
    ($self:ident, $fn:ident) => {{
        let (tx, rx) = sync_channel(0);
        let cb = move |response| { tx.send(response).unwrap(); };
        $self.$fn(cb);
        rx.recv().unwrap()
    }};
}
```

А неблокувальна половина (`pick_folder` і сусіди) робить
`handle.run_on_main_thread(move || { … })` [Дж 4]. Звідси доккоментар «This is a blocking
operation, and should *NOT* be used when running on the main thread» — не стилістична
порада, а вимога: головний потік, що чекає на `rx.recv()`, ніколи не виконає замикання,
яке сам собі поставив у чергу. Приклад у документації плагіна показує саме
`#[tauri::command] async fn` [Дж 4] — тобто те, що робить Tapir.

**[Висновок]** Пастка справжня, але вона однакова для обох шляхів: плагінна команда `open`
теж `async` і теж кличе `blocking_*`. Перехід на JS її не прибирає — він лише ховає
рішення про потік у чужий код.

**Відкрите питання поруч (не в темі запису, але знайдено дорогою).** `src-tauri/src/lib.rs:204`
викликає `app.dialog().message(…).blocking_show()` **всередині `.setup(…)`** [Код].
`blocking_show` — той самий `blocking_fn!`, а `show_message_dialog` теж іде через
`run_on_main_thread` [Дж 4]; хук `setup` виконується на головному потоці до старту циклу
подій. Тобто на шляху «`AppState::new` впав» замість модального повідомлення можливе
зависання. **Не перевірено прогоном** — шлях помилковий і в цій сесії не відтворювався.
Це окремий дефект, не аргумент у цій нотатці.

### 5.4. Ціна повернення

Один `pnpm add @tauri-apps/plugin-dialog` (або `-log`): +20 рядків локу (діф §4
симетричний), **нуль** змін у Rust, **нуль** змін у `capabilities/default.json` —
`dialog:default` вже дає `allow-open`, `allow-save`, `allow-message`, а `ask`/`confirm` із
JS ідуть у ту саму команду `plugin:dialog|message` [Дж 1, 4]. Для логера `log:default`
вже дає `allow-log`; єдине, що довелось би дописати в Rust, — `Target::new(TargetKind::Webview)`.

Тобто повернення — це один рядок команди й один комміт, без археології.

---

## 6. Доступність: чи є різниця для NVDA

Ні, і це підтверджується кодом, а не міркуванням.

Обидва шляхи — і `app.dialog().file().blocking_pick_folder()` з Tapir, і
`plugin:dialog|open` з JS-обгортки — сходяться в **одну й ту саму функцію**
`tauri_plugin_dialog::desktop::pick_folder`, яка робить [Дж 4]:

```rust
let _ = handle.run_on_main_thread(move || {
    let dialog = AsyncFileDialog::from(dialog).pick_folder();
    std::thread::spawn(move || f(tauri::async_runtime::block_on(dialog)));
});
```

Тобто той самий `rfd::AsyncFileDialog` (rfd 0.16.0), той самий головний потік, той самий
нативний діалог Windows. Різниці в дереві доступності бути не може — це один процес, одне
вікно, один рушій діалогу.

**Єдина справжня різниця — власник вікна.** Команда `open` плагіна робить
`#[cfg(any(windows, target_os = "macos"))] dialog_builder.set_parent(&window)`, а
`save` — `#[cfg(desktop)] dialog_builder.set_parent(&window)` [Дж 4]. У Tapir жоден із
п'яти викликів `set_parent` не робить [Код] — грепом по `src-tauri/src/` знайдено нуль
входжень.

**[Висновок]** Наслідки власника — модальність щодо головного вікна, Z-порядок і те, куди
повертається фокус після закриття діалогу. Для NVDA це може мати значення, але
**виміром це не перевірено** (ручного прогону в цій сесії не було), тож заношу як гіпотезу,
а не факт. Важливо інше: якщо перевірка колись покаже, що батько потрібен, лікується це
рядком `.set_parent(&window)` у Rust, а не npm-пакетом. npm-обгортка тут не рятівник,
а лише інший спосіб дійти до того самого `set_parent`.

---

## 7. Вимір: ворота

Зроблено в робочому дереві `chore/dead-js-tauri-plugins` над `f838820`; зміни в
`package.json` і `pnpm-lock.yaml` **не закомічено** [Вимір].

| Ворота | Результат | Час |
|---|---|---|
| `pnpm vite:build` | зелено; `3845 modules transformed`; `dist/assets/index-DuR0tJit.js 997.35 kB` (та сама попередня warning про розмір чанка, не пов'язана зі зняттям) | 2,19 с |
| `pnpm test` | зелено **з першого прогону**: `Test Files 101 passed (101)`, `Tests 1249 passed (1249)` | 31,15 с |
| `pnpm typecheck` | зелено, порожній вивід | — |

Холодного хибно-червоного прогону vitest (відома пастка проєкту) не сталося — перезапуск
не знадобився.

`pnpm tauri info` після зняття: секції Environment `[✔]`, Packages `[-]`, Plugins `[-]`,
App `[-]` — те саме, що й до зняття; змінилися лише два рядки (§3.1). Помилок і
попереджень про розбіжність версій немає [Вимір].

`cargo`-ворота (`cargo test`, `cargo clippy`) **не проганялись**: зміни в JS-маніфестах
Rust-збірку не торкаються, а `just check` у цій сесії не запускався. Це свідома прогалина,
не висновок.

---

## Рекомендація

**Зняти обидва пакети.** Підстави, у порядку ваги:

1. **Вони нічого не тримають.** Дозволи ACL приходять із крейтів (§2.1), `withGlobalTauri`
   обслуговує файл усередині крейта (§1.3), JS-бік логера має сенс лише з
   `TargetKind::Webview`, якого немає (§2.3), а Rust-діалог до JS не звертається (§2.4).
2. **Вони несуть латентну ціну, якої запис не бачив.** `tauri build` **падає** на
   розбіжності major.minor між крейтом і npm-пакетом плагіна, і сьогоднішня дистанція
   (крейт `tauri-plugin-log` 2.8.0 проти доступної 2.9.1) робить цей сценарій одним
   `cargo update` (§3).
3. **Питання-стоп закрите з надлишком.** Потреба відкривати діалог із webview уже
   реалізована власною командою, а JS-API не має жодної можливості поза Rust-API (§5).
4. **Вимір чистий.** −20 рядків локу, резолюція `@tauri-apps/api` не змінилась, три
   ворота зелені з першого прогону (§4, §7).

**Тригер повернення** (будь-який):

- у конфігурацію логера додається `Target::new(TargetKind::Webview)` — тоді
  `@tauri-apps/plugin-log` потрібен обов'язково, бо без `attachConsole` подія `log://log`
  нікуди не приходить [Дж 5, 14]; **або**
- фронтенд має відкрити діалог із можливістю, якої немає в Rust-API `FileDialogBuilder` /
  `MessageDialogBuilder` — на 2.7.0 таких можливостей не знайдено (§5.2), тож тригер
  спрацює лише після зміни в самому плагіні; **або**
- з'являється потреба в FS-scope-грантах на обраний користувачем шлях, тобто фронтенд
  починає читати/писати файли через `tauri-plugin-fs` замість Rust (§5.2).

Ціна повернення — один `pnpm add`, +20 рядків локу, нуль змін у Rust і в capabilities (§5.4).

**Що НЕ входить у рекомендацію:** знімати `"dialog:default"` і `"log:default"` із
`capabilities/default.json`. Вони так само нічого не обслуговують (§2.2), але це окреме
питання з іншою ціною помилки, і воно заслуговує власного запису з ручною перевіркою.

---

## Що перевірено й не підтвердилось

- **«Зняття може змінити резолюцію `@tauri-apps/api`.»** Обидва плагіни справді залежать
  від `@tauri-apps/api` з власними піном (`^2.10.1` і `^2.8.0`), але діф локу показує:
  версія лишилась 2.10.1 [Вимір]. Гіпотеза правильна за формою, хибна за фактом.
- **«npm-пакет може мати build-хук або side-effect.»** Ні: `files` обмежує тарбол трьома
  елементами, у `scripts` лише `build` (не lifecycle), `dist-js/index.js` не виконує нічого
  на імпорті [Вимір, Дж 1, 2].
- **«CLI сварить лише на `@tauri-apps/api` ↔ крейт `tauri`.»** Хибно: та сама перевірка
  покриває всі відомі плагіни, і `tauri` в ній — просто перший елемент списку [Дж 10].
- **«JS-обгортка дає інший, менш блокувальний спосіб відкрити діалог.»** Хибно: команда
  `open` плагіна сама кличе `blocking_pick_*` [Дж 4].
- **«Для NVDA JS-діалог і Rust-діалог — різні речі.»** Хибно на рівні коду: один і той
  самий `rfd::AsyncFileDialog` на головному потоці [Дж 4].

## Чого джерела не кажуть

- **Чи справді `set_parent` змінює поведінку NVDA.** Код різницю показує (§6), ручного
  прогону не було. Якщо колись з'явиться підозра на «фокус після закриття діалогу», це
  перше місце, куди дивитись — і перевіряти треба прогоном, а не читанням.
- **Чи зависає `blocking_show()` у `setup`.** Механізм (`run_on_main_thread` + `recv`)
  на це вказує (§5.3), але шлях помилковий і в цій сесії не відтворювався. Відкрите
  питання, окреме від запису.
- **Чи потрібні `dialog:default` / `log:default` у capabilities.** Код каже, що ACL
  діє лише на IPC (§2.2), тобто вони мертві; але «мертві за читанням» і «безпечно зняти»
  — різні твердження, і другого я не перевіряв.
- **`cargo`-ворота.** `cargo test` / `cargo clippy` після зняття не проганялись; підстава
  вважати їх незачепленими — «JS-маніфести не входять у Rust-збірку», і це міркування, не вимір.
- **Поведінка `tauri build` при штучно створеній розбіжності версій.** Читав код, який
  повертає `Err` [Дж 10, 11]; сам сценарій не відтворював (це вимагало б навмисно зіпсувати
  лок). Непрямий доказ, що механізм живий у тій самій версії CLI, яку тримає Tapir:
  `pnpm tauri build --help` документує прапорець `--ignore-version-mismatches` словами
  «Do not error out if a version mismatch is detected on a Tauri package» — тобто типова
  поведінка при розбіжності саме «error out» [Вимір].

---

## Джерела

Мережеві джерела читано 2026-09-06; для GitHub-файлів указано тег. Локальний реєстр
cargo — це саме ті вихідники, які компілюються в Tapir на `f838820`.

1. `plugins/dialog/guest-js/index.ts`, `tauri-apps/plugins-workspace` @ тег `dialog-js-v2.7.0` — <https://raw.githubusercontent.com/tauri-apps/plugins-workspace/dialog-js-v2.7.0/plugins/dialog/guest-js/index.ts>: єдиний імпорт `invoke` з `@tauri-apps/api/core`; функції `open`, `save`, `message`, `ask`, `confirm`; команди `plugin:dialog|open`, `|save`, `|message`; top-level коду немає.
2. `plugins/log/guest-js/index.ts`, там само @ тег `log-js-v2.8.0` — <https://raw.githubusercontent.com/tauri-apps/plugins-workspace/log-js-v2.8.0/plugins/log/guest-js/index.ts>: `invoke` + `listen`; `trace`…`error` → `plugin:log|log`; `attachLogger`/`attachConsole` → `listen('log://log', …)`.
3. `plugins/dialog/build.rs` @ тег `dialog-v2.7.0` і `plugins/log/build.rs` @ тег `log-v2.8.0`: `COMMANDS = &["open","save","message"]` / `&["log"]`, `tauri_plugin::Builder::new(COMMANDS).global_api_script_path("./api-iife.js")…`.
4. Локальний реєстр cargo, `tauri-plugin-dialog-2.7.0`: `Cargo.toml` (`links = "tauri-plugin-dialog"`), `permissions/{default.toml,ask.toml,confirm.toml,autogenerated/commands/*.toml,schemas/schema.json}`, `src/lib.rs` (`blocking_fn!` 71–80; доккоментарі `blocking_pick_file/files/folder/folders/save_file` 663–770; `blocking_show`/`blocking_show_with_result` 351–370), `src/commands.rs` (290 рядків; `open` — з рядка 121, `save` — з 220, `message` — з 261; `set_parent`, `try_fs_scope`, `tauri::scope::Scopes`), `src/desktop.rs` (`pick_file/pick_files/pick_folder/pick_folders` — `run_on_main_thread`; `show_message_dialog`; `From<FileDialogBuilder> for AsyncFileDialog` із `set_parent`), `api-iife.js`, `guest-js/`.
5. Локальний реєстр cargo, `tauri-plugin-log-2.8.0`: `Cargo.toml` (`links = "tauri-plugin-log"`), `permissions/default.toml` (`permissions = ["allow-log"]`) і `permissions/autogenerated/commands/log.toml`, `src/lib.rs` (`enum TargetKind` 322–355 з доккоментарем `Webview`; емісія `log://log` 642–654; `plugin::Builder::new("log").invoke_handler(generate_handler![commands::log])` 667), `src/commands.rs`, `api-iife.js`, `guest-js/index.ts`.
6. Локальний реєстр cargo, `tauri-plugin-2.5.4/src/build/mod.rs`: `Builder::try_build` (95–153) — вимога `CARGO_MANIFEST_LINKS`, `autogenerate_command_permissions`, `define_permissions("./permissions/**/*.*", …)`, `generate_allowed_commands`, `define_global_api_script_path`. Звірено з `dev`-гілкою на GitHub — збігається.
7. Локальний реєстр cargo, `tauri-utils-2.8.3/src/acl/build.rs` (`define_permissions` і друк `cargo:PERMISSION_FILES_PATH=…` 85–110; `read_permissions()` — сканування `DEP_*_PERMISSION_FILES_PATH`) і `src/plugin.rs` (`define_global_api_script_path`, `save_global_api_scripts_paths`, `read_global_api_scripts`).
8. Локальний реєстр cargo, `tauri-build-2.5.6/src/acl.rs:145` (`acl::build::read_permissions()`) і `src/lib.rs:512` (`save_global_api_scripts_paths`).
9. Локальний реєстр cargo, `tauri-2.10.3/src/ipc/authority.rs` (`resolve_access`, 439 і далі — доккоментар «Checks if the given IPC execution is allowed…») і `src/webview/mod.rs` (рядки 1440, 1778 — єдині зовнішні виклики).
10. `crates/tauri-cli/src/info/plugins.rs`, `tauri-apps/tauri` @ тег `tauri-cli-v2.10.1` — <https://raw.githubusercontent.com/tauri-apps/tauri/tauri-cli-v2.10.1/crates/tauri-cli/src/info/plugins.rs>: `InstalledPackages::mismatched()` (major/minor), `installed_tauri_packages` (пари `tauri-plugin-<p>` ↔ `@tauri-apps/plugin-<p>`), `check_mismatched_packages` із текстом помилки.
11. `crates/tauri-cli/src/build.rs` (опис прапорця `--ignore-version-mismatches` 74–78; `setup` 149–156 із `return Err(error)`) і `crates/tauri-cli/src/dev.rs` (`setup` 136–145 із `std::thread::spawn` + `log::error!`), там само @ `tauri-cli-v2.10.1`.
12. `crates/tauri-cli/src/info/packages_nodejs.rs` @ `tauri-cli-v2.10.1`: `nodejs_section_item` — форматування `not installed!` і мітки `outdated`.
13. Документація Tauri v2, Dialog — <https://v2.tauri.app/plugin/dialog/>: npm-крок сформульовано умовно («If you'd like create dialogs in JavaScript, install the npm package as well»); Rust-приклади; default-набір дозволів.
14. Документація Tauri v2, Logging — <https://v2.tauri.app/plugin/logging/>: `TargetKind::Webview` подано в парі з `attachConsole`; capabilities з `"log:default"`.
15. Документація Tauri v2, Permissions — <https://v2.tauri.app/security/permissions/>: «Permissions are descriptions of explicit privileges of commands»; файли дозволів плагіна — у `permissions/` **усередині крейта плагіна**; дозвіл вмикає команду для фронтенду.

Вимір цієї сесії (усе в робочому дереві `chore/dead-js-tauri-plugins` над `f838820`,
без комітів): `pnpm install --frozen-lockfile`; вміст `node_modules/@tauri-apps/plugin-{dialog,log}/`;
`pnpm tauri info` до і після зняття; `pnpm remove @tauri-apps/plugin-dialog @tauri-apps/plugin-log`;
`git diff package.json pnpm-lock.yaml`; `pnpm vite:build`, `pnpm test`, `pnpm typecheck`;
`node -p` по `src-tauri/gen/schemas/acl-manifests.json`.
