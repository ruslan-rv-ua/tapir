---
slug: open-stream-with-default-app
title: "Відкрити потік у медіаплеєрі (тимчасовий .m3u8)"
priority: P1
type: planned
status: ready
effort: M
kind: feature
target: 0.1.0
updated: 2026-08-07
a11y: true
depends_on: []
blocks: []
touches:
  - src-tauri/src/commands/shell_open.rs
  - src-tauri/src/commands/songs_commands.rs
  - src-tauri/src/commands/stream_commands.rs
  - src-tauri/src/commands/mod.rs
  - src-tauri/src/lib.rs
  - src-tauri/src/portable.rs
  - src/lib/tauri.ts
  - src/lib/shellOpenError.ts
  - src/components/streams/StreamContextMenu.tsx
  - src/components/streams/StreamList.tsx
  - src/components/streams/StreamList.test.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
depends_on_external:
  - open-song-with-default-app (спільний `shell_open`/`map_shell_error` — виносяться цим записом)
---

# Відкрити потік у медіаплеєрі (тимчасовий .m3u8)

> **Оновлено 2026-08-07 після розбору.** Попередня редакція описувала «віддати URL
> потоку шелу через `ShellExecuteW`, як у Songs» — і це **не працювало б** для
> заявленого use case. Причина в «Чому не просто URL» нижче. Підхід замінено:
> пишемо тимчасовий `.m3u8` і віддаємо шелу **його**. Разом із цим прибрано пункт
> про `aria-keyshortcuts` (суперечив свідомому рішенню `b06a9c1`), уточнено набір
> кодів помилки, і `effort` піднято S → M.
>
> Готове раніше (`open-song-with-default-app`) і **не входить** у роботу цього
> запису: `ActionModifiers.alt`, реєстрація `Alt+Enter` як `reserved` у
> `shortcuts.ts`, feature `Win32_System_Com` у `Cargo.toml`.

## Опис

У менеджері потоків (`StreamsPanel`) є play/record, але немає способу відкрити
потік у зовнішньому медіаплеєрі (VLC, WMP, foobar) з клавіатури або меню.

**Use case:** сліпий користувач хоче слухати станцію у VLC/WMP, де в NVDA є
стабільні напрацьовані скрипти, замість вбудованого плеєра Tapir.

**Поточний стан:** `copy_url` дозволяє скопіювати URL, але вимагає ручного
відкриття плеєра і вставки. Прямого відкриття немає.

## Чому не просто URL

Первісний план — `ShellExecuteW("open", stream.url)` — відкриє **браузер за
замовчуванням**, а не медіаплеєр. Припущення попередньої редакції, ніби в профілі
лежать `.m3u`/`.pls`-посилання, які Windows віддасть плеєру, не відповідає коду:

- `add_stream` пропускає URL через `playlist::resolve_playlist_url`
  (`src-tauri/src/stream/playlist.rs`) — `.pls`/`.m3u`/`.m3u8` **резолвиться у
  внутрішній аудіо-URL ще на додаванні**, і в профіль лягає вже сирий URL;
- імпорт плейлиста йде через `parse_playlist_all`, який теж кладе у профіль
  внутрішні URL записів, а не сам плейлист.

Отже `stream.url` — це практично завжди `http(s)://…/live`, для якого шелл знає
лише одну асоціацію: браузер. Оскільки `copy_url` уже покриває «відкрити URL
вручну», фіча в тій редакції не давала майже нічого.

**Рішення:** сформувати одноелементний `.m3u8` з URL потоку і віддати шелу
**файл**. Тоді спрацьовує асоціація для плейлистів — тобто реально VLC/WMP, — а
`SE_ERR_NOASSOC` стає осмисленою помилкою («медіаплеєр не встановлений»).

## Технічна реалізація

### 1. Спільний модуль `commands/shell_open.rs`

