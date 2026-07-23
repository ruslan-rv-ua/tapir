---
slug: command-palette-phase-3
title: "Командна палітра — Фаза 3: розширення контенту (пісні, навігація)"
priority: P2
type: planned
status: ready
effort: S
kind: feature
target: 0.2.0
updated: 2026-07-23
a11y: true
depends_on: []
blocks: [command-palette-phase-4]
touches: [src/components/common/CommandPalette.tsx, src/components/common/CommandPalette.test.tsx, src/i18n/messages/uk.json, src/i18n/messages/en.json]
gates: [pnpm test, pnpm vite:build]
notes:
  - "2026-07-23: промотовано idea/draft → planned/ready; всі відкриті питання закрито (див. «Прийняті рішення»)."
  - "Станції вирізано з фази повністю → пункти-потоки живуть у command-palette-taxonomy; ця фаза = пісні + навігація, per-stream дії не чіпаються."
  - "effort переоцінено M→S: станції вирізано, пісні вже завантажені в $songs, навігація генерується з SECTIONS."
  - "Пошук лишається токенізованим substring; fuzzy — окремий запис command-palette-fuzzy-search."
---

# Командна палітра — Фаза 3: розширення контенту (пісні, навігація)

> **Контекст:** добудова `CommandPalette.tsx` (зараз — лише дії над потоками) до задуму
> ADR DA1: додаються **пісні** та **навігаційні команди**. Станції (пункти-потоки)
> **вирізані** в [command-palette-taxonomy](p2-command-palette-taxonomy.md) — ця фаза
> per-stream дій не торкається. Читати спершу ADR
> [`2026-05-31-command-palette-and-search-ux.md`](../decisions/2026-05-31-command-palette-and-search-ux.md).

## Опис

### Що є зараз

`CommandPalette.tsx` — глобальний модальний overlay, відкривається через `Ctrl+K`
(єдиний тригер: видимих кнопок «Команди» в коді вже немає — фази Ф1/Ф2 ADR, DA5,
фактично виконані). Наразі містить **лише дії над потоками** поточного профілю:
- «Додати потік», «Імпортувати потоки», «Експортувати потоки»
- «Записати все» / «Зупинити все»
- Per-stream: «Записати» / «Зупинити запис» (sublabel = назва потоку, тож потоки
  **вже шукаються** в палітрі за назвою)

Пошук — токенізований case-insensitive substring по `label` + `sublabel`.
A11y-обв'язка готова (злитий `command-palette-results-a11y`): `role="option"`,
`aria-selected`, `aria-activedescendant`, дебаунсований анонс кількості результатів,
повернення фокусу на opener при закритті.

### Що додається

#### 1. Записані пісні

Джерело: стор `$songs` — **вже завантажений** при старті та зміні профілю
(`useProfileSync` → `loadSongs()`), жодних IPC при відкритті палітри. Backend
повертає повні метадані (`Song`: `fileName`, `artist`, `title`, `album`, `station`,
`durationMs`, `recordedAt`, …) — питання «filename vs metadata» знято.

Один пункт на пісню: «Відтворити пісню: \<artist – title>» (fallback `fileName`,
коли обидва теги порожні). Активація → `playSavedSong(path)` через глобальний
плеєр, **без** переходу на екран Songs. «Показати у провіднику» в палітру не
дублюємо — ця дія лишається в контекст-меню екрана Songs (Shift+F10).

Пісні підмішуються лише при запиті ≥ 2 символів, максимум 10 збігів, найновіші
за `recordedAt` першими.

#### 2. Навігаційні команди («Перейти до: …»)

Генеруються з реєстру `SECTIONS` (`src/lib/sections.ts`) — 6 секцій, включно з
«Профілі»; disabled-секції пропускаються автоматично. Плюс окремий пункт
«Налаштування». Роутера в застосунку немає: активація = `$activeSection.set(id)`;
налаштування = `$settingsDialogOpen.set(true)`.

App вже сам анонсує секцію (polite) і фокусує її першу зону при перемиканні
([App.tsx](../../src/App.tsx), ефект на `$activeSection`) — навігаційним командам
цю механіку не дублювати, лише не заважати їй.

### Чому це цінно для незрячого користувача

