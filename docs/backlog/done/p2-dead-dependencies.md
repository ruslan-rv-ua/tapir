---
slug: dead-dependencies
title: "Мертві залежності: stream-download, unicode-normalization, cpal, paraglide-vite"
priority: P2
type: planned
status: done
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
completed: 2026-09-04
a11y: false
depends_on: [icy-metadata-reader-dedup]
blocks: [tech-stack-doc-drift]
touches:
  - src-tauri/Cargo.toml
  - package.json
  - docs/architecture.md
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Аудит 2026-09-04: stream-download не має жодного використання в src; unicode-normalization живе лише в scaffold під allow(dead_code); cpal береться як rodio::cpal; @inlang/paraglide-vite позначено deprecated, а плагін імпортується з @inlang/paraglide-js."
  - "Реалізовано на гілці chore/dead-dependencies; з пари futures/futures-util лишився futures-util, а не futures — див. «Стан реалізації»."
  - "Ручний прогін 2026-09-04 пройдено повністю (9 кроків: мережа, живий ефір, запис, відтворення файлу, вибір пристрою, браузер, імпорт, перемикання профілю)."
---

# Мертві залежності: stream-download, unicode-normalization, cpal, paraglide-vite

> **Контекст:** знахідка аудиту 2026-09-04. Кілька залежностей компілюються, але коду
> не служать. Залежить від [icy-metadata-reader-dedup](p1-icy-metadata-reader-dedup.md):
> там вирішується, чи потрібна NFC-нормалізація метаданих.

## Опис

[Cargo.toml](../../../src-tauri/Cargo.toml):

- `stream-download = "0.24"` з features `reqwest-rustls`: у `src-tauri/src` жодного
  `stream_download`. Крейт тягне власний стек буферизації в кожну збірку даремно.
- `unicode-normalization = "0.1"`: **умову знято 2026-09-04** — запис про ICY-читач
  NFC не задіяв і scaffold `decode_icy_metadata` видалив разом із єдиним викликом
  `.nfc()`. У `src-tauri/src` жодного `unicode_normalization` немає; крейт іде геть.
- `cpal = "0.15"` як пряма залежність: код звертається лише до `rodio::cpal`, який
  rodio реекспортує. Прибрати й переконатися, що версія cpal у lock-файлі не
  змінилась, а `list_output_devices` і `open_device_sink` компілюються.
- `futures = "0.3"` і `futures-util = "0.3"` одночасно: `futures` реекспортує
  `futures_util`. Лишити один, замінивши два імпорти `futures_util::` у плеєрі й
  рекордері.

[package.json](../../../package.json):

- `@inlang/paraglide-vite` 1.4.0 позначено в реєстрі як deprecated з повідомленням,
  що плагін тепер входить у `@inlang/paraglide-js`. [vite.config.ts](../../../vite.config.ts)
  уже імпортує `paraglideVitePlugin` саме звідти. Пакет мертвий.

Перевірити список можна інструментом `cargo machete` для Rust і `pnpm why` для npm.

## Критерії готовності

- [x] `docs/help/` — запис видимої поведінки не змінює
- [x] `stream-download`, `cpal` і один із пари `futures`/`futures-util` прибрано з
      `Cargo.toml`; `unicode-normalization` прибрано, якщо NFC не задіяно в
      icy-metadata-reader-dedup
