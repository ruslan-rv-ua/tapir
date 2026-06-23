# F2 — Редагувати потік (Edit Stream shortcut)

- **Слаг:** `f2-edit-stream`
- **Тип:** покращення (шорткат)
- **Пріоритет:** P1
- **Стан:** ready (питання закрито 2026-06-23)
- **Зусилля:** S (один інтент у хуку + гілка в `StreamList` + 1 запис у `SHORTCUTS` + i18n + doc-fixes + тест)
- **Залежності:** **усі вже в продакшені** — лишається тільки провести клавішу `F2`:
  - `AddStreamDialog` edit-режим ✅ ([AddStreamDialog.tsx:13-56](../../src/components/streams/AddStreamDialog.tsx#L13-L56))
  - стор `$editStream` ✅ ([streams.ts:28](../../src/stores/streams.ts#L28))
  - пункт «Edit» у меню рядка ✅ ([StreamContextMenu.tsx:53-54](../../src/components/streams/StreamContextMenu.tsx#L53-L54)) — тобто **Shift+F10 → Edit вже відкриває edit-діалог сьогодні**
  - backend `update_stream(streamId, name)` ✅, i18n `edit_stream`/`stream_updated` ✅

## Опис

`F2` — стандартний шорткат «перейменувати/редагувати» у Windows (Explorer, VS Code, NVDA-списки). Зафіксований у [keyboard-shortcuts.md](../keyboard-shortcuts.md) як запланований (Tier 2′, ⬜), але клавіша **не проведена**.

Поточний стан: відредагувати (= перейменувати) потік можна вже зараз, але тільки:
- Shift+F10 → меню → «Edit» (3 кроки), або
- мишею на рядку → ⋯ → Edit.

З `F2`: одна клавіша на фокусованому рядку.

**Поведінка:** `F2` на фокусованому рядку таблиці потоків → відкрити `AddStreamDialog` в edit-режимі (той самий діалог, що й при додаванні; передається об'єкт потоку через `$editStream`, поле назви заповнене).

## Рішення (узгоджено 2026-06-23)

| Аспект | Рішення |
|---|---|
| **Обсяг edit** | **Тільки перейменування** (зміна `name`). URL/auth/ignorelist — поза скоупом, винесено в окремий запис [p2-full-edit-stream.md](p2-full-edit-stream.md). Причина: і UI (поле URL у edit-режимі приховане, [AddStreamDialog.tsx:70](../../src/components/streams/AddStreamDialog.tsx#L70)), і backend (`update_stream` приймає лише `name`, [stream_commands.rs:236-248](../../src-tauri/src/commands/stream_commands.rs#L236-L248)) сьогодні підтримують лише назву. |
| **Місце обробки** | **Generic `edit`-інтент у `useCompositeList`** (як `delete`): `F2 → onAction("edit", …)`. У цьому тикеті обробляє **лише `StreamList`**; інші композитні списки ігнорують `edit` (no-op) і підключаться окремо. |
| **Реєстр / резерв** | `F2` додається в `SHORTCUTS` як **reserved Tier 2′** (group `list`, без `match`/`run`) — KeyRecorder відмовляє в прив'язці `F2` глобально (рекордер приймає `F1–F24`, на відміну від `Enter`/`Delete`), і `F2` з'являється у F1-довідці. Нова i18n-мітка `settings_hotkey_action_row_edit`. |
| **Шлях даних** | `StreamList.onAction("edit")` → `$editStream.set(stream)` напряму (як `StreamContextMenu`). `StreamsPanel` **не** змінюється — ніякого `editStreamId`-стану немає й не потрібно. |
| **Фокус** | react-aria `Modal` сам відновлює фокус на тригер (summary-стоп рядка) при закритті → NVDA читає відредагований рядок. Підтвердити NVDA-проходом. |

## Технічна реалізація

1. **`useCompositeList.ts`** (generic інтент):
   - `ActionType` += `'edit'`.
   - `ActionId` += `"edit"`; у `resolveKeyAction` додати `case "F2": return "edit";` (без модифікаторів, за зразком `Delete`).
   - У switch `onKeyDownCapture` додати поруч із `delete`:
     `case "edit": consume(); onActionRef.current("edit", activeItemId, activeSegment, modifiers(e)); break;`
2. **`StreamList.tsx`** (inline `onAction`, [StreamList.tsx:323-342](../../src/components/streams/StreamList.tsx#L323-L342)):
   - Додати гілку `if (type === "edit") { const s = streams.find((x) => x.id === itemId); if (s) $editStream.set(s); return; }`.
   - Імпортувати `$editStream` зі `stores/streams`.
   - edit — **завжди single-row** (ігнорує виділення, на відміну від `delete`, що діє на всю множину).
3. **`shortcuts.ts`** — додати серед Tier 2′ list-записів:
   `{ id: "row-edit", combo: "F2", label: m.settings_hotkey_action_row_edit, group: "list", reserved: true }`.
   `RESERVED_WEBVIEW_COMBOS` і ShortcutsHelp виводяться з цього масиву автоматично.
4. **i18n** — додати `settings_hotkey_action_row_edit` (EN/UK), регенерувати через vite-плагін ([[typecheck-paraglide-gotchas]]).
5. **Doc-fixes** (частина тикета):
   - [keyboard-shortcuts.md:179](../keyboard-shortcuts.md#L179) — рядок `F2` ⬜ → ✅ + посилання на реалізацію.
   - [architecture.md:477](../architecture.md#L477) — `update_stream` → реальна сигнатура `{streamId, name}` (повне редагування — у [p2-full-edit-stream.md](p2-full-edit-stream.md)).
   - [accessibility.md:299](../accessibility.md#L299) — `EditStreamDialog` → `AddStreamDialog (edit-режим)`.
6. **Тест** — F2 на рядку потоку → `$editStream` встановлено в цей потік / діалог відкривається в edit-режимі.

> **Важливо (виправлення попереднього плану):** немає типу `onAction("edit", streamId)` без сегмента/модифікаторів — сигнатура `onAction(type, itemId, segment, modifiers)`; немає функції `handleAction` у `StreamList` (це inline-проп; `handleAction` живе у `StreamContextMenu`); немає стану `editStreamId` у `StreamsPanel` — edit керується стором `$editStream`. `F2` **не** був у `SHORTCUTS` і **не** був зарезервований (це й додаємо тут).

## Критерії готовності

- [ ] `F2` на фокусованому рядку потоку відкриває `AddStreamDialog` в edit-режимі
- [ ] Поле «назва» заповнене поточною назвою; URL у edit-режимі не показується (rename-only — узгоджено)
- [ ] Після збереження назва оновлюється, діалог закривається, тост `stream_updated`
- [ ] NVDA: фокус повертається на відредагований рядок після закриття
- [ ] `F2` у `SHORTCUTS` (reserved): KeyRecorder відмовляє в прив'язці `F2`; `F2` видно у F1-довідці
- [ ] Інші композитні списки на `F2` — no-op (без регресій `delete`/`enter`/selection)
- [ ] Doc-fixes: keyboard-shortcuts.md (✅), architecture.md (сигнатура), accessibility.md (назва компонента)
- [ ] Гейти: `pnpm test` + `pnpm vite:build` зелені (`tsc` ~51 paraglide-помилка — не блокер, [[typecheck-paraglide-gotchas]])

## Документи

- [keyboard-shortcuts.md](../keyboard-shortcuts.md) — F2 як Tier 2′
- Окремий беклог на повне редагування: [p2-full-edit-stream.md](p2-full-edit-stream.md)
- Код-зразок: [useCompositeList.ts](../../src/hooks/useCompositeList.ts) — `resolveKeyAction`, `Delete` case
- Код: [StreamList.tsx](../../src/components/streams/StreamList.tsx) — inline `onAction`
- Код: [StreamContextMenu.tsx](../../src/components/streams/StreamContextMenu.tsx) — наявний шлях «Edit» (`$editStream.set`)
- Код: [AddStreamDialog.tsx](../../src/components/streams/AddStreamDialog.tsx) — edit-режим
- Реєстр: [shortcuts.ts](../../src/lib/shortcuts.ts), [reservedShortcuts.ts](../../src/lib/reservedShortcuts.ts)

## Промпт для агента

```text
Реалізуй F2 — Редагувати (= перейменувати) потік. Більшість шляху вже в продакшені (edit-режим AddStreamDialog, стор $editStream, пункт «Edit» у меню рядка, backend update_stream(name)) — лишається провести клавішу F2. Спершу звірся з кодом, не дублюй наявне.

Рішення вже узгоджені (див. таблицю в цьому файлі):
1) useCompositeList.ts: додати generic edit-інтент — ActionType += 'edit'; resolveKeyAction: case "F2" → "edit"; у switch onKeyDownCapture додати case "edit" поруч із delete (consume + onAction("edit", …)).
2) StreamList.tsx: у inline onAction додати гілку type === "edit" → $editStream.set(stream) напряму (як StreamContextMenu); edit завжди single-row (ігнорує виділення). StreamsPanel НЕ чіпати.
3) shortcuts.ts: додати reserved Tier 2′ запис { id: "row-edit", combo: "F2", group: "list", reserved: true, label: m.settings_hotkey_action_row_edit }. RESERVED і F1-help виводяться автоматично.
4) i18n: settings_hotkey_action_row_edit (EN/UK), регенерувати через vite-плагін.
5) Doc-fixes: keyboard-shortcuts.md (F2 → ✅), architecture.md (update_stream → {streamId, name}), accessibility.md (EditStreamDialog → AddStreamDialog edit-режим).
6) Тест: F2 на рядку потоку встановлює $editStream / відкриває діалог у edit-режимі.

Обсяг — ТІЛЬКИ перейменування (name). URL/auth/ignorelist — поза скоупом (див. p2-full-edit-stream.md).

Гейти: pnpm test + pnpm vite:build (tsc ~51 преекзистинг-помилку від paraglide — не блокер).
```
