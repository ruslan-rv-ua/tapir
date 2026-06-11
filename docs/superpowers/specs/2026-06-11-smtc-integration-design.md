# Інтеграція з SMTC (System Media Transport Controls) — Design Spec

**Дата:** 2026-06-11
**Гілка:** feature/smtc-integration
**Вимоги:** [FRD: SMTC-інтеграція](../../frd/2026-06-11-smtc-integration.md)
**Технічне рішення:** [ADR: SMTC через прямий windows-crate](../../decisions/2026-06-11-smtc-via-windows-crate.md)

## Проблема

Апаратні медіа-клавіші (⏯, кнопки гарнітури, Bluetooth-пульти) ідуть через
SMTC, і Tapir їх не чує; системний медіа-оверлей Windows порожній. Реєструвати
`MediaPlayPause` як глобальний хоткей — красти клавіші в усіх інших плеєрів.
SMTC — кооперативний системний канал, який вирішує це без крадіжки.
Деталі та мотивація — у FRD.

## Скоуп (рішення брейнсторму)

- **Беремо must + should:** FR-1..5, FR-7, FR-8.
- **FR-6 (обкладинка станції) відкладено** — відкриті питання ліцензійності
  та кешування favicon'ів; Cargo-фічу `Storage_Streams` зараз не додаємо.
- **Дзеркалимо все, що грає двигун:** станції профілю, файли, прев'ю з
  Браузера станцій. Двигун має одну сесію нараз (прев'ю витісняє попереднє
  відтворення), тож відкрите питання FRD §7 про «кілька одночасних прев'ю»
  знімається.
- **FR-7 за замовчуванням увімкнено** — механізм кооперативний, нічого не
  краде; вимикається в Settings → Hotkeys.

## Архітектура

Новий модуль `src-tauri/src/smtc.rs` — єдиний власник усього WinRT/COM.
Назовні — синхронні функції-фасади (патерн `crate::tray::notify_state_changed`),
всередині — один worker-таск, що серіалізує всі оновлення:

```
engine.rs ──► smtc::sync_status(app, &PlayerStatus)   (з emit_player_status)
engine.rs ──► smtc::sync_track(stream_id, artist, title)  (з ICY-writer таска)
save_settings ──► smtc::set_enabled(bool)
                      │
                      ▼  (mpsc::unbounded_channel — sync send, без блокувань)
              worker task (tauri::async_runtime)
                      │  тримає: SystemMediaTransportControls + DisplayUpdater
                      │  + поточний source/station/track (стейт-машина)
                      ▼
              WinRT COM-виклики (Update, PlaybackStatus, IsEnabled…)

SMTC ButtonPressed (WinRT-потік) ──► tauri::async_runtime::spawn ──►
        ті самі шляхи, що й хоткеї: resume/pause/stop плеєра,
        emit("transport-skip")
```

Ключові рішення:

1. **Ініціалізація в `setup`** (lib.rs), одразу після показу головного вікна:
   `ISystemMediaTransportControlsInterop::GetForWindow(hwnd)` з
   `main_window.hwnd()`. Успіх → `OnceLock<UnboundedSender<SmtcCommand>>`
   заповнюється і стартує worker. **Невдача (N-версії Windows без Media
   Feature Pack) → лог warn, OnceLock порожній, усі фасади — мовчазний
   no-op.** Запис і наявні хоткеї не залежать від SMTC взагалі — graceful
   no-op з NFR виконано конструктивно.

2. **Один worker-таск серіалізує всі оновлення.** Окремий spawn на кожен
   виклик (як у `notify_track_change`) дав би гонку: швидкі Pause→Play могли
   б перегнати один одного, і SMTC показував би застарілий стан. Канал
   гарантує порядок. Worker сам резолвить назву станції з `active_profile`
   (той самий lookup, що в `notify.rs`) — викликачі нічого не знають про
   профілі.

