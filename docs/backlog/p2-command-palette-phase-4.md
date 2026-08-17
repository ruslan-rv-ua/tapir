---
slug: command-palette-phase-4
title: "Командна палітра — Phase 4: context-aware ранжування"
priority: P2
type: planned
status: blocked
effort: S
kind: feature
target: 0.2.0
updated: 2026-08-17
a11y: true
depends_on: [command-palette-phase-3]
blocks: []
touches: [src/components/common/CommandPalette.tsx, src/components/common/CommandPalette.test.tsx]
gates: [pnpm test, pnpm vite:build]
blocked_reason: "Phase 3 командної палітри не реалізована — немає ні поля PaletteItem.type, ні пісень у палітрі, які можна ранжувати"
notes:
  - "2026-07-23: звірено з фіналізованою phase-3 — типів після неї буде action|song|navigate."
  - "2026-07-23: виправлено хибне припущення про fuzzy-бібліотеку — пошук у палітрі substring без score; fuzzy — окремий запис command-palette-fuzzy-search."
  - "2026-07-23: промотовано idea → planned/blocked; обсяг звужено до одного правила Songs→пісні (effort M→S); mode-prefixes (>/@) вирізано в окремий запис command-palette-mode-prefixes."
  - "2026-07-23: прибрано успадкований з ADR мапінг «browser → станції»: за DA4 станцій Radio Browser у палітрі не буде; майбутні пункти-потоки (taxonomy, kind=stream) належать екрану Streams, не Browser."
---

# Командна палітра — Phase 4: context-aware ранжування

> **Контекст:** blocked до реалізації [command-palette-phase-3](p1-command-palette-phase-3.md).
> Реалізує DA2 (ADR) у мінімальному обсязі: одне правило «на Songs — пісні першими».
> Mode-prefixes вирізано в [command-palette-mode-prefixes](p3-command-palette-mode-prefixes.md).

## Опис

ADR DA2 (§3 рішення): палітра стає **context-aware** — підіймає елементи поточного
екрана першими у результатах. Після фіналізації phase-3 у палітрі рівно один
контентний тип — пісні (`PaletteItem.type: "song"`), тож правило одне:

**Якщо `$activeSection === "songs"` — song-пункти йдуть першими.**

Поточний розділ (`$activeSection` у Nanostores) вже відомий глобально. Пошук у
палітрі — токенізований substring **без score** (рішення phase-3), тому буст — це
**стабільне сортування** відфільтрованого списку: спершу song-пункти (у своєму
поточному порядку — найновіші за `recordedAt` першими), далі решта у наявному
порядку. Алгоритм пошуку не змінюється, лише порядок результатів.

Чому інші екрани без бусту (стан на 2026-07-23):

| Екран | Чому без бусту |
|---|---|
| `streams` | дії (статичні + per-stream) і так на початку списку — буст був би no-op |
| `browser` | станцій Radio Browser у палітрі немає й не буде (DA4) |
| `wishlist`, `schedule`, `profiles` | відповідного типу вмісту в палітрі немає |

Якщо [command-palette-taxonomy](p3-command-palette-taxonomy.md) колись ухвалить
пункти-потоки (`stream`) — додати правило `streams` → `stream` окремим follow-up.

Порожній запит нічого не змінює: пісні з'являються лише при запиті ≥ 2 символів
(phase-3), тож фіксований порядок «статичні → per-stream → навігація» лишається
недоторканим.

Якщо на момент реалізації вже впроваджено fuzzy зі score
([command-palette-fuzzy-search](p2-command-palette-fuzzy-search.md)) — замість
групування додавати числовий `contextBoost` до score; питання порогу перенесено
у той запис.

## Прийняті рішення (2026-07-23)

| Питання | Рішення |
|---|---|
| Обсяг бусту | Мінімальний: лише Songs → пісні; решта екранів без бусту (таблиця в Описі). Жодних контингенцій «якщо тип з'явиться» у planned-запису |
| Mode-prefixes (`>`/`@`) | Вирізано в [command-palette-mode-prefixes](p3-command-palette-mode-prefixes.md): на укр. розкладці `>`/`@` не набрати без перемикання, цінність для одного NVDA-користувача недоведена |
| Механізм | Стабільне сортування груп типів (substring без score); `contextBoost` до score — лише якщо fuzzy вже злито |
| Wishlist/Schedule (кол. питання 4) | Без бусту — відповідного вмісту в палітрі немає; питання зняте |
| NVDA + reranking (кол. питання 2) | Знято з коду: список — не live-region (listbox + `aria-activedescendant`), єдиний live-канал — дебаунсований анонс кількості через глобальний LiveAnnouncer; «перечитування всього списку» неможливе. Ефект переупорядкування — активним стає нове перше; підтвердити NVDA-прогоном |
| Поріг бусту при fuzzy (кол. питання 3) | Перенесено у [command-palette-fuzzy-search](p2-command-palette-fuzzy-search.md) (актуальне лише зі score) |

## Критерії готовності

- [ ] `$activeSection` читається у логіці побудови результатів палітри
- [ ] На Songs при запиті ≥ 2 символів song-пункти йдуть першими; взаємний порядок пісень (найновіші перші) та решти пунктів не змінюється (стабільне сортування)
- [ ] На всіх інших екранах (`streams`, `browser`, `wishlist`, `schedule`, `profiles`) порядок ідентичний поведінці до зміни — регресійний тест
- [ ] Порожній запит: порядок «статичні → per-stream → навігація» не змінюється
- [ ] Відсутність song-збігів на Songs не ламає порядок решти пунктів
- [ ] Юніт-тести: задані елементи + активний розділ → очікуваний порядок результатів
- [ ] Дебаунсований анонс кількості не породжує додаткових оголошень через ранжування (кількість та сама — анонс один)
- [ ] NVDA-прогін: після переупорядкування активний пункт (нове перше) озвучується коректно через `aria-activedescendant`

## Документи

- [decisions/2026-05-31-command-palette-and-search-ux.md](../decisions/2026-05-31-command-palette-and-search-ux.md) —
  Фаза Ф4, рішення DA2 і DA4, §8
- [command-palette-phase-3](p1-command-palette-phase-3.md) — попередня фаза
  (вводить `PaletteItem.type` і пісні)
- [command-palette-mode-prefixes](p3-command-palette-mode-prefixes.md) — вирізаний
  аспект mode-prefixes
- [command-palette-fuzzy-search](p2-command-palette-fuzzy-search.md) — туди
  перенесено питання порогу бусту
- [decisions/2026-06-02-context-aware-keyboard-shortcuts.md](../decisions/2026-06-02-context-aware-keyboard-shortcuts.md) —
  суміжний патерн context-aware поведінки
- Код: [src/components/common/CommandPalette.tsx](../../src/components/common/CommandPalette.tsx),
  [src/stores/navigation.ts](../../src/stores/navigation.ts) (`$activeSection`)
