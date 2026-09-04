---
slug: list-key-modifier-guards
title: "Списки: навігаційні клавіші, Delete, Enter і Space спрацьовують із будь-яким модифікатором"
priority: P2
type: planned
status: ready
effort: S
kind: bug
target: 0.1.0
updated: 2026-09-04
a11y: true
depends_on: []
blocks: [list-shift-range-to-edge]
touches:
  - src/hooks/useCompositeList.ts
  - src/hooks/useCompositeList.test.tsx
  - src/components/streams/StreamList.tsx
  - src/components/streams/StreamList.test.tsx
  - src/components/songs/SongsList.test.tsx
  - docs/keyboard-shortcuts.md
  - docs/testing/nvda-list-key-modifier-guards.md
gates: [pnpm test, pnpm vite:build]
notes:
  - "Огрилено 2026-09-04, 11 рішень. Рішення винесені в ADR 2026-09-04-list-keys-are-bare-unless-named; тут — лише те, що робить цей запис"
  - "Опис до 2026-09-04 був застарілий: F2/F4 дістали власні гарди ще 4a8f2c5 (2026-08-14), F5 — свій; тобто «Ctrl+F2 сьогодні перейменовує рядок» неправда вже на момент, коли це писалося. Живі приклади в описі нижче звірені з HEAD"
  - "Списків не чотири, а шість: streams, songs, browser, wishlist, profiles (ProfileList), schedule (ScheduleTable)"
  - "Ревізія скасувала «NVDA-прогін не потрібен» із попередньої версії запису: Alt+Space після зміни вперше доходить до системного меню вікна, тобто твердження «не рухає фокус» стало непідтвердженим"
---

# Списки: навігаційні клавіші, `Delete`, `Enter` і `Space` спрацьовують із будь-яким модифікатором

> **Контекст:** знахідка ревізії
> [streams-transfer-hotkeys](done/p2-streams-transfer-hotkeys.md) (2026-08-07, A4).
> Огрилено 2026-09-04 — рішення в
> [ADR «Клавіші списку голі, поки не названо інакше»](../decisions/2026-09-04-list-keys-are-bare-unless-named.md),
> читати першим.

## Опис

`resolveKeyAction` у [useCompositeList.ts](../../src/hooks/useCompositeList.ts) має два стилі
метчингу. Комбінації з модифікаторами (`Ctrl+Space`, `Ctrl+C`, `Ctrl+A`, `Shift+↑/↓`)
перевіряються явно. Фінальний `switch (e.key)` і фолбек на `Space` — **не перевіряють
модифікатори взагалі**.

Живе на HEAD (звірено 2026-09-04):

| натискання | що робить сьогодні | чому це неправильно |
|---|---|---|
| `Ctrl+End`, `Alt+Home`, `Ctrl+↑/↓` | стрибок по списку | комбінація не належить списку, але споживається `consume()` |
| `Alt+Delete`, `Shift+Delete` | відкриває діалог видалення | жоден зі списків `mods` на `delete` не читає |
| `Ctrl+Tab` | вихід із зони | `Ctrl+Tab` — це спроба, не навігація (прецедент `KeyRecorder`) |
| `Shift+Space` **у потоках** | **слухає замість запису** | доки й коментарі стверджують протилежне |
| `Alt+Space` | дія рядка, системне меню вікна не відкривається | краде платформну клавішу Windows |
| `Ctrl+Shift+Enter` | «слухати» в потоках, «Провідник» у піснях, нічого в браузері | три різні таблиці пріоритету, жодна не оголошена |

`F2`, `F4` і `F5` вже мають власні гарди — три гарди з **двома різними** наборами модифікаторів
і без спільного правила. Практична шкода сьогодні мала (жодна з цих комбінацій нічим іншим не
зайнята), але це прихована міна: будь-який майбутній Tier-2 хоткей на `Ctrl`+функційна або
`Alt`+навігаційна клавіша мовчки продублює дію рядка.

Окремо варте уваги — **`Shift+Space` у потоках**. [keyboard-shortcuts.md:300](../keyboard-shortcuts.md),
[StreamList.tsx:424](../../src/components/streams/StreamList.tsx) і
[SongsList.tsx:134](../../src/components/songs/SongsList.tsx) стверджують: «модифікатори діють
лише на `Enter`, `Space` їх ігнорує». `StreamList` віддає `mods` у `activateStream`, а той читає
`mods?.shift` — тобто `Shift+Space` слухає. Тест був написаний на `Alt+Space`, тобто рівно на
той модифікатор, якого `activateStream` не читає: зелений тест над хибним твердженням.

## Що робить цей запис

Реалізує §1–§6 ADR у `resolveKeyAction` і прибирає наслідки в двох списках. Коротко:

1. Один гард перед `switch`: **будь-який** модифікатор → `null`. Винятки живуть **вище** гарда
   (`Ctrl+Space`, `Ctrl+C`, `Ctrl+A`, `Shift+↑/↓`, `Enter`, `Tab`, `F5`/`Shift+F5`).
2. `Enter` бере **рівно один** модифікатор із `{Shift, Ctrl, Alt}`; пари, трійки й `Meta`
   відхиляються.
3. Гарди `F2`/`F4` стають зайвими і прибираються — їх покриває спільний гард. Гард `F5`
   лишається (там `Shift` осмислений), але переїжджає **вище** спільного.
4. Новий чистий предикат `suppressesDefault(e)`, **похідний** від `resolveKeyAction`: гасить
   браузерний дефолт відхиленої клавіші через `preventDefault()` **без** `stopPropagation()`, і
   лише коли модифікатори суто `Ctrl`/`Shift`. `Alt`/`Meta` не чіпаються взагалі.