3. **Команди worker'а:**
   - `Status(PlayerStatus)` — зі `emit_player_status`; ловить *усі* переходи
     (play/pause/stop/зміна джерела), бо це єдиний funnel статусів двигуна.
   - `Track { stream_id, artist, title }` — з ICY-writer; worker відкидає
     stale-оновлення, звіряючи `stream_id` з поточним source (для прев'ю
     `stream_id` порожній — звіряється з `PlaybackSource::Preview`).
   - `SetEnabled(bool)` — з налаштувань; при `true` під час гри worker
     повторно застосовує поточний стан і метадані з власної пам'яті.

4. **Cargo-фічі `windows`-crate** (вже залежність 0.62): додати `Media`
   (SystemMediaTransportControls), `Foundation` (`TypedEventHandler`),
   `Win32_System_WinRT` (interop). `HWND` не `Send` — у worker передається
   як `isize`.

## Поведінка

### Мапінг стану (FR-1, FR-8)

| `PlaybackState` | SMTC |
|---|---|
| `Playing` | `IsEnabled=true`, `PlaybackStatus=Playing`, кнопки активні |
| `Paused` | `IsEnabled=true`, `PlaybackStatus=Paused` |
| `Stopped` | `PlaybackStatus=Closed`, `DisplayUpdater.ClearAll()`, `IsEnabled=false` — Tapir зникає з оверлея, медіа-клавіші повертаються попередньому плеєру |

Кнопки `IsPlay/Pause/Stop/Next/PreviousEnabled = true` завжди, коли сесія
активна. Prev/next **не** «сіріють» на межах списку: Rust не знає, чи є сусід
(це стейт webview — `$playbackNeighbors`), а хоткеї `Ctrl+Alt+←/→` у тій самій
ситуації мовчки no-op'лять — поведінка ідентична, нового мосту синхронізації
webview→Rust не будуємо.

### Метадані (FR-4)

Чисте правило composition — окрема функція, юніт-тестована:

| Джерело | Title | Artist | AlbumTitle |
|---|---|---|---|
| Станція, ICY-трек відомий | назва треку | виконавець | назва станції |
| Станція, треку ще нема | назва станції | — | — |
| Прев'ю (Browser) | як станція, але station = `Preview.name`; ICY-оновлення показуємо, якщо прийдуть | | |
| Файл | title з тегів (lofty, як у `songs/scanner.rs`), fallback — ім'я файлу без розширення | artist з тегів | — |

`DisplayUpdater.Type = Music`; оновлення метаданих завершується `Update()`.

Для прев'ю ICY-writer сьогодні *не* еммітить `track-changed` (порожній
`stream_id` — фільтр для toast/webview). Виклик `smtc::sync_track` ставимо
**до** цього фільтра — SMTC отримує метадані й для прев'ю, toast-логіка не
змінюється.

### Обробники кнопок (FR-2, FR-3, FR-5)

Той самий код-шлях, що хоткеї; обробник `ButtonPressed` приходить на
WinRT-потоці → мінімум роботи там, решта через `tauri::async_runtime::spawn`
(як обробник хоткеїв):

- **Play → `resume_playback`, Pause → `pause_playback`** — directional, без
  toggle-неоднозначності. Обидва проходять через **спільний debounce-cell** з
  хоткеєм `toggle_playback`: новий `LAST_TOGGLE_PLAYBACK_MS` у `shortcuts.rs`,
  `recently_fired` стає `pub(crate)`. Це NFR-дедуплікація: хоткей +
  медіа-клавіша в межах 500 мс → одна дія. Побічний ефект: сам хоткей
  `toggle_playback` теж отримує debounce (зараз його не має) — відповідає FRD.
- **Next/Previous → `app.emit("transport-skip", "next"/"prev")`** — буквально
  ті самі рядки, що в `handle_shortcut_action`. Без debounce: повторні
  натискання — легітимний спосіб перегортати (рішення зі
  [спеки prev/next](2026-06-10-global-prev-next-track-design.md)).