NVDA-навігація по глибоких екранах — багато натискань до цілі. Збагачена палітра
дає **один `Ctrl+K` + кілька символів** до будь-якої пісні чи екрана — без
проходження зон і меню. Особливо важливо для Songs (сотні файлів накопичуються)
та швидкого перемикання секцій (дубль Alt+0…5, але шукається за назвою, а не
запам'ятовується цифра).

## Прийняті рішення (2026-07-23)

| Питання | Рішення |
|---|---|
| Станції у фазі | **Вирізано повністю** → [command-palette-taxonomy](p2-command-palette-taxonomy.md); per-stream «Записати/Зупинити» лишаються як є. (Формулювання ADR Ф3 «станції (Browser)» не реалізовуємо: серверний пошук у палітрі суперечив би DA4; локальні потоки вже шукаються через sublabel.) |
| Пунктів на пісню | Один — «Відтворити»; reveal-у-провіднику не дублюємо (є в контекст-меню Songs) |
| Порожній запит | Статус-кво (статичні + per-stream дії) **+ навігація в кінці**; пісні лише при запиті ≥ 2 символів |
| Ліміт пісень | 10 збігів, найновіші за `recordedAt` першими |
| Механізм пошуку | Токенізований substring (патерн `$filteredSongs`); fuzzy — окремий запис [command-palette-fuzzy-search](p2-command-palette-fuzzy-search.md) |
| Sublabel пісні | `<station> · <дата recordedAt>` (локалізована дата) |
| Анонс кількості | Наявний дебаунсований анонс, рахує показані пункти; окремого «10 з N» не робимо |
| Ранжування | Немає — фіксований порядок типів; recency/context-boost — [command-palette-phase-4](p3-command-palette-phase-4.md) |
| Кнопка «Команди» (DA5) | Питання зняте — кнопок у коді вже немає, Ф1/Ф2 виконані |

## Критерії готовності

### Пісні
- [ ] При запиті ≥ 2 символів у результатах є пункти «Відтворити пісню: \<artist – title>» для збігів з `$songs`; fallback на `fileName`, коли `artist` і `title` порожні
- [ ] `sublabel` = `<station> · <дата recordedAt>`
- [ ] Пошук пісень: токенізований substring по `fileName + artist + title + album + station`
- [ ] Показуються максимум 10 збігів, найновіші за `recordedAt` першими
- [ ] При порожньому запиті чи 1 символі пісень у списку немає
- [ ] Активація → закрити палітру + `playSavedSong(path)`; без переходу на екран Songs; фокус повертається на opener; помилка IPC → toast (як у наявних дій)
- [ ] Джерело — стор `$songs`; жодних IPC-викликів при відкритті палітри

### Навігація
- [ ] Навігаційні пункти генеруються з `SECTIONS` (включно з «Профілі»; disabled пропущено) + пункт «Налаштування»; видимі при порожньому запиті, в кінці списку
- [ ] `label` = «Перейти до: \<назва секції>» — i18n-повідомлення з параметром; назва через `label()` з реєстру (слідує активній локалі)
- [ ] Активація секційного пункту → закрити палітру + `$activeSection.set(id)`; фокус опиняється в першій зоні нової секції, NVDA чує анонс назви секції (наявний ефект App)
- [ ] «Налаштування» → закрити палітру + `$settingsDialogOpen.set(true)`; фокус у діалозі
- [ ] Після навігаційної команди фокус **не** лишається на body: restore-на-opener (який розмонтовано) має тихо поступитися фокусу нової секції — покрити тестом порядок «close → set section»

### Доступність (регресія — вже працює, не зламати)
- [ ] `role="option"` / `aria-selected` / `aria-activedescendant` коректні для пунктів нових типів
- [ ] Дебаунсований анонс кількості результатів рахує й нові пункти
- [ ] Enter виконує дію і закриває палітру; для не-навігаційних дій фокус повертається на opener
- [ ] Стрілки / Home / End / PageUp / PageDown працюють по змішаному списку

### Якість
- [ ] `PaletteItem` отримує поле `type: "action" | "song" | "navigate"` — підготовка до phase-4, поведінку не змінює
- [ ] Порядок при порожньому запиті: статичні дії → per-stream дії → навігація (стабільний, без ранжування)
- [ ] `command_palette_placeholder` оновлено (згадує пісні/навігацію); нові i18n-ключі в `uk.json` і `en.json`; регенерація paraglide через vite-плагін
- [ ] Тести `CommandPalette.test.tsx`: пісні (поріг 2 символи, cap 10, fallback fileName, виклик `playSavedSong`), навігація (генерація з SECTIONS, активація, налаштування), фокус після навігації

## Технічні деталі

- `Song` (`src/types/song.ts`): `path`, `fileName`, `artist`, `title`, `album`,
  `genre`, `station`, `format`, `durationMs`, `sizeBytes`, `recordedAt`, `isComplete`.
- `$songs` наповнюється в `useProfileSync` (подія `profile-changed`) — палітра лише
  читає стор.
- Взаємодія close → navigate: `close()` знімає `isOpen`, ефект палітри спробує
  сфокусувати opener; після `$activeSection.set(...)` стара секція розмонтовується,
  і rAF-ефект App фокусує першу зону нової. `focus()` на відʼєднаному елементі —
  no-op, тож послідовність «спрацює сама», але порядок викликів у action має бути
  саме `close(); $activeSection.set(...)` — зафіксувати тестом.
- Історична довідка: ADR Ф3 писав «станції (Browser)» — тягнути серверний пошук
  Radio Browser у палітру не будемо (DA4: структуровані фільтри не лягають в одне
  fuzzy-поле); «станції» палітри = локальні потоки профілю, і вони вже покриті
  per-stream діями (а їхня майбутня форма — питання taxonomy).

## Документи

- [decisions/2026-05-31-command-palette-and-search-ux.md](../decisions/2026-05-31-command-palette-and-search-ux.md) — ADR, фази Ф3/Ф4, рішення DA1–DA5
- [implementation-phases.md](../implementation-phases.md) — roadmap (пункт про CommandPalette)
- Код: `src/components/common/CommandPalette.tsx`; тести: `src/components/common/CommandPalette.test.tsx`
- Стори/реєстри: `src/stores/navigation.ts` (`$activeSection`, `$commandPaletteOpen`), `src/stores/songs.ts` (`$songs`), `src/stores/settings.ts` (`$settingsDialogOpen`), `src/lib/sections.ts` (`SECTIONS`)
- Суміжні записи: [command-palette-taxonomy](p2-command-palette-taxonomy.md) (станції/форма пунктів), [command-palette-phase-4](p3-command-palette-phase-4.md) (ранжування), [command-palette-fuzzy-search](p2-command-palette-fuzzy-search.md), [command-palette-dual-language-search](p2-command-palette-dual-language-search.md)