`shell_open(path: &str)` і `map_shell_error(code: isize)` зараз приватні в
`songs_commands.rs` (рядки 56–116) разом із константами кодів і чотирма
юніт-тестами на мапінг. Винести все це в новий `commands/shell_open.rs`,
`pub(crate)`, і переключити `open_song_in_app` на нього — щоб не лишилось двох
копій STA-ініціалізації. Тіло `shell_open` уже generic (`&str`), змін не потребує.
Виклик `songs_commands` → `stream_commands` неприйнятний як напрямок залежності,
тому саме окремий модуль, а не `pub(crate)` на місці.

Константи кодів після виносу:

```rust
pub(crate) const SHELL_ERR_NOT_FOUND: &str = "not_found";     // лише Songs
pub(crate) const SHELL_ERR_NO_ASSOC: &str = "no_assoc";
pub(crate) const SHELL_ERR_WRITE_FAILED: &str = "write_failed"; // лише Streams
pub(crate) const SHELL_ERR_GENERIC: &str = "generic";
```

### 2. Тимчасовий файл

Tapir портативний — усе живе під `base_dir()/data/` (`portable.rs`), і писати в
`%TEMP%` чужої машини не можна: типовий сценарій цієї програми — флешка на
робочому комп'ютері. Додати `portable::tmp_dir()` → `data/tmp/`.

```rust
/// `data/tmp/<санітизоване ім'я>.m3u8`. Ім'я стабільне на потік і файл
/// перезаписується перед кожним відкриттям — тому нема ні гонки з холодним
/// стартом плеєра, ні потреби у відкладеному видаленні. Збіг імен двох потоків
/// нешкідливий: вміст щоразу перегенеровується під той потік, що відкривають.
fn stream_playlist_path(name: &str) -> PathBuf {
    portable::tmp_dir().join(format!("{}.m3u8", sanitize::sanitize_component(name)))
}
```

`sanitize_component` (`src-tauri/src/sanitize.rs`) уже прикриває заборонені
символи й зарезервовані імена Windows (`CON`, `COM1`) — окремої санітизації не
писати.

**Розширення `.m3u8`, не `.m3u`:** за специфікацією `.m3u8` — це UTF-8, тож
кирилична назва станції доїде до заголовка плеєра цілою; `.m3u` плеєр читає в
локальній кодовій сторінці й спотворить її. VLC, WMP і foobar реєструють обидва
розширення, а якщо медіаплеєра немає взагалі — не асоційовані обидва однаково.

**Прибирання:** відкладеного видалення немає (воно гонилося б з холодним стартом
плеєра). Натомість `ensure_data_dirs()` один раз на старті чистить `data/tmp/`.
Помилку очищення **ігнорувати** — файл може бути тримати плеєр з минулої сесії, і
це не привід валити запуск.

### 3. Команда

```rust
#[tauri::command]
pub async fn open_stream_in_app(
    stream_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let stream = {
        let profile = state.active_profile.read().await;
        profile.streams.iter().find(|s| s.id == stream_id).cloned()
            // Невідомий id від власного UI — це наш баг, а не ситуація
            // користувача, тож окремого коду не заводимо.
            .ok_or_else(|| SHELL_ERR_GENERIC.to_string())?
    };
    tokio::task::spawn_blocking(move || {
        let path = stream_playlist_path(&stream.name);
        std::fs::write(&path, playlist::to_m3u8(std::slice::from_ref(&stream)))
            .map_err(|_| SHELL_ERR_WRITE_FAILED.to_string())?;
        shell_open(&path.to_string_lossy())
    })
    .await
    .map_err(|e| e.to_string())?
}
```

Приймає `stream_id`, а не готовий URL: пошук у стані тримає інваріант «у профілі
лише http(s)» (див. «Безпека») і не дає рендереру формувати вміст плейлиста.

Вміст — `playlist::to_m3u8` (`playlist.rs`), той самий серіалізатор, що й в
експорті: єдина точка правди про формат, і безкоштовно тягне `sanitize_name`
(захист від CR/LF в імені, що інакше зламав би рядковий формат). Дає
`#EXTM3U\n#EXTINF:-1,<назва>\n<url>\n` — назву станції плеєр покаже в заголовку,
тобто її прочитає NVDA.

