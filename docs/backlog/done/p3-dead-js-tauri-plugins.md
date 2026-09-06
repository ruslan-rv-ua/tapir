---
slug: dead-js-tauri-plugins
title: "Мертві JS-залежності: @tauri-apps/plugin-dialog і @tauri-apps/plugin-log"
priority: P3
type: planned
status: done
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-06
completed: 2026-09-06
a11y: false
depends_on: [dead-dependencies]
blocks: []
touches:
  - package.json
  - pnpm-lock.yaml
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Знайдено 2026-09-04 під час tech-stack-doc-drift: у src/ імпортується лише @tauri-apps/api (core, event, window); жодного import із plugin-dialog чи plugin-log немає."
  - "Rust-плагіни tauri-plugin-dialog і tauri-plugin-log лишаються — прибрати треба саме JS-обгортки, які нікого не обслуговують."
  - "Дослідження 2026-09-06 (notes/dead-js-tauri-plugins.md) знайшло другу, важливішу ціну: Tauri CLI звіряє major.minor кожного плагіна, і на `tauri build` розбіжність — Err. Запис бачив лише час pnpm install і хибний сигнал."
---

# Мертві JS-залежності: `@tauri-apps/plugin-dialog` і `@tauri-apps/plugin-log`

> **Контекст:** хвіст [dead-dependencies](p2-dead-dependencies.md), знайдений
> 2026-09-04 під час [tech-stack-doc-drift](p2-tech-stack-doc-drift.md). Той запис
> вичистив Cargo.toml і `@inlang/paraglide-vite`, але JS-обгортки плагінів не перевіряв.

## Опис

У `package.json` лежать `@tauri-apps/plugin-dialog` і `@tauri-apps/plugin-log`. Пошук
по `src/` дає рівно три специфікатори Tauri — `@tauri-apps/api/core`,
`@tauri-apps/api/event`, `@tauri-apps/api/window`. Обох плагінних пакетів не імпортує
ніхто: діалог вибору файлів відкриває Rust (`tauri-plugin-dialog` на бекенді), лог пише
`tauri-plugin-log` туди ж.

У бандл вони не потрапляють (Vite їх просто не бачить), тож ціна — час `pnpm install`
і хибний сигнал: наступний читач `package.json` вирішить, що фронтенд десь ходить у
діалог сам.

Перевірити перед зняттям: чи не з'явиться потреба у JS-обгортці `plugin-dialog`, коли
діалог доведеться відкривати **з** webview (наприклад, вибір теки в налаштуваннях). Якщо
така потреба вже видима — записати це замість зняття.

## Критерії готовності

- [x] `docs/help/` — запис видимої поведінки не змінює
- [x] Обидва пакети зняті з `package.json`, `pnpm-lock.yaml` оновлено
- [x] `pnpm vite:build`, `pnpm test`, `pnpm typecheck` зелені
- [x] Ручна перевірка: вибір теки записів у налаштуваннях і файловий лог у `data/logs/`
      працюють, як раніше

Останній критерій закрито прогоном справжньої збірки 2026-09-06 (`just build-fast`,
`target/release-fast/tapir.exe` — тобто зібраний бандл, а не dev-сервер):

- **Лог** — без участі людини. `data/logs/tapir.log` створився поруч з exe у портативній
  розкладці, 1272 байти, повна стартова послідовність із часом запуску; за весь прогін
  жодного `WARN` чи `ERROR`. Заразом піднялись `settings.json`, `state.json` і
  `profiles/Default.tapirprofile`.
- **Вибір теки** — очима людини, бо це нативний діалог Windows: `Ctrl+Shift+,` →
  вкладка запису → «Тека та шаблони» → «Огляд». Діалог відкривається. Тост
  «Не вдалося відкрити вибір папки», який ловить `catch` навколо `openDirectoryPicker`,
  не з'являвся.

## Знайдено під час реалізації

Дослідження — [notes/dead-js-tauri-plugins.md](../../notes/dead-js-tauri-plugins.md);
тут лише те, що міняє сам запис.

