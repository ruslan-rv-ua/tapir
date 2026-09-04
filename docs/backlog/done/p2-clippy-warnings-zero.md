---
slug: clippy-warnings-zero
title: "clippy без попереджень і з -D warnings у воротах"
priority: P2
type: planned
status: ready
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: []
blocks: [ci-pipeline]
touches:
  - src-tauri/Cargo.toml
  - src-tauri/src
  - justfile
  - docs/backlog/README.md
gates: [cargo test, cargo clippy]
notes:
  - "Аудит 2026-09-04: cargo clippy дає 32 попередження, з них 18 collapsible_if; решта дрібні: зайві касти u32→u32, io::Error::other, is_err() замість match, split_once, too_many_arguments у sanitize::build_track_path."
---

# clippy без попереджень і з -D warnings у воротах

> **Контекст:** знахідка аудиту 2026-09-04. `cargo clippy` стоїть у `gates:` майже
> кожного запису, але без `-D warnings` він зелений при будь-якій кількості
> попереджень, і їх назбиралось 32. Рішення ухвалено, можна брати.

## Опис

Розподіл попереджень на 2026-09-04:

| Лінт | Кількість |
|---|---|
| `collapsible_if` | 18 |
| `unnecessary_cast` | 3 |
| `needless_borrow`, `io_other_error`, `redundant_pattern_matching` | по 2 |
| `manual_split_once`, `manual_range_contains`, `map_or` спрощення, `too_many_arguments` | по 1 |

Усе механічне, крім `too_many_arguments` на `sanitize::build_track_path` з вісьмома
параметрами: там або `allow` з поясненням, або структура параметрів. Друге чистіше,
але зачіпає рекордер; вибрати при реалізації, обидва варіанти прийнятні.

Щоб попередження не накопичувались знову, ворота мусять падати на них: `cargo clippy
-- -D warnings` у `justfile` і в конвенції `gates:` беклогу. Альтернатива з секцією
`[lints.clippy]` у `Cargo.toml` фіксує рівень для всіх, хто запускає clippy, і не
залежить від того, як його викликали; це кращий носій правила.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] `cargo clippy` дає нуль попереджень
- [ ] `Cargo.toml` має `[lints.clippy]` з `all = "deny"` або рівноцінне, або `justfile`
      запускає clippy з `-D warnings`; обраний спосіб описано в DEVELOPERS.md
- [ ] `docs/backlog/README.md` у прикладі `gates` називає той самий виклик
- [ ] `cargo test` зелений після правок