Реєстрація команди в `lib.rs`, обгортка `openStreamInApp(streamId)` у
`src/lib/tauri.ts` поруч із `openSongInApp`.

**Безпека.** Інваріант «у профілі лише http(s)-URL» тримають дві точки входу:
`add_stream` падає на не-HTTP через `resolve_playlist_url`, а імпорт відкидає такі
рядки у `validate_stream_url` (`playlist.rs`). Формулювання попередньої редакції
(«URL береться зі стану профілю, не з user input») було хибним — URL у профілі
саме користувацький; захищає не походження, а перевірка схеми на вході.

## UI

У `StreamContextMenu` — пункт **«Відкрити у медіаплеєрі»** після `record`, перед `edit`:

```
▶ Відтворити / ■ Зупинити відтворення
⏺ Записати / ⏹ Зупинити запис
→ Відкрити у медіаплеєрі     ← новий пункт
✎ Редагувати
…
```

Пункт діє **лише на рядок, з якого відкрито меню** — виділення ігнорується (як
play/record/edit).

## Клавіатура

| Комбінація | Дія |
|------------|-----|
| `Enter` / `Space` | Play або Record (залежить від `doubleClickAction`) |
| `Shift+Enter` | Завжди Play |
| `Ctrl+Enter` | Завжди Record |
| `F2` | Edit (rename) |
| `Alt+Enter` | **Відкрити у медіаплеєрі** ← новий |

`Alt+Enter` уже зареєстрований `reserved` у `src/lib/shortcuts.ts` (id
`row-open-external`, group `list`) — туди нічого не додається. `ActionModifiers.alt`
уже є в `useCompositeList.ts`, `resolveKeyAction` уже пропускає `Alt+Enter` до
`onAction`. Робота зводиться до гілки в `StreamList.onAction` за зразком
`SongsList.tsx:129`, поруч із наявною обробкою `copy`.

Дія — на **фокусованому рядку**, не на виділенні.

**`aria-keyshortcuts` НЕ додавати.** Комміт `b06a9c1` (14.06) свідомо зняв цей
атрибут із рядка потоку: «these combos are handled at a higher level and should
not be advertised on individual rows», і рішення залоковане тестом
`StreamList.test.tsx` («does not advertise keyshortcuts on the row»). Streams тут
навмисно відрізняються від Songs і Browser. Додати сюди самий лише `Alt+Enter`
означало б і зламати той тест, і озвучувати новий шорткат, мовчачи про наявні
`Shift+Enter`/`Ctrl+Enter`/`F2`. Якщо повертати анотації — то окремим записом на
всі три списки.

## Обробка помилок

Три коди, і набір **не збігається** з Songs. `not_found` тут недосяжний — файл ми
щойно написали самі; натомість з'явився режим, якого в Songs немає: не вдалося
записати файл (немає прав, диск повний, флешку висмикнули).

| Код | Коли | Повідомлення |
|-----|------|--------------|
| `no_assoc` | `SE_ERR_NOASSOC` (31) — немає програми для `.m3u8` | «Немає програми для відкриття плейлистів — встановіть медіаплеєр» |
| `write_failed` | `fs::write` у `data/tmp/` не вдався | «Не вдалося створити тимчасовий файл плейлиста» |
| `generic` | решта кодів ≤ 32, join error, невідомий `stream_id` | «Не вдалося відкрити потік у медіаплеєрі» |

Розділяти `no_assoc` і `write_failed` — принципово: для сліпого користувача це
різниця між «встанови VLC» і «перевір диск». Злиття в одне «не вдалося відкрити»
лишає людину без наступного кроку.

