---
slug: open-song-with-default-app
title: "Відкрити файл у асоційованій програмі (Open With)"
priority: P1
type: planned
status: done
effort: M
kind: feature
target: 0.1.0
updated: 2026-08-06
completed: 2026-08-06
a11y: true
depends_on: []
blocks: []
touches: [src-tauri/src/commands/songs_commands.rs, src/components/songs/SongContextMenu.tsx, src/components/songs/SongsList.tsx, src/components/songs/SongItem.tsx]
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
---

# Відкрити файл у асоційованій програмі (Open With)

> **Контекст:** рішення фіналізовано 2026-07-19 — готовий до реалізації. Технічний підхід (`ShellExecuteW`), UI-розміщення і клавіатурна семантика вже узгоджені.
>
> **Виконано 2026-08-06** на гілці `feature/open-song-with-default-app`: усі гейти
> зелені, NVDA-прогін пройдено без зауважень (чекліст
> `docs/testing/nvda-open-song-with-default-app.md` видалено при прийманні, як велить процес).

## Опис

У менеджері записаних файлів (`SongsPanel`) є пункт контекстного меню "Відкрити у провіднику" — показує файл у Windows Explorer з виділенням (`/select`). Але немає можливості **відкрити сам файл** у плеєрі за замовчуванням (Windows Media Player, VLC, тощо).

**Use case:** користувач хоче прослухати файл у своєму звичному плеєрі (не у Tapir), або перевірити теги у зовнішньому редакторі. Особливо релевантно сліпим юзерам — NVDA має стабільні скрипти під WMP/VLC, тоді як інтерфейс Tapir-плеєра іноді поступається.

**Поточний стан:** `open_song_in_explorer` відкриває папку з файлом. Відкриття самого файлу — відсутнє.

## Технічна реалізація

**Варіант: Win32 `ShellExecuteW`** (прийнято).

Використовуємо `windows` crate v0.62 (вже у депах проєкту) з `windows::Win32::UI::Shell::ShellExecuteW`. Feature `Win32_UI_Shell` **вже увімкнена** в `Cargo.toml` — додаткових флагів не потрібно. Це нативна семантика "Open" — те саме, що dbl-click у Explorer — без ризиків парсингу аргументів, які б виникли з `cmd /c start`.

```rust
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::core::PCWSTR;

// Verb = "open"; шлях → wide-string; виклик повертає HINSTANCE.
// Код > 32 = успіх, інакше — помилка (немає асоціації / файл зник).
```

Приклад сигнатури команди (поруч із `open_song_in_explorer` у `commands/songs_commands.rs`):

```rust
#[tauri::command]
pub async fn open_song_in_app(path: String) -> Result<(), String> {
    // spawn_blocking(|| {
    //     CoInitializeEx(COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    //     ShellExecuteW(nullptr, "open", wide(path), null, null, SW_SHOWNORMAL)
    // })
    // HINSTANCE > 32 → Ok(()), інакше → Err через map_shell_error(code)
}
```

**Потік виконання:** сам виклик — усередині `tokio::task::spawn_blocking`, як усі інші Win32-виклики в `songs_commands.rs` (5 прецедентів: scan, rename, recycle-bin тощо). Плюс MS-документація ShellExecuteW рекомендує STA-ініціалізацію COM перед викликом (`CoInitializeEx(COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)`) — async-команди Tauri працюють на потоках tokio без неї; на blocking-потоці ініціалізація дешева і безпечна. Для `CoInitializeEx` треба **додати** feature `Win32_System_Com` у `Cargo.toml` (перевірено 2026-07-19: її там немає; є лише `Win32_System_Power` і `Win32_System_WinRT`).

**Мапінг кодів помилок** — винести в чисту функцію `map_shell_error(code: isize) -> ...` (окремо від WinAPI-виклику), щоб її можна було юніт-тестити без побічних ефектів.

**Чому не інші варіанти:**

- `cmd /c start` — повторює клас помилок екранування, що вже коштував `raw_arg` у `open_song_in_explorer`.
- `tauri-plugin-opener` — оверкіл для одного виклику в Windows-only застосунку (за PRD), +dep +init. Перевірено: плагіна **немає** у `Cargo.toml` (попереднє твердження в беклозі було хибним).

**Безпека:** path — з `Song.path` (довірений, вже збережений файл). Не з user input напряму.

## UI

У `SongContextMenu` додати пункт **«Відкрити у програмі»** **під `play`, над `explorer`** — логічна група "play/open" поруч, не конфліктує з rename/tags/delete, зручно для послідовного перегляду NVDA.

