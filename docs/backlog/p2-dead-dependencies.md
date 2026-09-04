---
slug: dead-dependencies
title: "Мертві залежності: stream-download, unicode-normalization, cpal, paraglide-vite"
priority: P2
type: planned
status: ready
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: [icy-metadata-reader-dedup]
blocks: [tech-stack-doc-drift]
touches:
  - src-tauri/Cargo.toml
  - package.json
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Аудит 2026-09-04: stream-download не має жодного використання в src; unicode-normalization живе лише в scaffold під allow(dead_code); cpal береться як rodio::cpal; @inlang/paraglide-vite позначено deprecated, а плагін імпортується з @inlang/paraglide-js."
---

# Мертві залежності: stream-download, unicode-normalization, cpal, paraglide-vite

> **Контекст:** знахідка аудиту 2026-09-04. Кілька залежностей компілюються, але коду
> не служать. Залежить від [icy-metadata-reader-dedup](done/p1-icy-metadata-reader-dedup.md):
> там вирішується, чи потрібна NFC-нормалізація метаданих.

## Опис

[Cargo.toml](../../src-tauri/Cargo.toml):

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

[package.json](../../package.json):

- `@inlang/paraglide-vite` 1.4.0 позначено в реєстрі як deprecated з повідомленням,
  що плагін тепер входить у `@inlang/paraglide-js`. [vite.config.ts](../../vite.config.ts)
  уже імпортує `paraglideVitePlugin` саме звідти. Пакет мертвий.

Перевірити список можна інструментом `cargo machete` для Rust і `pnpm why` для npm.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] `stream-download`, `cpal` і один із пари `futures`/`futures-util` прибрано з
      `Cargo.toml`; `unicode-normalization` прибрано, якщо NFC не задіяно в
      icy-metadata-reader-dedup
- [ ] `@inlang/paraglide-vite` прибрано з `package.json`, `pnpm install` пройшов
- [ ] `cargo machete` не показує невикористаних крейтів
- [ ] `just build-fast` збирає exe; відтворення файлу і вибір аудіопристрою працюють
- [ ] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build` без помилок

## Документи

- [Cargo.toml](../../src-tauri/Cargo.toml), [package.json](../../package.json), [vite.config.ts](../../vite.config.ts)
- [tech-stack-doc-drift](p2-tech-stack-doc-drift.md) — таблицю стеку оновлювати після цього запису