**Фронтенд — окрема функція, не параметризація спільної.** У
`src/lib/shellOpenError.ts` додати другий експорт `streamOpenErrorMessage(err)`
поруч із наявним `shellOpenErrorMessage`: спільний файл, спільна тема, але тіла
різні, бо набори кодів різні (`no_assoc` тут ще й означає інше). `SongsPanel.tsx`
не чіпати взагалі. Заодно оновити коментар угорі файлу — він описує лише
`open_song_in_app` і після цієї роботи бреше.

Тост — через `addToast` у `StreamList.tsx`, де вже живуть решта тостів списку
(як `copyStreamUrl`).

## Зворотний зв'язок при успіху

**Успіх не озвучувати** — як і Songs (`SongsPanel.tsx:180`: тост лише в `catch`).
Спокуса додати «Відкриваю у медіаплеєрі…» оманлива: тост з'явиться рівно тоді,
коли ОС переводить передній план на вікно плеєра, і NVDA посеред перемикання його
не дочитає. Реальний зворотний зв'язок дає сам плеєр, коли отримує фокус.
Помилковий тост, навпаки, працює справно: при відмові жодне вікно фокус не
забирає, Tapir лишається на передньому плані.

## Одночасний запис

Якщо потік у цю мить записується або грає в Tapir, відкриття в зовнішньому плеєрі
створює **друге підключення** до станції з тієї ж IP. Частина станцій ріже конекти
по ліміту, тож у гіршому разі користувач власноруч рве собі запис.

**Дію все одно дозволяємо, мовчки** — блокувати легальну дію через чужий серверний
ліміт було б гірше, а попереджувальний діалог коштував би непропорційно дорого:
діалог, що лишається відкритим після async-перевірки, мусить явно вести фокус на
кнопку підтвердження, інакше NVDA мовчить.

## i18n

| Ключ | uk | en |
|------|----|----|
| `stream_action_open_player` | Відкрити у медіаплеєрі | Open in media player |
| `stream_open_no_assoc` | Немає програми для відкриття плейлистів — встановіть медіаплеєр | No app registered for playlists — install a media player |
| `stream_open_write_failed` | Не вдалося створити тимчасовий файл плейлиста | Could not create the temporary playlist file |
| `stream_open_failed` | Не вдалося відкрити потік у медіаплеєрі | Failed to open the stream in a media player |

«Зовнішній плеєр» як формулювання відкинуто: «зовнішній» — внутрішній жаргон, для
користувача нічого не означає.

## Тести

`ShellExecuteW` не тестується, тож чистими виносимо решту.

**Rust:**
- `stream_playlist_path` — санітизація та зарезервовані імена (`Radio/X`, `CON`,
  кирилиця); перевіряти `file_name()`, не повний шлях (він залежить від
  розташування EXE);
- тести `map_shell_error` **переносяться** до `commands/shell_open.rs` як є, без
  переписування — це вже покриття з `open-song-with-default-app`;
- `to_m3u8` не чіпати, вже покрито.

**Фронтенд (`StreamList.test.tsx`):**
- `Alt+Enter` на рядку → `openStreamInApp("a")`;
- `Alt+Space` не тригерить open (паралель до `SongsList.test.tsx:104`);
- наявний тест «does not advertise keyshortcuts on the row» **лишається
  недоторканим** — тепер він охороняє рішення з «Клавіатури».

## NVDA-прогін

Три сценарії, з них два відтворювані на реальній машині:

1. **Пункт меню** — назва й позиція озвучуються, дія відкриває плеєр.
2. **`Alt+Enter` з рядка** — те саме без меню; після повернення Alt+Tab фокус
   лишився на тому ж рядку.
3. **Помилка `write_failed`** — зняти права на запис у `data/tmp/`, перевірити, що
   тост озвучується.

