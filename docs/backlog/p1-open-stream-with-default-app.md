---
slug: open-stream-with-default-app
title: "Відкрити потік у асоційованій програмі (Open With)"
priority: P1
type: planned
status: ready
effort: S
kind: feature
target: 0.1.0
updated: 2026-08-06
a11y: true
depends_on: []
blocks: []
touches:
  - src-tauri/src/commands/stream_commands.rs
  - src-tauri/src/lib.rs
  - src/components/streams/StreamContextMenu.tsx
  - src/components/streams/StreamList.tsx
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
depends_on_external:
  - open-song-with-default-app (аналогічна фіча для файлів — зразок реалізації)
---

# Відкрити потік у асоційованій програмі (Open With)

> **Контекст:** Аналог `open-song-with-default-app.md`, але для потоків. Готовий до реалізації; технічний підхід — той самий `ShellExecuteW`.
>
> **Оновлено 2026-08-06** — `open-song-with-default-app` [реалізовано і прийнято](done/p1-open-song-with-default-app.md).
> Три речі з неї вже готові й **не входять** у роботу цього запису — див. позначки
> нижче в «Технічна реалізація» / «Клавіатура» / «Критерії готовності»:
> `ActionModifiers.alt`, реєстрація `Alt+Enter` у `shortcuts.ts`, і паттерн
> `map_shell_error`/`shell_open` (наразі приватні в `songs_commands.rs` — цей
> запис має або **зробити їх спільними**, або продублювати на 3 рядки логіки).
> Фронтендовий `shellOpenErrorMessage` (`src/lib/shellOpenError.ts`) **не можна**
> перевикористати як є — він жорстко зашитий на Songs-формулювання («файл»);
> для потоків потрібні або свої повідомлення, або узагальнення тієї функції.

## Опис

У менеджері потоків (`StreamsPanel`) є play/record, але немає способу відкрити URL потоку у зовнішньому медіаплеєрі (VLC, WMP тощо) безпосередньо з клавіатури або меню.

**Use case:** сліпий користувач хоче прослухати потік у VLC/WMP, де в NVDA є стабільні скрипти, або просто перевірити URL у браузері. Особливо актуально для `.m3u`/`.pls`-посилань, що Windows відкриває у налаштованому медіаплеєрі автоматично.

**Поточний стан:** `copy_url` дозволяє скопіювати URL, але вимагає ручного відкриття. Пряме відкриття відсутнє.

## Технічна реалізація

Той самий підхід, що у `open_song_in_app`:

```rust
#[tauri::command]
pub async fn open_stream_in_app(
    stream_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let url = {
        let profile = state.active_profile.read().await;
        profile.streams.iter()
            .find(|s| s.id == stream_id)
            .map(|s| s.url.clone())
            .ok_or_else(|| format!("Stream {stream_id} not found"))?
    };
    tokio::task::spawn_blocking(move || {
        // CoInitializeEx + ShellExecuteW("open", &url) — той самий патерн
        // що у open_song_in_app
    })
    .await
    .map_err(|e| e.to_string())?
}
```

**Повторне використання коду:** `open-song-with-default-app` вже реалізована. `shell_open(path: &str)` і `map_shell_error(code: isize) -> &'static str` живуть у `src-tauri/src/commands/songs_commands.rs` (рядки ~58-90), обидві приватні (`fn`, не `pub`) і `shell_open` прив'язана до назви параметра `path` — сигнатура вже generic (`&str`), тож підійде і для URL без змін тіла. Винести обидві в спільний модуль (наприклад `commands/shell_open.rs`) і викликати звідти з `open_song_in_app` та нового `open_stream_in_app` — не дублювати STA-init/error-match вдруге.

**Feature `Win32_System_Com`** (`CoInitializeEx`): вже увімкнена в `Cargo.toml` (додана `open-song-with-default-app`) — нічого робити не треба.

**Безпека:** URL береться зі стану профілю (`state.active_profile`), не з user input безпосередньо.

## UI

У `StreamContextMenu` додати пункт **«Відкрити у програмі»** — після `record`, перед `edit`:

```
▶ Відтворити / ■ Зупинити відтворення
⏺ Записати / ⏹ Зупинити запис
→ Відкрити у програмі        ← новий пункт
✎ Редагувати
…
```

Пункт діє **лише на рядок, з якого відкрито меню** — виділення ігнорується (як play/record/edit).

## Клавіатура

Шорткати диспетчеризуються в `StreamList.tsx` через `onAction` + `ActionModifiers`.

**Наявні комбінації для стрімів:**

| Комбінація | Дія |
|------------|-----|
| `Enter` / `Space` | Play або Record (залежить від `doubleClickAction`) |
| `Shift+Enter` | Завжди Play |
| `Ctrl+Enter` | Завжди Record |
| `F2` | Edit (rename) |
| `Alt+Enter` | **Відкрити у програмі** ← новий |

`Alt+Enter` вільний і узгоджується з аналогічним шорткатом у Songs (`open-song-with-default-app`). Уже **зареєстрований** у `src/lib/shortcuts.ts` як `reserved: true` (id `row-open-external`, group `list`) — цей запис нічого туди не додає, лише підключає обробку в `StreamList.onAction`.

**Дія на фокусованому рядку, не на виділенні** — аналогічно до Songs.

