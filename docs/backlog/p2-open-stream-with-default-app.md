---
slug: open-stream-with-default-app
title: "Відкрити потік у асоційованій програмі (Open With)"
priority: P2
type: planned
status: ready
effort: S
kind: feature
target: 0.1.0
updated: 2026-07-22
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

**Повторне використання коду:** якщо `open-song-with-default-app` реалізована раніше — виділити спільний хелпер `shell_open(target: &str)` у `commands/` або `lib/` і викликати з обох команд. Якщо ні — реалізувати inline, аналогічно до пісень.

**Feature `Win32_System_Com`** (`CoInitializeEx`): якщо `open-song-with-default-app` вже реалізована, feature вже є у `Cargo.toml`. Якщо ні — треба додати (як описано в тому записі).

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

`Alt+Enter` вільний і узгоджується з аналогічним шорткатом у Songs (`open-song-with-default-app`).

**Дія на фокусованому рядку, не на виділенні** — аналогічно до Songs.

**Обробка `alt` в `ActionModifiers`:** якщо `ActionModifiers` ще не має поля `alt` — додати його поруч з `shift`/`ctrl`. `resolveKeyAction` у `useCompositeList.ts` — перевірити, що `Alt+Enter` не перехоплюється раніше.

**aria-keyshortcuts:** якщо `CompositeRow`/`StreamItem` підтримують `keyshortcuts` prop — оголосити `aria-keyshortcuts="Alt+Enter"` (аналог `StationItem.tsx:125`).

## Обробка помилок

Ті самі випадки, що у `open_song_in_app`:
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

- [ ] Команда `open_stream_in_app` у `commands/stream_commands.rs` (`spawn_blocking` + `ShellExecuteW`)
- [ ] Feature `Win32_System_Com` у `Cargo.toml` (якщо ще не додана `open-song-with-default-app`)
- [ ] Реєстрація команди в `lib.rs`
- [ ] Пункт «Відкрити у програмі» у `StreamContextMenu` (після record, перед edit); діє на один рядок
- [ ] `Alt+Enter` у `StreamList.onAction` → `open_stream_in_app` (через `mods?.alt`)
- [ ] `ActionModifiers` має поле `alt`, `resolveKeyAction` передає його (якщо ще немає)
- [ ] При помилці → toast з локалізованим повідомленням
- [ ] NVDA: пункт меню та шорткат озвучуються коректно
- [ ] i18n: ключі `stream_action_open`, `stream_open_failed`, `stream_open_no_assoc` (uk/en)
- [ ] Тест `StreamList.test.tsx`: `Alt+Enter` на рядку → виклик `open_stream_in_app`; `Alt+Space` не тригерить open
- [ ] Юніт-тест Rust: `map_shell_error` (якщо не покрито пісенною фічею — реалізувати спільно)

## Документи

- Зразок реалізації: [p2-open-song-with-default-app.md](p2-open-song-with-default-app.md)
- Код: `src-tauri/src/commands/stream_commands.rs`, `src/components/streams/StreamContextMenu.tsx`, `StreamList.tsx`
- Модифікатори: `src/hooks/useCompositeList.ts` — `ActionModifiers`, `resolveKeyAction`
- ShellExecuteW: https://learn.microsoft.com/windows/win32/api/shellapi/nf-shellapi-shellexecutew