- [x] `@inlang/paraglide-vite` прибрано з `package.json`, `pnpm install` пройшов
- [x] `cargo machete` не показує невикористаних крейтів
- [x] `just build-fast` збирає exe; відтворення файлу і вибір аудіопристрою працюють
- [x] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build` без помилок

## Стан реалізації

Гілка `chore/dead-dependencies`. Ворота зелені: `cargo test` 540, `pnpm test`
1157/96, `cargo clippy` без нових попереджень (пре-існуючі 27/38 — предмет
[clippy-warnings-zero](../p2-clippy-warnings-zero.md)), `pnpm vite:build` збирає.
`cargo machete` чистий. `just build-fast` зібрав exe (25,7 МБ, 1 хв 19 с).

**Ручний прогін 2026-09-04 — пройдено.** Дев'ять кроків на портативному стенді
поряд з exe: додавання потоку (HTTPS-перевірка адреси), живий ефір, запис у файл,
**відтворення файлу**, **вибір пристрою виведення** (список, перемикання під час
відтворення, оновлення списку), пошук у Браузері станцій із «Завантажити ще»,
експорт-імпорт списку потоків і перемикання профілю під час запису. Останні три —
не критерій запису, а прикриття тих шляхів коду, які діф зачепив побіжно
(HTTP/1.1 без h2, `futures_util::stream::iter`, `futures_util::future::join_all`).

Дві розбіжності з описом вище — обидві на користь опису, не проти нього.

**Із пари лишився `futures-util`, а не `futures`.** Опис пропонував зворотнє, але
`futures-util` і так у дереві транзитивно (`reqwest`, `tokio-util`, `hyper-util`,
`tower`), тож прямою залежністю він не коштує нічого. Парасолька `futures` натомість
додає власний крейт плюс `futures-executor`, якого не потребує ніхто. Заміна пішла в
інший бік — п'ять звернень `futures::` у трьох командних модулях
(`browser_commands`, `profile_commands`, `stream_io_commands`), а не «два імпорти
`futures_util::` у плеєрі й рекордері»: до `futures_util::` звертається
`stream/connection.rs`, і саме він лишився недоторканим. `futures::future::join_all`,
`futures::stream::iter`, `futures::StreamExt`/`TryStreamExt` — усе це реекспорти
з `futures-util`, тож заміна дослівна.

**`cpal` був не зайвим рядком, а другою копією крейта.** У lock-файлі жили дві
версії: пряма `cpal 0.15.3` і `cpal 0.17.1`, яку тягне `rodio 0.22`. Код звертався
тільки до другої (через `rodio::cpal`), тож пряма залежність збирала цілий
дублікат аудіо-бекенду ні для кого. Після зняття в дереві лишилась одна `0.17.1`;
формулювання критерію «версія cpal у lock-файлі не змінилась» слід читати як
«версія, якою користується код, не змінилась».

**`stream-download` тягнув за собою HTTP/2.** Його feature `reqwest-rustls` була
єдиним, що вмикало в `reqwest` підтримку HTTP/2, тож разом із крейтом із дерева
пішов `h2`, і застосунок тепер ходить у мережу лише по HTTP/1.1. TLS не зачеплено —
`rustls` ми оголошуємо самі. Практично це нічого не ламає (radio-browser і станції
віддають HTTP/1.1, ALPN просто не пропонує `h2`), але зміна мовчазна й у діфі
`Cargo.toml` не видима, тому названа тут. Разом із cpal-дублікатом і
не-Windows-бекендами `alsa`/`coreaudio`/`ndk`/`oboe` це дало **−395 рядків
`Cargo.lock`**; `pnpm install` зняв 119 пакетів.

**Заразом виправлено `architecture.md`.** §«Нормалізація» іменування файлів
вимагала Unicode NFC «(crate `unicode-normalization`)» і показувала `raw.nfc()`
у `sanitize_filename` — після зняття крейта той приклад просто не скомпілювався б,
та й `sanitize::sanitize_component` ніколи NFC не робив. Пункт прибрано, на його
місці — явне «NFC-нормалізації немає». Решта дрейфу того ж §, де спека розходиться
з `sanitize.rs` (`_untitled`, обрізання до 255, префікс замість суфікса для
зарезервованих імен), лишилась незайманою — це не про мертві залежності.

## Документи

- [Cargo.toml](../../../src-tauri/Cargo.toml), [package.json](../../../package.json), [vite.config.ts](../../../vite.config.ts)
- [tech-stack-doc-drift](../p2-tech-stack-doc-drift.md) — таблицю стеку оновлювати після цього запису
