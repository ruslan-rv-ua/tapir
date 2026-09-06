---
slug: stream-failure-tray-toast
title: "Поразка потоку при згорнутому вікні не лишає системного сліду"
priority: P2
type: planned
status: ready
effort: S
kind: feature
target: 0.2.0
updated: 2026-09-06
a11y: true
depends_on: [error-state-never-reaches-ui]
blocks: []
touches:
  - src-tauri/src/tray/notify.rs
  - src-tauri/src/stream/manager.rs
  - src-tauri/src/profile.rs
  - src-tauri/src/i18n.rs
  - src/components/profile/ProfileInterfaceTab.tsx
  - src/lib/tauri.ts
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/help/uk/settings.md
  - docs/help/en/settings.md
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Рішення ухвалене grooming'ом 2026-09-06 разом із error-state-never-reaches-ui і записане в ADR того ж дня (§6). Відщеплено свідомо: батьківський запис доводить до роботи наявні поверхні, цей додає нову."
---

# Поразка потоку при згорнутому вікні не лишає системного сліду

> **Контекст:** рішення вже ухвалене —
> [ADR 2026-09-06 §6](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md).
> Цей запис лише реалізує його. Спершу має бути зроблений
> [error-state-never-reaches-ui](done/p1-error-state-never-reaches-ui.md): поки стану поразки
> немає, плашці нема на що спрацьовувати.

## Опис

Tapir — застосунок, який згортають і лишають писати на ніч. Усе, що батьківський запис
робить із поразкою потоку, живе **всередині вікна**: рядок, метрика «Потребує уваги»,
тост, репліка live region. За [ADR 2026-09-01](../decisions/2026-09-01-response-surfaces-ear-window-system.md)
жодна з цих поверхонь не спостережувана, поки вікно не в фокусі — а запис беззвучний, тож
вухо не відповідає нічого. Отже поверхня — система.

Такої плашки немає. Запис, що вмер о другій ночі, до ранку не лишає системного сліду.

## Що саме зробити

- **Нова категорія `ToastKind`.** Не тулити за прецедентом сусіднього рядка — розділ «Коли
  переглянути» [ADR 2026-08-17](../decisions/2026-08-17-tray-toast-categories.md) вимагає
  розширювати перелік і той ADR разом із ним.
- **Свій прапорець у `UiSettings`, типово ввімкнений.** За правилом того ж ADR («прапорцем
  вимикається те, що лишає інший слід»): слід є — рядок і метрика дочекаються, поки вікно
  відкриють. Мітка називає поверхню, як дві сусідні: слова «в треї» не уникати.
- **Текст — ті самі два ключі причини**, які вводить батьківський запис. Одна подія — один
  ключ ([ADR 2026-08-17 про локалізацію](../decisions/2026-08-17-native-layer-localisation.md) §2);
  дзеркалити текст вікна окремим рядком не можна.
- **Правка [ADR 2026-08-17 про категорії тостів](../decisions/2026-08-17-tray-toast-categories.md)**:
  перелік категорій розширюється, прапорців стає більше.

> **Звірити з сусідом.** [wishlist-match-tray-notification](p2-wishlist-match-tray-notification.md)
> у тій самій версії теж додає категорію `ToastKind` і свій прапорець. Два записи разом
> дають **два нові профільні винятки**, а [ADR 2026-08-08](../decisions/2026-08-08-global-vs-profile-settings-boundary.md)
> ставить поріг «накопичилося 2–3 нові винятки → переглядати фільтр 2». Той, хто робить
> цей запис другим, зобов'язаний поріг перевірити, а не додати рядок мовчки; нумерацію
> категорій у правці ADR брати за фактом, а не за цим текстом.

## Критерії готовності

- [ ] `docs/help/uk|en/settings.md` — новий прапорець описано разом із двома сусідніми
- [ ] `is_enabled` вичерпно розбирає всі чотири категорії; тест на гейт для нової
- [ ] Плашка спливає при згорнутому вікні і **не** спливає, коли вікно у фокусі
      (вибір за фокусом, не за видимістю — ADR 2026-09-01 §3)
- [ ] Знятий прапорець справді дає тишу; репліку у вікні гейт **не** накриває
- [ ] ADR про категорії тостів доповнено четвертою категорією
- [ ] `cargo test`, `cargo clippy --all-targets`, `pnpm test`, `pnpm typecheck`,
      `pnpm vite:build` — без помилок
- [ ] NVDA-прогін: плашку чути при згорнутому вікні; прапорець у налаштуваннях читається
      й перемикається з клавіатури

## Документи

- [ADR 2026-09-06](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §6 — рішення
- [error-state-never-reaches-ui](done/p1-error-state-never-reaches-ui.md) — батьківський запис
- [ADR 2026-09-01](../decisions/2026-09-01-response-surfaces-ear-window-system.md) — вухо, вікно, система
- [ADR 2026-08-17 про категорії тостів](../decisions/2026-08-17-tray-toast-categories.md) — коли плашка гейтиться
- код: [notify.rs](../../src-tauri/src/tray/notify.rs),
  [ProfileInterfaceTab.tsx](../../src/components/profile/ProfileInterfaceTab.tsx)