- **Stop → `stop_playback`** — НЕ запис (FR-5). Запису SMTC не торкається
  ніде: у протоколі немає кнопки запису, плутати play з record небезпечно.

### Налаштування (FR-7)

- `GlobalSettings.smtc_enabled: bool`, `#[serde(default = "default_true")]` —
  старі `settings.json` мігрують автоматично (патерн KB-12 / prev_track).
- `save_settings` отримує параметр `app: tauri::AppHandle` і при зміні
  значення шле `SetEnabled`. Окрема команда (як `register_hotkeys`) не
  потрібна — тут немає списку помилок для UI.
- `off` → негайний `Closed + ClearAll + IsEnabled=false`, навіть під час гри.
- `on` під час гри → worker відновлює стан і метадані з пам'яті.

## Фронтенд + i18n

- `GlobalSettings` interface у `src/lib/tauri.ts` += `smtcEnabled: boolean`
  (camelCase ⇄ serde).
- `HotkeysTab.tsx`: react-aria `Checkbox` угорі вкладки — той самий патерн,
  що `minimizeToTray` у `GeneralTab.tsx` (`isSelected` /
  `update({ smtcEnabled: val })`). NVDA читає з коробки.
- i18n: `settings_smtc_enabled` («Інтеграція з системними медіа-кнопками» /
  "System media keys integration") в `uk.json` + `en.json`; перегенерувати
  paraglide через vite-плагін.
- Жодної нової транспортної логіки: слухач `transport-skip` в App.tsx уже
  існує і не відрізняє хоткей від SMTC.

## Документація (в рамках імплементації)

- [keyboard-shortcuts.md](../../keyboard-shortcuts.md): абзац «SMTC доповнює
  Tier-1», звірити дату «Останнє звірення з кодом».
- [FRD](../../frd/2026-06-11-smtc-integration.md): статус → реалізовано,
  відповіді на відкриті питання §7 (прев'ю — знято, auto-ducking — перевірити
  на практиці під час ручного тестування, FR-6 — відкладено).

## Тести

- **Rust (юніт, без COM):**
  - composition метаданих — кожен рядок таблиці вище;
  - мапінг `PlaybackState` → SMTC-статус;
  - `smtc_enabled` default=true при десеріалізації старого `settings.json`
    без поля (дзеркало KB-12-тесту);
  - спільний debounce-cell (перший виклик проходить, повтор — ні).
  - COM-шар лишається тонким і юніт-нетестованим — свідомо.
- **Frontend:** HotkeysTab рендерить чекбокс, `update` шле `smtcEnabled`;
  наявні тести не ламаються.
- **Ручні (критерії приймання FRD §6):** ⏯ паузить лише Tapir (Spotify не
  реагує); оверлей показує станцію + трек, трек оновлюється з ICY; prev/next
  з оверлея = `Ctrl+Alt+←/→`; після стопу Tapir зникає з оверлея; запис
  неперервний у всіх сценаріях; NVDA-сценарій з кнопкою гарнітури без зміни
  фокуса.
- **Гейти:** `pnpm test`, `pnpm vite:build`, `cargo test`
  (tsc — не гейт, відомі помилки paraglide).

## Підсумок поведінки

| Ситуація | Результат |
|---|---|
| Грає станція/файл/прев'ю | Tapir в оверлеї: стан + метадані |
| ⏯ на клавіатурі / кнопка гарнітури | pause/resume плеєра Tapir |
| Хоткей + медіа-клавіша в межах 500 мс | одна дія (спільний debounce) |
| Prev/next в оверлеї | як `Ctrl+Alt+←/→` (міст `transport-skip`) |
| Stop в оверлеї | стоп відтворення; запис не чіпається |
| Відтворення зупинено | сесія знята, медіа-клавіші — попередньому плеєру |
| `smtc_enabled = false` | сесія не реєструється / негайно знімається |
| Windows N без Media Feature Pack | graceful no-op; запис і хоткеї працюють |