**Ціна виявилась іншою, ніж описано.** Запис оцінював її як «час `pnpm install` і хибний
сигнал». Головна ціна — латентна: Tauri CLI звіряє major.minor **кожного** відомого
плагіна (крейт `tauri-plugin-<p>` проти npm `@tauri-apps/plugin-<p>`), і перевірка
`tauri` ↔ `@tauri-apps/api`, про яку зазвичай знають, — просто перший елемент того
самого списку. На `tauri build` розбіжність повертає `Err`, тобто збірка падає; обхід —
`--ignore-version-mismatches`. Пара випадає з перевірки лише тоді, коли однієї зі сторін
немає. Станом на 2026-09-06 крейт `tauri-plugin-log` — 2.8.0, а опублікована 2.9.1: один
самотній `cargo update` зробив би `tauri build` червоним помилкою, що не має жодного
стосунку до коду. Зняття цю міну знімає.

**Питання-стоп закрите в інший бік, ніж очікував запис.** Потреба відкривати діалог із
webview не «може з'явитись» — вона вже видима й уже задоволена **без** npm-пакета:
`openDirectoryPicker()` у [`src/lib/tauri.ts`](../../../src/lib/tauri.ts) кличе власну
команду `open_directory_picker`, а та робить `blocking_pick_folder()`. Команди
`plugin:dialog|open` / `|save`, які кличе npm-обгортка, всередині роблять **ті самі**
виклики — JS-фасад іншого механізму не дає. Можливостей поза Rust-API у плагіна на
2.7.0 не знайдено; єдина відмінність — `set_parent(&window)` (один рядок Rust) і
FS-scope-гранти, яких Tapir не потребує, бо файли читає й пише Rust.

**Дозволи тримає Rust, не npm.** `dialog:default` і `log:default` у
[`capabilities/default.json`](../../../src-tauri/capabilities/default.json) приходять із
`permissions/default.toml` **усередині крейта** через `links` і
`DEP_*_PERMISSION_FILES_PATH`; згенерований `src-tauri/gen/schemas/acl-manifests.json`
несе їхній текст дослівно. Зняття npm-пакетів цього ланцюга не торкається.

**JS-бік логера потрібен рівно для `TargetKind::Webview`** — єдиного місця, що емітить
подію `log://log` для `attachConsole`. У [`lib.rs`](../../../src-tauri/src/lib.rs)
налаштовані тільки `Folder` і `Stdout`.

**Вимір.** `-2` рядки в `package.json`, `-20` у `pnpm-lock.yaml`; резолюція
`@tauri-apps/api` не змінилась (2.10.1 до і після). Три ворота зелені з першого прогону:
`vite:build` чисто, `pnpm test` — 1249 тестів, `typecheck` чисто.

## Межі — свідомо не в цьому записі

- **`dialog:default` / `log:default` у `capabilities/default.json`.** За читанням коду
  вони теж нічого не обслуговують: ACL діє лише на IPC, а IPC до цих плагінів ніхто не
  робить. Але «мертві за читанням» і «безпечно зняти» — різні твердження, ціна помилки
  тут інша (мовчазна відмова команди), і питання заслуговує власного запису з ручною
  перевіркою. **Заведено 2026-09-06:**
  [capabilities-dead-plugin-permissions](../p3-capabilities-dead-plugin-permissions.md) —
  і при його заведенні з'ясувалось, що мертвих наборів **чотири**, не два: webview не
  кличе жодної плагінної команди, тож `global-shortcut` і `notification` у тому самому
  становищі.
- **`tech-stack.md`** описував ці плагіни як такі, що їх кличе webview. **Виправлено
  2026-09-06** у двох місцях: рядок про `capabilities/default.json` у «Конфігурації
  проекту» і застереження «немає дозволу — плагін мовчки не працює», яке плутало межу
  IPC із самим плагіном.
- **`cargo test` / `cargo clippy`** після зняття не проганялись: JS-маніфести у
  Rust-збірку не входять. Це міркування, не вимір.

## Документи

- [dead-dependencies](p2-dead-dependencies.md) — батьківський запис
- [notes/dead-js-tauri-plugins.md](../../notes/dead-js-tauri-plugins.md) — дослідження з виміром
- [tech-stack.md](../../tech-stack.md) — розділ «Tauri Plugins»
