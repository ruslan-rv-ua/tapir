---
slug: bandwidth-limit-dead-setting
title: "Обмеження смуги: налаштування є, реалізації немає"
priority: P1
type: planned
status: done
effort: S
kind: bug
target: 0.1.0
updated: 2026-08-31
completed: 2026-08-31
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
  - "Ухвалено прибрати: рішення вже існувало ззовні — фазу 3I-4 відхилено 2026-06-15"
  - "UI-редактора поле так і не мало — опис нижче про це помилявся"
---

# Обмеження смуги: налаштування є, реалізації немає

> **Контекст:** знахідка на маргінесі
> [profile-scoped-settings](p0-profile-scoped-settings.md). Поле лишили глобальним
> саме тому, що спершу треба вирішити його долю.

## Опис

`GlobalSettings.bandwidth_limit_kbps` існує ([settings.rs:33](../../../src-tauri/src/settings.rs#L33)),
редагується в UI і описане в [architecture.md:714](../../architecture.md) («StreamManager
обчислює сумарну швидкість усіх активних потоків; при перевищенні…»). У Rust
**жодного споживача немає** — `stream_manager` це поле не читає. Пошук по репозиторію
дає лише оголошення, дефолт, тести-заглушки і документацію.

Тобто користувач має рубильник, який нічого не робить, і документацію, яка це
підтверджує. Для запису з радіо на повільному каналі це якраз та настройка, на яку
розраховують.

## Ухвалене рішення (2026-08-31): прибрати

**Поле видалено, тротлінг не реалізовано.** Рішення не нове — воно вже було ухвалене
ззовні беклогу: підфазу **3I-4 Bandwidth Limiting відхилено 2026-06-15**
([implementation-phases.md](../../implementation-phases.md), розділ «Фаза 3I»).
Обґрунтування там: радіо-потоки мають фіксований і вже малий бітрейт (128–320 kbps),
реального кейсу насичення каналу не виявлено, а вартість реалізації (throttle у
`stream::connection`, UI, взаємодія з `PlayerEngine`, timing ICY-метаданих) не
виправдана. Повертатись — лише за реальним тригером: насичення каналу при >5
одночасних записах.

Цей запис не переглядав те рішення, а виконав його другу половину: поле в
`GlobalSettings` пережило відхилену фазу й лишалося рубильником без споживача.

**Уточнення до опису вище:** UI-редактора поле не мало ніколи. `GeneralTab.tsx` його
не показував; у фронтенді жили лише рядок в інтерфейсі `GlobalSettings`
([tauri.ts](../../../src/lib/tauri.ts)) і шість тестових фікстур. Тобто «рубильник»
існував рівно на диску та в документації — це зменшило обсяг правки, але не змінило
її суті: `data-models.md` і `architecture.md` описували поведінку, якої не було.

**Сумісність:** дорелізне видалення без міграції, як у
[profile-scoped-settings](p0-profile-scoped-settings.md). `GlobalSettings` не має
`deny_unknown_fields`, тож старий `settings.json` із ключем `bandwidthLimitKbps`
завантажується як і раніше, а при першому ж збереженні ключ зникає з файлу. Сторож —
тест `bandwidth_limit_is_gone_from_global_settings` у
[settings.rs](../../../src-tauri/src/settings.rs): він перевіряє обидві половини —
що старий файл читається і що ключ не пишеться назад.

## Критерії готовності

- [x] Рішення ухвалено й записано в цьому файлі.
- [x] ~~Якщо реалізуємо~~ — не реалізуємо (фазу 3I-4 відхилено).
- [x] Поле зникло з `settings.rs` (структура + `Default`) і `tauri.ts`;
      у `GeneralTab.tsx` його не було; прибрано з `data-models.md` (JSON-приклад,
      TS-тип, Rust-структура, розділ «Defaults») і з шести тестових фікстур фронтенду.
- [x] У `architecture.md` вилучено розділ «Пропускна здатність» (§8) і рядок події
      `bandwidth-exceeded` з таблиці подій (§6); у `implementation-phases.md` зі
      зведеного рядка фази 3I прибрано «BW» (сам запис про відхилення 3I-4 лишається
      як журнал рішення).
- [x] `architecture.md` і фактична поведінка збігаються.
- [x] Гейти: `cargo test`, `pnpm test`, `pnpm vite:build`.

## Документи

- [implementation-phases.md](../../implementation-phases.md) — фаза 3I-4, де рішення ухвалено 2026-06-15
- [architecture.md](../../architecture.md) — тут жив опис тротлінгу, якого не існувало
- [data-models.md](../../data-models.md)
- [global-vs-profile-settings-boundary](../../decisions/2026-08-08-global-vs-profile-settings-boundary.md) — ADR, що лишив поле глобальним до цього рішення