`no_assoc` на машині зі встановленим VLC не відтворити — лишається на юніт-тест
тексту. У чеклисті **прямо написати, що вручну його не перевіряли**, а не ставити
галочку.

## Критерії готовності

Готове раніше (`open-song-with-default-app`), **не робити повторно**:

- [x] `ActionModifiers.alt` існує, `resolveKeyAction` передає його на `Alt+Enter`
- [x] Feature `Win32_System_Com` у `Cargo.toml`
- [x] `Alt+Enter` зареєстровано `reserved` у `src/lib/shortcuts.ts`
- [x] Юніт-тести `map_shell_error` (переносяться, не пишуться заново)

Робота цього запису:

- [x] `commands/shell_open.rs`: `shell_open`, `map_shell_error`, константи кодів
      (+ новий `write_failed`), перенесені тести; `open_song_in_app` переключено
      на модуль, копій у `songs_commands.rs` не лишилось
- [x] `portable::tmp_dir()` → `data/tmp/`; створення й очищення в
      `ensure_data_dirs()`, помилка очищення ігнорується (`clear_dir_contents`
      мовчки пропускає і відсутню теку, і файл, який тримає плеєр)
- [x] Чиста `stream_playlist_path(name)` + тести на санітизацію
- [x] Команда `open_stream_in_app(stream_id)`: пошук у профілі, `to_m3u8`,
      `fs::write` → `write_failed`, `shell_open` файлу
- [x] Реєстрація в `lib.rs` + `openStreamInApp` у `src/lib/tauri.ts`
- [x] Пункт «Відкрити у медіаплеєрі» у `StreamContextMenu` (після record, перед
      edit); діє на один рядок
- [x] `Alt+Enter` у `StreamList.onAction` через `mods.alt`
- [x] `streamOpenErrorMessage` у `shellOpenError.ts` (три коди) + оновлений
      коментар файлу; `SongsPanel.tsx` не чіпано
- [x] Помилка → тост через `addToast` у `StreamList.tsx`; успіх мовчазний
- [x] i18n: `stream_action_open_player`, `stream_open_no_assoc`,
      `stream_open_write_failed`, `stream_open_failed` (uk/en)
- [x] Тести: `StreamList.test.tsx` (`Alt+Enter`, `Alt+Space`, пункт меню, тост
      `no_assoc`), `shellOpenError.test.ts` (три коди + що текст не збігається з
      Songs), тест на `aria-keyshortcuts === null` лишився зеленим без правок
- [ ] NVDA-прогін за
      [чеклістом](../testing/nvda-open-stream-with-default-app.md) (8 сценаріїв;
      `no_assoc` у підсумку позначено як неперевірений вручну)

Попутно, поза початковим списком:

- [x] `settings_hotkey_action_row_open_external` більше не каже «(записи)» —
      `Alt+Enter` тепер і про потоки: «(записи, потоки)» / «(recordings, streams)»

## Документи

- Чекліст NVDA-прогону: [nvda-open-stream-with-default-app.md](../testing/nvda-open-stream-with-default-app.md)
- Зразок реалізації: [p1-open-song-with-default-app.md](done/p1-open-song-with-default-app.md)
- Спільна інфраструктура, уже готова: `src/hooks/useCompositeList.ts`
  (`ActionModifiers.alt`); `src/lib/shortcuts.ts` (`row-open-external`, reserved);
  `src-tauri/src/sanitize.rs` (`sanitize_component`);
  `src-tauri/src/stream/playlist.rs` (`to_m3u8`)
- Виноситься цим записом: `src-tauri/src/commands/songs_commands.rs`
  (`shell_open`, `map_shell_error` — приватні, переїжджають у `commands/shell_open.rs`)
- Рішення `b06a9c1` про `aria-keyshortcuts` на рядку потоку — див. «Клавіатура»
- ShellExecuteW: https://learn.microsoft.com/windows/win32/api/shellapi/nf-shellapi-shellexecutew