**`alt` в `ActionModifiers` — вже є.** `ActionModifiers` (`src/hooks/useCompositeList.ts`) містить поле `alt` від `open-song-with-default-app`, `resolveKeyAction` уже пропускає `Alt+Enter` до `onAction` (перевірено тестом `Alt+Enter fires primary with the alt modifier set` у `useCompositeList.test.tsx`) і `CompositeRow.onActivate` прокидає `altKey` для миші. Нічого з цього переробляти не треба — лише читати `mods.alt` у `StreamList.tsx` за зразком `SongsList.tsx`.

**aria-keyshortcuts:** `CompositeRow`/`StreamItem` уже підтримують `keyshortcuts` prop (`StationItem.tsx:135` — наявний приклад). Додати `aria-keyshortcuts="Alt+Enter"` на `StreamItem`, дописавши до вже наявного `Shift+Enter`/`Ctrl+Enter`, якщо вони там є (перевірити перед правкою).

## Обробка помилок

Ті самі коди, що у `open_song_in_app` (`not_found` / `no_assoc` / `generic`) —
бекенд-мапінг спільний (див. «Повторне використання коду»). **Фронтенд —
окремо:** `src/lib/shellOpenError.ts` (`shellOpenErrorMessage`) жорстко
повертає Songs-тексти (`m.songs_open_not_found()` тощо, «файл») — для потоків
пряме перевикористання дасть неправильне слово в тості («файл» замість URL).
Два варіанти: (а) додати `stream_open_*` ключі й окрему функцію-мапер поруч,
(б) узагальнити `shellOpenErrorMessage` — параметризувати повідомлення й
переписати виклик у `SongsPanel.tsx`. Записом це не вирішено — обери на
місці, коли братимешся до реалізації.

- `SE_ERR_NOASSOC` → "Немає асоційованої програми для цього типу URL"
- Інші коди → "Не вдалося відкрити URL"

При збої — toast з локалізованим повідомленням.

**Примітка щодо `http://` URLs:** для звичайних потоків Windows відкриє URL у браузері за замовчуванням — це очікувана поведінка, не помилка. Для `.m3u`/`.pls`-посилань відкриється асоційований медіаплеєр.

## i18n

Нові ключі (uk/en) — якщо ключ `songs_action_open` / `songs_open_failed` вже є, можна перевикористати або додати stream-specific варіанти за потреби:

| Ключ | uk | en |
|------|----|----|
| `stream_action_open` | Відкрити у програмі | Open in app |
| `stream_open_failed` | Не вдалося відкрити URL | Failed to open URL |
| `stream_open_no_assoc` | Немає асоційованої програми для цього типу URL | No associated app for this URL type |

## Критерії готовності

Готове раніше (`open-song-with-default-app`), **не робити повторно**:

- [x] `ActionModifiers.alt` існує, `resolveKeyAction` передає його на `Alt+Enter`
- [x] Feature `Win32_System_Com` у `Cargo.toml`
- [x] `Alt+Enter` зареєстровано `reserved` у `src/lib/shortcuts.ts` (F1-довідка + захист від перепризначення)
- [x] Юніт-тест Rust на мапінг кодів (`map_shell_error`, у `songs_commands.rs`) — розширити на новий модуль при виносі, не писати з нуля

Робота цього запису:

- [ ] Винести `shell_open`/`map_shell_error` зі `songs_commands.rs` у спільний модуль (напр. `commands/shell_open.rs`); `open_song_in_app` переключити на нього, щоб не лишалось двох копій
- [ ] Команда `open_stream_in_app` у `commands/stream_commands.rs` (`spawn_blocking`, викликає спільний `shell_open`)
- [ ] Реєстрація команди в `lib.rs`
- [ ] Пункт «Відкрити у програмі» у `StreamContextMenu` (після record, перед edit); діє на один рядок
- [ ] `Alt+Enter` у `StreamList.onAction` → `open_stream_in_app` (через `mods.alt`, за зразком `SongsList.tsx`)
- [ ] `aria-keyshortcuts` на `StreamItem` доповнено `Alt+Enter`
- [ ] Стрім-специфічний мапер помилки код→текст (див. «Обробка помилок» — рішення (а)/(б) ухвалити тут)
- [ ] При помилці → toast з локалізованим повідомленням
- [ ] NVDA: пункт меню та шорткат озвучуються коректно
- [ ] i18n: ключі `stream_action_open`, `stream_open_failed`, `stream_open_no_assoc` (uk/en)
- [ ] Тест `StreamList.test.tsx`: `Alt+Enter` на рядку → виклик `open_stream_in_app`; `Alt+Space` не тригерить open (паралель до `SongsList.test.tsx`)

## Документи

- Зразок реалізації: [p1-open-song-with-default-app.md](done/p1-open-song-with-default-app.md)
- Спільна інфраструктура, уже готова: `src-tauri/src/commands/songs_commands.rs` (`shell_open`, `map_shell_error` — приватні, винести); `src/hooks/useCompositeList.ts` (`ActionModifiers.alt`); `src/lib/shortcuts.ts` (`row-open-external`, вже reserved)
- Фронтендовий мапер помилки — **не спільний, лишень зразок**: `src/lib/shellOpenError.ts`
- Код цього запису: `src-tauri/src/commands/stream_commands.rs`, `src/components/streams/StreamContextMenu.tsx`, `StreamList.tsx`, `StreamItem.tsx`
- ShellExecuteW: https://learn.microsoft.com/windows/win32/api/shellapi/nf-shellapi-shellexecutew
