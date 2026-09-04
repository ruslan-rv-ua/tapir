---
slug: <slug>                         # = ім'я файлу без префікса p<рівень>-
title: <Назва>
priority: P2                         # P0|P1|P2|P3
type: planned                        # idea|research|planned
status: draft                        # draft|ready|blocked|done
effort: M                            # S|M|L
kind: feature                        # feature|bug|chore
target: unscheduled                  # <semver>|unscheduled
updated: YYYY-MM-DD
a11y: false                          # bool — чи зачіпає доступність/NVDA
depends_on: []                       # slug'и записів беклогу (вкл. done/)
blocks: []                           # slug'и записів, які цей розблоковує
touches: []                          # орієнтовні шляхи коду
gates: []                            # напр. [pnpm test, pnpm typecheck, pnpm vite:build]
# depends_on_external: []            # необов'язково: фази/код поза беклогом
# blocked_reason: ""                 # обов'язково лише при status: blocked
# notes: []                          # необов'язково: короткі нюанси
---

# <Назва>

> **Контекст:** 1–2 рядки — що це, статус роботи, що читати першим.

## Опис

Коротко: що і навіщо.

## Критерії готовності

- [ ] `docs/help/` оновлено — або зазначено, що запис видимої поведінки не змінює
- [ ] ...
- [ ] ...

## Документи

- [implementation-phases.md](../implementation-phases.md)
- шляхи коду: `src/...`
