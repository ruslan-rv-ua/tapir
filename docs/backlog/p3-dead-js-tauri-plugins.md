---
slug: dead-js-tauri-plugins
title: "Мертві JS-залежності: @tauri-apps/plugin-dialog і @tauri-apps/plugin-log"
priority: P3
type: planned
status: draft
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: [dead-dependencies]
blocks: []
touches:
  - package.json
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Знайдено 2026-09-04 під час tech-stack-doc-drift: у src/ імпортується лише @tauri-apps/api (core, event, window); жодного import із plugin-dialog чи plugin-log немає."
  - "Rust-плагіни tauri-plugin-dialog і tauri-plugin-log лишаються — прибрати треба саме JS-обгортки, які нікого не обслуговують."
---

# Мертві JS-залежності: `@tauri-apps/plugin-dialog` і `@tauri-apps/plugin-log`

> **Контекст:** хвіст [dead-dependencies](done/p2-dead-dependencies.md), знайдений
> 2026-09-04 під час [tech-stack-doc-drift](done/p2-tech-stack-doc-drift.md). Той запис
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

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] Обидва пакети зняті з `package.json`, `pnpm-lock.yaml` оновлено
- [ ] `pnpm vite:build`, `pnpm test`, `pnpm typecheck` зелені
- [ ] Ручна перевірка: вибір теки записів у налаштуваннях і файловий лог у `data/logs/`
      працюють, як раніше

## Документи

- [dead-dependencies](done/p2-dead-dependencies.md) — батьківський запис
- [tech-stack.md](../tech-stack.md) — розділ «Tauri Plugins»
