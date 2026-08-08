---
slug: bandwidth-limit-dead-setting
title: "Обмеження смуги: налаштування є, реалізації немає"
priority: P1
type: planned
status: ready
effort: S
kind: bug
target: 0.1.0
updated: 2026-08-08
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/settings.rs
  - src-tauri/src/stream/manager.rs
  - src/components/settings/GeneralTab.tsx
  - src/lib/tauri.ts
  - docs/architecture.md
  - docs/data-models.md
gates: [pnpm test, pnpm vite:build, cargo test]
notes:
  - "Знайдено 2026-08-08 при розборі межі глобальне/профіль (profile-scoped-settings)"
  - "Поле свідомо НЕ переносили у профіль: спершу треба вирішити, чи воно живе"
---

# Обмеження смуги: налаштування є, реалізації немає

> **Контекст:** знахідка на маргінесі
> [profile-scoped-settings](p0-profile-scoped-settings.md). Поле лишили глобальним
> саме тому, що спершу треба вирішити його долю.

## Опис

`GlobalSettings.bandwidth_limit_kbps` існує ([settings.rs:33](../../src-tauri/src/settings.rs#L33)),
редагується в UI і описане в [architecture.md:714](../architecture.md) («StreamManager
обчислює сумарну швидкість усіх активних потоків; при перевищенні…»). У Rust
**жодного споживача немає** — `stream_manager` це поле не читає. Пошук по репозиторію
дає лише оголошення, дефолт, тести-заглушки і документацію.

Тобто користувач має рубильник, який нічого не робить, і документацію, яка це
підтверджує. Для запису з радіо на повільному каналі це якраз та настройка, на яку
розраховують.

## Рішення, яке треба ухвалити

**Або** реалізувати (тротлінг у `StreamManager` за сумарною швидкістю активних
потоків, як описано в `architecture.md`), **або** прибрати поле з `GlobalSettings`,
UI і документації.

Проміжного варіанта («лишити як є») бути не повинно: настройка, що бреше, гірша за її
відсутність.

## Критерії готовності

- [ ] Рішення ухвалено й записано в цьому файлі.
- [ ] Якщо реалізуємо: `StreamManager` враховує ліміт; тест на перевищення.
- [ ] Якщо прибираємо: поле зникло з `settings.rs`, `tauri.ts`, `GeneralTab.tsx`, `data-models.md`; секцію в `architecture.md` вилучено або переписано.
- [ ] У будь-якому разі `architecture.md` і фактична поведінка збігаються.

## Документи

- [architecture.md](../architecture.md) — опис тротлінгу, який не реалізовано
- [data-models.md](../data-models.md)
