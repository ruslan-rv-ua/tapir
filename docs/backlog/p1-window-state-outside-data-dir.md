---
slug: window-state-outside-data-dir
title: "Геометрія вікна пишеться в AppData: плагін window-state ламає portable-обіцянку"
priority: P1
type: planned
status: draft
effort: M
kind: bug
target: 0.1.0
updated: 2026-09-04
a11y: true
depends_on: []
blocks: [tech-stack-doc-drift]
touches:
  - src-tauri/src/lib.rs
  - src-tauri/Cargo.toml
  - src-tauri/capabilities/default.json
  - src-tauri/src/portable.rs
  - src-tauri/src/crash_recovery.rs
  - README.md
  - DEVELOPERS.md
  - docs/architecture.md
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Аудит 2026-09-04: на машині розробника є %APPDATA%\ua.ruslanrv.tapir\.window-state.json, змінений того ж дня, і два залишки від старих ідентифікаторів com.tapir.app і dev.tapir.app."
  - "tauri-plugin-window-state 2.4.1 пише лише в app_config_dir; опції каталогу немає, PR with_dir відкрито з 2025-10, мейнтейнер відклав на v3."
  - "a11y: true, бо відновлення геометрії стоїть у стартовій послідовності show → focus, від якої залежить, чи NVDA озвучує вікно при запуску."
---

# Геометрія вікна пишеться в AppData: плагін window-state ламає portable-обіцянку

> **Контекст:** знахідка аудиту 2026-09-04. README і DEVELOPERS.md обіцяють, що AppData
> й реєстр лишаються чистими, а плагін `tauri-plugin-window-state` пише туди файл при
> кожному запуску. Варіант заміни не обрано, потрібен grooming.

## Опис

[README.md](../../README.md) каже користувачу: «Your system (AppData, registry) stays
completely clean!». [DEVELOPERS.md](../../DEVELOPERS.md) повторює: «doesn't touch the
system registry or AppData». Обидва твердження хибні.

`tauri-plugin-window-state` v2 будує шлях як `app_config_dir().join(".window-state.json")`
і не має жодної опції каталогу: у `Builder` є лише `with_filename`, `with_state_flags`,
`with_denylist`, `with_filter`, `skip_initial_state`, `map_label`. На цій машині файл
лежить у `%APPDATA%\ua.ruslanrv.tapir\`, а поруч стоять каталоги `com.tapir.app` і
`dev.tapir.app` від попередніх ідентифікаторів. Портативний застосунок, який запускають
з флешки на чужій машині, лишає там слід.

Реєстр застосунок теж чіпає, але свідомо й задокументовано: `HKCU\...\Run` для
автозапуску (лише коли увімкнено) і `HKCU\Software\Classes\AppUserModelId` для тостів.
Цей запис про них не йде, але формулювання README доведеться уточнити й щодо них.

Upstream: issue про portable відкрито 2025-09-30, PR `with_dir()` відкрито 2025-10-01,
мейнтейнер відповів, що об'єднає `filename` і `dir` у v3. Чекати на v3 не варіант для
0.1.0.

## Відкриті питання

1. **Чим замінити плагін.** Варіанти:
   - **(a) Власне збереження в `data/`.** Слухати `WindowEvent::Moved` / `Resized`
     (з дебаунсом) і закриття, писати розмір, позицію й `maximized` у файл під
     `data/`; при старті читати його й застосовувати до вікна **до** `show()`.
     Писар атомарного JSON уже є: `store::write_json_atomically`. Рекомендовано: код
     плагіна невеликий, а Tapir уже має усе, з чого він складається.
   - **(b) Форк або вендоринг плагіна** з підставленим `data/`. Дешевше на старті, але
     це ще один шматок чужого коду на підтримці.
   - **(c) Лишити плагін і виправити README.** Відкидається: обіцянка «нічого поза
     `data/`» стоїть в основі portable-режиму, а не лише в тексті.
2. **Окремий файл чи `state.json`.** `data/state.json` належить crash-recovery і має
   свого писаря зі своїм ритмом; геометрія вікна там виглядала б як зобов'язання для
   нього. Рекомендовано окремий `data/window.json` через `portable::window_state_path()`.
3. **Що робити із залишками в AppData.** Свій каталог `ua.ruslanrv.tapir` застосунок
   створив сам, тож може й прибрати при першому старті без плагіна. Каталоги старих
   ідентифікаторів чіпати не варто: їх створювали інші збірки. Потрібне рішення
   розробника.
4. **Multi-monitor і монітор, якого більше немає.** Плагін перевіряє, чи позиція
   потрапляє в доступний монітор. Власна реалізація мусить робити те саме, інакше
   вікно відкриється поза екраном, і його не побачить ніхто, а NVDA озвучить як
   звичайне.

## Критерії готовності

- [ ] `docs/help/` — перевірити [settings.md](../help/en/settings.md) і
      [background.md](../help/en/background.md): якщо десь згадано, де застосунок
      зберігає дані, формулювання мусить лишитися правдивим
- [ ] Після запуску й закриття застосунку в `%APPDATA%` немає нового каталогу
      `ua.ruslanrv.tapir`; розмір, позиція і `maximized` вікна відновлюються з файлу під
      `data/`
- [ ] Вікно, збережене на моніторі, якого зараз немає, відкривається у видимій області
- [ ] Стартова послідовність показу й фокусу вікна не змінена: NVDA озвучує головне
      вікно при запуску, як описано в
      [screenreader-startup-foreground.md](../notes/screenreader-startup-foreground.md)
- [ ] `tauri-plugin-window-state` прибрано з `Cargo.toml`, `lib.rs` і
      `capabilities/default.json`
- [ ] README.md і DEVELOPERS.md кажуть правду про AppData і про реєстр (Run і AUMID)
- [ ] architecture.md більше не описує плагін як механізм збереження стану вікна
- [ ] NVDA-прогін старту: згорнутий старт, звичайний старт, старт після зміни моніторів
- [ ] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build` без помилок

## Документи

- [portable.rs](../../src-tauri/src/portable.rs) — усі шляхи `data/`
- [store.rs](../../src-tauri/src/store.rs) — `write_json_atomically`
- [lib.rs](../../src-tauri/src/lib.rs) — реєстрація плагіна й стартова послідовність
- [screenreader-startup-foreground.md](../notes/screenreader-startup-foreground.md) — чому старт чутливий до NVDA
- upstream: https://github.com/tauri-apps/plugins-workspace/issues/3020 і PR https://github.com/tauri-apps/plugins-workspace/pull/3022