**Мультивиділення:** пункт діє **лише на рядок, з якого відкрито меню** — виділення ігнорується (як `play`/`explorer`/`rename` зараз; на відміну від `delete`, який плюралізується і працює по виділенню). Без плюралізації лейбла. Це свідоме рішення: «відкрити всі виділені» (модель Explorer) дало б N вікон зовнішнього плеєра з одного натискання — легко зробити випадково, особливо з NVDA.

Додати `"open"` до типу `SongAction`:

```ts
export type SongAction = "play" | "open" | "explorer" | "rename" | "tags" | "delete";
```

## Клавіатура

Шорткати диспетчеризуються в `SongsList.tsx` через колбек `onAction` інфраструктури `CompositeList` (4-й параметр `modifiers`, який зараз ігнорується — паралель до `StationList.tsx:131`). `SongItem` лишиться презентаційним: він лише прокидає `keyshortcuts` у `CompositeRow` (проп існує, див. `StationItem.tsx:125`).

Без опції налаштувань "Enter → внутр/зовн" (зайва конфігурабельність без запиту).

| Комбінація | Дія | Примітка |
|------------|-----|----------|
| `Enter` / `Space` | Внутрішній плеєр (`play`) | Поточна поведінка, без змін |
| `Alt+Enter` | Відкрити у зовнішній програмі (`open`) | Нова команда `open_song_in_app` |
| `Ctrl+Enter` | Відкрити у провіднику (`explorer`) | **Новий шорткат** — досі explorer був лише через меню |

**Дія на фокусованому рядку, не на виділенні.** Shift/Ctrl+Enter оперують `itemId` фокусованого рядка, тоді як `Delete` діє на множинне виділення — це різні механізми, не плутати.

**Модифікатори лише на Enter (`primary`).** `Space` приходить у `onAction` як `toggle` теж із модифікаторами — їх **ігноруємо**: Space завжди = play, `Alt+Space` не дублює `Alt+Enter` (збігається з aria-анонсом і зі `StationList`, який Space не обробляє взагалі). `Ctrl+Space` до `onAction` не долітає — його перехоплює selection-toggle на рівні `useCompositeList` (`resolveKeyAction`).

**aria-keyshortcuts:** на `SongItem` (через `CompositeRow`) оголосити `aria-keyshortcuts="Alt+Enter Control+Enter"` (дзеркало `StationItem.tsx:125`), щоб NVDA виголошував доступні комбінації.

**Обґрунтування семантики модифікаторів** (оновлено):
- `Alt+Enter` — «відкрити інакше»: Alt не перетинається з Shift-конвенцією Streams/Station browser, залишає Shift вільним для майбутньої уніфікації, і є стандартним системним патерном Windows (Alt+Enter = властивості/деталі в Explorer).
- `Ctrl+Enter` у Streams = record; Songs аналога запису не мають, тож Ctrl вільний і віддається допоміжній навігаційній дії — «показати файл у провіднику».
- Shift+Enter для Songs навмисно не використовується: у Streams `Shift+Enter` = play/toggle, у Station browser `Shift+Enter` = preview — різні семантики, плутанина.

## Обробка помилок

`ShellExecuteW` повертає `HINSTANCE`: значення > 32 = успіх, ≤ 32 = код помилки. Мапінг — у чистій функції `map_shell_error` (див. вище). При збої — повертаємо `Err` з описом → фронт показує **toast** з локалізованим повідомленням. Розрізняємо принаймні:
- `SE_ERR_FNF` / `ERROR_FILE_NOT_FOUND` (файл зник) — "файл не знайдено"
- `SE_ERR_NOASSOC` (немає асоційованої програми) — "немає асоційованої програми для цього типу файлу"
- інші коди — узагальнене "не вдалося відкрити файл"

Не обирали:
- "Мовчки ігнорувати" — фруструє, особливо з NVDA (немає візуального фідбеку).
- Діалог Windows "Open With" — не покриває зниклий файл.

**Конфлікт із відтворенням:** відсутній. Зовнішнє відкриття не чіпає внутрішній плеєр Tapir (на відміну від `rename_song`, що блокується під час відтворення) — додаткових перевірок не потрібно.

## i18n

Нові ключі у `src/i18n/messages/{uk,en}.json`:

