---
slug: ci-pipeline
title: "CI на GitHub Actions: усі ворота проєкту на кожен push"
priority: P3
type: idea
status: draft
effort: M
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: [typecheck-gate, clippy-warnings-zero]
blocks: []
touches:
  - .github/workflows
gates: []
notes:
  - "Аудит 2026-09-04: у репозиторії немає жодного workflow; ворота запускаються лише руками або агентом перед комітом."
  - "P3 та idea свідомо: один розробник, ворота вже є локально; тригер повернутися: зовнішній контриб'ютор, тегування збірки або перший випадок, коли злитий у develop коміт виявився червоним."
---

# CI на GitHub Actions: усі ворота проєкту на кожен push

> **Контекст:** знахідка аудиту 2026-09-04. Ідея без зобов'язань: обговорити, чи
> потрібне CI одному розробнику з агентом, і за яким тригером його заводити.

## Опис

Ворота проєкту сьогодні: `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build`,
а після [typecheck-gate](done/p1-typecheck-gate.md) ще `pnpm typecheck`. Усі вони
запускаються локально і лише тоді, коли про них згадали. Вітка `develop` не має
жодного механізму, який відмовився б прийняти червоний коміт.

Мінімальний workflow: один job на `windows-latest` (крейт `windows` і WebView2
вимагають саме Windows), кроки `pnpm install`, `pnpm typecheck`, `pnpm test`,
`pnpm vite:build`, `cargo clippy`, `cargo test`. Кеш cargo і `target` через
`Swatinem/rust-cache`, інакше кожен прогін збирає Tauri з нуля по 10 хвилин.

Аргументи «не зараз»: розробник один, кожен запис беклогу вже має `gates:`, які
агент запускає перед закриттям, а хвилини GitHub Actions на Windows коштують удвічі
дорожче за Linux. Аргументи «так»: холодний vitest інколи падає спонтанно, і CI дає
другий незалежний прогін; тегування версії 0.1.0 хочеться робити на зеленому.

## Відкриті питання

- Чи потрібне CI до появи другого контриб'ютора або першого тегу?
- Чи збирати в CI також exe через `just build-fast` як артефакт, або лише ворота?
- Чи допускати ретрай для холодного прогону vitest, який інколи падає спонтанно?

## Критерії готовності (якщо рішення «так»)

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] Workflow запускає всі ворота з `gates:` на push у `develop` і на pull request
- [ ] Кеш Rust і pnpm налаштовано, прогін на теплому кеші триває менше 10 хвилин
- [ ] DEVELOPERS.md описує, що перевіряє CI і як прочитати його лог

## Документи

- [typecheck-gate](done/p1-typecheck-gate.md), [clippy-warnings-zero](p2-clippy-warnings-zero.md) — ворота, які CI має запускати
- https://github.com/Swatinem/rust-cache
