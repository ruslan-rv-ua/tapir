# KB-09 · Детект колізій у KeyRecorder — дизайн

- **Статус:** затверджено (brainstorming, 2026-06-07).
- **Бэклог:** [keyboard-shortcuts-backlog.md → KB-09](../../keyboard-shortcuts-backlog.md).
- **Реєстр клавіш:** [keyboard-shortcuts.md](../../keyboard-shortcuts.md).
- **Прецедент патерну:** винесений, юніт-тестований lib-гард
  [shortcutGuard.ts](../../../src/lib/shortcutGuard.ts) (KB-04).

## Проблема

`onValidate`-шов у [KeyRecorder.tsx](../../../src/components/settings/KeyRecorder.tsx)
працює, і `HotkeysTab` уже **жорстко відхиляє** комбо, що дублює інший Tier-1
OS-хоткей ([HotkeysTab.tsx:47-59](../../../src/components/settings/HotkeysTab.tsx#L47-L59)):
повертає `settings_hotkey_duplicate`, `onChange` не викликається, нічого не
зберігається, показується `role="alert"`. **Ця половина KB-09 вже зроблена.**

Пробіл — **фіксовані webview-клавіші** не перевіряються. Сьогодні користувач може
призначити OS-хоткей на `Ctrl+K` і мовчки затінити командну палітру (Tier-1
реєструється глобально через ОС і перехоплює клавішу до того, як вона дійде до
webview-слухача Tier-2). Жодного попередження немає.

## Узгоджені рішення

1. **Поведінка при колізії з webview-клавішею:** *жорсткий блок*, ідентичний
   дублікату — комбо відхиляється, не зберігається, показується `role="alert"`.
   (Не м'яке попередження-з-дозволом: KeyRecorder уже вміє блок/не-блок, окремий
   «accepted-with-warning» стан не потрібен.)
2. **Зарезервований набір = усі хардкодні webview-комбо** (Tier 2 реалізовані +
   заплановані, **і** Tier 2′ названі клавіші). Найвірніше до формулювання
   «фіксовані webview-клавіші»; `F6` тощо **записувані** через KeyRecorder, тож
   реально колізуються; futureproof проти ⬜ запланованих комбо.
3. **Повідомлення називає дію** (за зразком `settings_hotkey_duplicate`):
   «зарезервовано для: Командна палітра». Інформативніше для NVDA й узгоджено з
   наявним текстом дублікату.
4. **Джерело істини — окремий lib-модуль** `reservedShortcuts.ts` (за зразком
   `shortcutGuard.ts`), а не inline-список у компоненті й **не** рефакторинг
   App.tsx-слухача (останнє — більший blast radius, перетин із KB-11; дрейф
   списку малоймовірний, бо реєстр уже фіксує ці комбо).

## §1 Архітектура

Новий чистий модуль + композиція у наявному валідаторі. **KeyRecorder не
змінюється взагалі** — він уже рендерить будь-який рядок, повернутий `onValidate`,
як блокуючий `role="alert"` і пропускає `onChange`. Саме тому «жорсткий блок» —
дешеве рішення.

```
KeyRecorder (без змін)
  → onValidate(combo)  ← HotkeysTab.validateHotkey(currentKey)
       1. findReservedConflict(combo)  ← reservedShortcuts.ts   // НОВЕ
            conflict → m.settings_hotkey_reserved({action})      → блок
       2. наявний цикл дублікатів Tier-1                          → блок
       3. інакше null                                            → onChange/save
```

## §2 Модуль `src/lib/reservedShortcuts.ts`

```ts
// Один типізований список усіх хардкодних webview-комбо у тому ж форматі
// акселератор-рядка, що його продукує codeToToken ("Ctrl+K", "Alt+1", "F6").
// label() повертає i18n-назву дії для повідомлення. Doc-comment прив'язує кожен
// запис до keyboard-shortcuts.md (Tier 2 / 2′), щоб список не дрейфував від реєстру.
export const RESERVED_WEBVIEW_COMBOS: ReadonlyArray<{
  combo: string;
  label: () => string;
}> = [ /* див. таблицю нижче */ ];

// Повертає label() конфліктного запису або null. Чиста → тривіально тестовна.
export function findReservedConflict(combo: string): (() => string) | null;
```

**Записи** (порядок — як у реєстрі; останній стовпець — звідки label):

| Комбо | Tier | Дія (label) | Джерело label |
|---|---|---|---|
| `Ctrl+K` | 2 | командна палітра | `command_palette_label` (реюз) |
| `Ctrl+,` | 2 | налаштування | `settings_title` (реюз)¹ |
| `Alt+1` | 2 | секція Streams | `streams_section` (реюз) |
| `Alt+2` | 2 | секція Browser | `browser_section` (реюз) |
| `Alt+3` | 2 | секція Wishlist | `wishlist_section` (реюз) |
| `Alt+4` | 2 | секція Schedule | `schedule_section` (реюз) |
| `Alt+5` | 2 | секція Songs | `songs_section` (реюз) |
| `Alt+0` | 2 | секція Profiles | `profiles_section`² |
| `Ctrl+N` | 2 | Add Stream | `add_stream` (реюз) |
| `F6` | 2′ | навігація по зонах | новий ключ |
| `Shift+F6` | 2′ | навігація по зонах (назад) | той самий ключ, що `F6` |
| `Shift+F10` | 2′ | меню рядка | новий ключ |

¹ `Ctrl+,` наразі **нереєстровний** KeyRecorder-ом (`codeToToken("Comma")` →
  `null`), як і `ContextMenu`. Лишаємо в списку як документацію наміру й
  belt-and-suspenders на випадок, якщо `codeToToken` розшириться; пояснити
  коментарем. `ContextMenu` у список **не** додаємо — він теж нереєстровний і
  дублює `Shift+F10`.

² Якщо `profiles_section` ще немає в `en.json`/`uk.json` — додати (узгоджено з
  іншими `*_section`).

**Точність формату:** список має точно збігатися з виходом `codeToToken`
(порядок модифікаторів `Ctrl→Shift→Alt→Super`, токени `Up`/`Down`/`Left`/`Right`,
без пробілів). Перевіряється тестом.

## §3 Валідатор `HotkeysTab.validateHotkey`

Композиція двох перевірок; **зарезервоване має пріоритет** (фундаментальніше
обмеження — користувач не може його обійти переназначенням):

```ts
return (combo: string): string | null => {
  if (!combo) return null;
  const reserved = findReservedConflict(combo);
  if (reserved) return m.settings_hotkey_reserved({ action: reserved() });
  // …наявний цикл дублікатів Tier-1 — без змін…
};
```

## §4 i18n

Додати в `en.json` + `uk.json`:

- **Шаблон (новий):** `settings_hotkey_reserved` —
  EN `"This combination is reserved for: {action}"`,
  UK `"Цю комбінацію зарезервовано для: {action}"`.
- **Реюз наявних** (звірено в `en.json`): `command_palette_label`, `settings_title`,
  `add_stream`, `streams_section`, `browser_section`, `wishlist_section`,
  `schedule_section`, `songs_section`.
- **Нові label-ключі** (відсутні в `en.json`): `profiles_section`, навігація по
  зонах, меню рядка. Разом із шаблоном — **4 нові ключі ×2 мови**.

Після додавання — регенерувати paraglide через vite-плагін (memory
`typecheck-paraglide-gotchas`).

## §5 Тестування й верифікація

- **`reservedShortcuts.test.ts`** (за зразком `shortcutGuard.test.ts`):
  - кожен зарезервований комбо → ненульовий label, і label() дає очікуваний текст;
  - вільний комбо (напр. `Ctrl+Shift+J`) → `null`;
  - точність формату/регістру (`ctrl+k` ≠ `Ctrl+K`; список збігається з виходом
    `codeToToken`).
- **Інтеграційний тест** (KeyRecorder + HotkeysTab або розширення
  `KeyRecorder.test.tsx`): запис `Ctrl+K` показує `role="alert"`, `onChange`
  **не** викликається, нічого не зберігається. Дзеркало наявного тесту дублікатів.
- **Гейти:** `pnpm test` + `pnpm vite:build` (tsc має ~51 наявних paraglide-помилок
  — не показник; memory `typecheck-paraglide-gotchas`).

## §6 Docs

- Відмітити **KB-09 `[x]`** у [keyboard-shortcuts-backlog.md](../../keyboard-shortcuts-backlog.md)
  з нотаткою «Зроблено (2026-06-07)».
- Рядок у [keyboard-shortcuts.md](../../keyboard-shortcuts.md): зарезервований
  список у `reservedShortcuts.ts` валідовується в Settings → Hotkeys, тож реєстр і
  гард поділяють намір (щоб майбутні правки реєстру не забували оновити список).

## Поза скоупом

- **KB-10** (reset-to-defaults), **KB-11** (асиметрія конфігуровності Tier-1 vs
  Tier-2 — і пов'язаний рефакторинг App.tsx у таблицю), **KB-12** (нові глобальні
  шорткати).
- Рефакторинг App.tsx-слухача Tier-2, щоб він керувався тим самим списком
  (свідомо відкладено: більший blast radius, перетин із KB-11).
- М'яке попередження-з-дозволом (відхилено на користь жорсткого блоку).
- Колізії між самими webview-клавішами (їх фіксує реєстр на етапі дизайну, не
  рантайм).