| Ключ | uk | en |
|------|----|----|
| `songs_action_open` | Відкрити у програмі | Open in app |
| `songs_open_failed` | Не вдалося відкрити файл | Failed to open file |
| `songs_open_not_found` | Файл не знайдено | File not found |
| `songs_open_no_assoc` | Немає асоційованої програми для цього типу файлу | No associated app for this file type |

## Критерії готовності

- [x] Команда `open_song_in_app` через `ShellExecuteW` у `commands/songs_commands.rs` (`spawn_blocking` + `CoInitializeEx` STA)
- [x] Feature `Win32_System_Com` додано в `Cargo.toml`
- [x] Реєстрація команди в `lib.rs` (поруч із `open_song_in_explorer`)
- [x] Пункт "Відкрити у програмі" у `SongContextMenu` (під `play`, над `explorer`); діє на один рядок, виділення ігнорується
- [x] `"open"` додано до типу `SongAction`
- [x] Клік → файл відкривається у плеєрі за замовчуванням
- [x] `SongsList.onAction` опрацьовує 4-й параметр `modifiers` лише для `primary` (паралель до `StationList.tsx:131`); Space (`toggle`) ігнорує модифікатори
- [x] Шорткати: `Enter`=play, `Alt+Enter`=open, `Ctrl+Enter`=explorer (на фокусованому рядку)
- [x] `aria-keyshortcuts="Alt+Enter Control+Enter"` на `SongItem` (через `CompositeRow`)
- [x] При помилці → toast з локалізованим повідомленням (not found / no assoc / generic)
- [x] NVDA: пункт меню та шорткати озвучуються коректно; **успішне відкриття зовнішнього плеєра — мануальний NVDA-прогін** (автотесту на реальний запуск немає свідомо) — прогін 2026-08-06, усі 8 сценаріїв пройдено, зауважень немає
- [x] i18n: ключі `songs_action_open`, `songs_open_failed`, `songs_open_not_found`, `songs_open_no_assoc` (uk/en)
- [x] Тест `SongsList.test.tsx`: dispatch `Alt+Enter`/`Ctrl+Enter` + `Alt+Space` не тригерить open (паралель до `StreamList.test.tsx:179-220`)
- [x] Тест `SongsList.test.tsx`: aria-keyshortcuts на рядку (паралель до `StationList.test.tsx:106-109`)
- [x] Юніт-тест Rust: `map_shell_error` (2→not_found, 31→no_assoc, інше→generic); реальний запуск НЕ тестуємо — побічний ефект

**Понад план** (виявлено при реалізації, зафіксовано тут, щоб не загубилось):

- [x] `ActionModifiers` отримав поле `alt` (`useCompositeList.ts`) — його там не було;
      `CompositeRow.onActivate` теж прокидає `altKey`, щоб миша дзеркалила клавіатуру.
      Це закриває однойменний пункт у [p1-open-stream-with-default-app](../p1-open-stream-with-default-app.md).
- [x] `Alt+Enter` зареєстровано в `src/lib/shortcuts.ts` (group `list`, `reserved: true`):
      інакше комбінацію можна було б призначити глобальним хоткеєм і перекрити нею дію
      рядка. Разом з тим — новий ключ `settings_hotkey_action_row_open_external` і
      уточнений лейбл `..._row_record` (Ctrl+Enter тепер має сенс і на Songs).
- [x] Мапінг кодів помилок винесено у `src/lib/shellOpenError.ts` (чиста функція + тест),
      бо той самий контракт знадобиться запису для потоків.
- [x] `docs/keyboard-shortcuts.md` — рядок `Alt+Enter`, уточнений `Ctrl+Enter` і абзац
      про те, що модифікатори діють лише на `Enter`.

## Документи

- Код: `src-tauri/src/commands/songs_commands.rs` — `open_song_in_explorer` (зразок, рядок 43); `spawn_blocking`-прецеденти там само
- Код: `src/components/songs/SongContextMenu.tsx`, `src/components/songs/SongsList.tsx` (onAction), `src/components/songs/SongItem.tsx` (прокинути `keyshortcuts`)
- Прецедент модифікаторів: `src/components/browser/StationList.tsx:131`; aria-keyshortcuts: `src/components/browser/StationItem.tsx:125`
- Інфраструктура: `src/hooks/useCompositeList.ts` — `ActionModifiers`, `resolveKeyAction` (Ctrl+Space = selection)
- Реєстр команд: `src-tauri/src/lib.rs` (рядок 309)
- ShellExecuteW: https://learn.microsoft.com/windows/win32/api/shellapi/nf-shellapi-shellexecutew (розділ Remarks — вимога COM STA)
