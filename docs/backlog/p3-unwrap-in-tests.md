---
slug: unwrap-in-tests
title: "Замінити `.unwrap()` на `.expect()` у тестах settings.rs"
priority: P3
type: planned
status: ready
effort: S
kind: chore
target: 0.2.0
updated: 2026-06-15
a11y: false
depends_on: []
blocks: []
touches: [src-tauri/src/settings.rs]
gates: [cargo test]
---

# Замінити `.unwrap()` на `.expect()` у тестах settings.rs

> **Контекст:** тривіальна гігієна тестів (P3, S, ready) — housekeeping, підняти будь-коли.

## Опис

У `src-tauri/src/settings.rs` у тест-модулі використовується `.unwrap()` без пояснення:

```rust
let settings: GlobalSettings = serde_json::from_str(json).unwrap();
```

Якщо JSON-фікстура невалідна (опечатка у тесті) — паніка без жодного контексту.
Виправлення: замінити `.unwrap()` на `.expect("опис що мало статись")`.

Це не production-баг, але робить тести крихкими і складними для діагностики.

## Критерії готовності

- [ ] Усі `.unwrap()` у `#[cfg(test)]`-блоці `settings.rs` замінені на `.expect("…")`
- [ ] Повідомлення в `expect` пояснюють контекст (що парситься, яка фікстура)
- [ ] `cargo test` проходить без помилок

## Документи

- [src-tauri/src/settings.rs](../../src-tauri/src/settings.rs)