5. Гард поступається нативному контролю **лише** на `Enter`/`Space` (кнопка дії, завершальний
   стоп); навігаційні клавіші гасяться незалежно від того, що під фокусом.
6. `StreamList` перестає передавати `mods` у `activateStream` із клавіатурної гілки `toggle`.
   Мишача гілка (`CompositeRow.onActivate`, `Shift`+подвійний клік) передає далі — вона жива.

**Поза обсягом:** розширення діапазону `Shift+Home`/`End` — окремий запис
[list-shift-range-to-edge](p2-list-shift-range-to-edge.md); звуження типу `onAction` по
`ActionType` — коментар у коді там, де прибирається мертве читання, без запису в беклозі.

## Критерії готовності

- [x] Один гард перед `switch` у `resolveKeyAction`; винятки оголошені вище нього
- [x] `Enter` матчить лише з рівно одним модифікатором із `{Shift, Ctrl, Alt}`;
      `Ctrl+Shift+Enter`, `AltGr+Enter` (= `Ctrl+Alt`), `Meta+Enter` не матчать
- [x] Гарди `F2`/`F4` прибрані як зайві; `F5`/`Shift+F5` живі й не зачеплені
- [x] `suppressesDefault(e)` **не має власного переліку клавіш** — питає `resolveKeyAction`
      з обнуленими модифікаторами
- [x] Відхилена клавіша ніколи не викликає `stopPropagation()`
- [x] `Alt+*` і `Meta+*` не отримують `preventDefault()` від списку взагалі
      — на **шляху відмови** (§4). Три названі винятки вище гарда (`Ctrl+Space`,
      `Ctrl+C`, `Ctrl+A`) як і раніше приймають `Meta` псевдонімом до `Ctrl`
      (`ctrlOrMeta` — конвенція всього застосунку, [shortcuts.ts](../../src/lib/shortcuts.ts)),
      тож `Meta+Space`/`Meta+C`/`Meta+A` досі консумляться. Це не зачіпалось
      свідомо: звузити тут означало б розійтися з глобальним реєстром
- [x] `Shift+Space` на кнопці дії та на завершальному стопі й далі їх активує (§5)
- [x] `Ctrl+End` з кнопки дії всередині рядка **не** прокручує список
- [x] `Shift+↑/↓` (діапазон), `Ctrl+A`, `Ctrl+C`, `Ctrl+Space`, `Escape`, `Shift+Tab`,
      `Shift+Enter`/`Ctrl+Enter`/`Alt+Enter` — без змін
- [x] `StreamList`: клавіатурна гілка `toggle` більше не передає `mods`; мишача передає
- [x] Табличний юніт-тест на `suppressesDefault` — матриця «клавіша × модифікатор»
      (12 клавіш × `Ctrl`/`Alt`/`Shift`/`Meta` та їхні пари)
- [x] Тести [StreamList.test.tsx:402](../../src/components/streams/StreamList.test.tsx) і
      [SongsList.test.tsx:101](../../src/components/songs/SongsList.test.tsx) переписані як
      твердження **про намір** («`Alt+Space` у списку не робить нічого і не гаситься»), а не
      підігнані під новий результат
- [x] Тест [useCompositeList.test.tsx:292](../../src/hooks/useCompositeList.test.tsx)
      («passes Shift/Ctrl modifiers … for Enter **and Space**») розділений: `Enter` везе,
      `Space` — ні
- [x] Перевірено всі шість списків на навмисну залежність від поточної поведінки
      (grep по `onAction`-гілках) — жодна не зламана
- [x] [keyboard-shortcuts.md](../keyboard-shortcuts.md) виправлено: твердження про `Space` було
      хибним; додано правило «гола клавіша, якщо не названо» з посиланням на ADR
- [x] `docs/help/` **не** змінюється — жодна з відпущених комбінацій там не обіцяна
      (звірено: лише `Shift+Enter`, `Ctrl+Enter`, `Delete`, `Shift+F10`, `Ctrl+Space`,
      `Shift+↑↓`, `Ctrl+A`, `Escape` — усі живі)
- [x] `pnpm test` без регресій, `pnpm vite:build` зелений
- [ ] NVDA-прогін за [nvda-list-key-modifier-guards.md](../testing/nvda-list-key-modifier-guards.md)
      (4 сценарії, див. нижче)

## NVDA-прогін

Вузький: чекліст пишеться навколо **знахідок ревізії**, а не критеріїв запису. Матриця
«клавіша × модифікатор» — робота тесту, не людини.

1. **`Alt+Space` у списку.** Що станеться з фокусом: системне меню вікна, нічого, чи щось третє.
   Це єдине набуття запису і єдине місце, де код не дає відповіді.
2. **`Shift+Space` на кнопці дії та на «Завантажити ще»** — кнопка мусить спрацювати (§5).
3. **`Ctrl+End` і `Shift+Space` на довгому списку** — список **не** повзе під нерухомим фокусом.
4. **`Shift+↓` (діапазон) і `Shift+Enter` у потоках** — не постраждали; `Shift+Space` у потоках
   більше не слухає.

## Документи

- ADR: [2026-09-04-list-keys-are-bare-unless-named.md](../decisions/2026-09-04-list-keys-are-bare-unless-named.md)
- Код: `src/hooks/useCompositeList.ts` (`resolveKeyAction`, гард, `suppressesDefault`)
- Сусідній ADR по тому самому `switch`:
  [2026-09-03-trailing-stop-crosses-only-on-down.md](../decisions/2026-09-03-trailing-stop-crosses-only-on-down.md)
- Джерело: [p2-streams-transfer-hotkeys.md](done/p2-streams-transfer-hotkeys.md) (A4)
- Хвіст: [p2-list-shift-range-to-edge.md](p2-list-shift-range-to-edge.md)
