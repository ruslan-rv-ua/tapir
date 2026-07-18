# Design: налаштування «відновлювати файл з позиції / з початку» (`resume_file_from`)

- **Дата:** 2026-07-18
- **Джерело:** [docs/backlog/p2-resume-file-from-setting.md](../../backlog/p2-resume-file-from-setting.md) (P2, дизайн узгоджено там; цей spec фіксує актуалізацію під реальний код після P1)
- **Залежить від:** P1 `p1-playback-toggle-stop-pause` — done, змержено в develop (46513f2)

## Мета

Глобальне налаштування `resume_file_from: position | start` (default `position`), що керує **лише** cold-start / `Stopped→Ctrl+Shift+K` відновленням останнього файлу: продовжити з збереженої `position_ms` чи стартувати з початку. Додатково (рішення 2026-07-18): NVDA-анонс при resume з позиції містить саму позицію — «Playing: {name}, from {12:30}» — бо в P1 цей анонс, всупереч припущенню backlog-запису, реалізований **не** був (`playback_started` = "Playing: {name}" без позиції).

## Не в скоупі

- `pause→resume` в межах сесії — **не** чіпати: завжди з позиції (семантика паузи). Регресійний guard обов'язковий.
- Персистенція `position_ms` — вже завжди увімкнена (рішення П7 у P1), перемикач її не вимикає.
- Третій варіант enum («питати», Never/Ask/Always) — двері лишаємо (enum, не bool), але не реалізуємо.
- Поріг «за довжиною» — відхилено фінально в backlog-записі.

## Актуалізація відносно backlog-запису

| Запис казав | Насправді в коді |
|---|---|
| Cold-start-гілка в `shortcuts.rs` | `resume_last()` у [playback_control.rs:198](../../../src-tauri/src/playback_control.rs#L198); `PlayFile`-гілка з `play_file` + `seek_playback(fp.position_ms)` на [рядку 241-257](../../../src-tauri/src/playback_control.rs#L241-L257) |
| Анонс з позицією «і так у P1» | Відсутній. `playback_started` без позиції; webview-селектор анонсів ([playbackAnnounce.ts](../../../src/lib/playbackAnnounce.ts)) позиції не знає. Додаємо в цей P2 (підхід нижче) |

## Дизайн

### 1. Rust: налаштування ([settings.rs](../../../src-tauri/src/settings.rs))

- `enum ResumeFileFrom { #[default] Position, Start }` — `Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq`, `#[serde(rename_all = "lowercase")]` — за зразком `DoubleClickAction`.
- Поле `pub resume_file_from: ResumeFileFrom` з `#[serde(default)]` у `GlobalSettings`, поруч із `auto_advance` / `prev_restart_threshold_ms` (кластер поведінки плеєра). camelCase назовні: `resumeFileFrom`.
- Back-compat: старий `settings.json` без поля → `Position`. Тест у наявному блоці serde-тестів (~[settings.rs:291](../../../src-tauri/src/settings.rs#L291)).

### 2. Rust: cold-start-гілка ([playback_control.rs](../../../src-tauri/src/playback_control.rs))

У `ColdStart::PlayFile`:

1. Прочитати `state.settings.read().await.resume_file_from` (короткий read-lock, як для профілю вище).
2. **`Start`** → `play_file` без наступного `seek_playback` (грати з 0). «started»-анонс приходить webview-side як зараз — без змін.
3. **`Position` і `position_ms > 0`** → **перед** `play_file` емітнути `player-announce { kind: "resuming", name: <basename файлу>, positionMs }`; потім `play_file` + `seek_playback` як зараз. `position_ms == 0` → поводитись як досі (без «resuming», звичайний «started»).
   - `PlaybackAnnounce` (Rust-side struct, [playback_control.rs:17](../../../src-tauri/src/playback_control.rs#L17)) розширюється полем `position_ms: Option<u64>` (camelCase → `positionMs`), `None` для решти kind'ів.
   - `name` — basename шляху (`Path::file_name()`), **з розширенням**, щоб збігтися з webview-`nameOf` для файлів (`source.path.split(/[\\/]/).pop()`, [App.tsx:220](../../../src/App.tsx#L220)) — інакше suppression дубля не спрацює.
   - Помилка `play_file` → наявний «error»-анонс (він уже скидає pending webview-side).
   - Невдалий `seek` лишається best-effort (як зараз): анонс уже сказав «з 12:30», а грає з 0 — прийнятний рідкісний край, логується warn.

Патерн ідентичний cold-start-стрімам: «connecting» перед `play_stream` + one-shot suppression наступного «started».

### 3. Webview: анонс + suppression ([App.tsx](../../../src/App.tsx), [playbackAnnounce.ts](../../../src/lib/playbackAnnounce.ts))

- `PlaybackAnnounce`-тип у `lib/tauri.ts`: + `positionMs?: number`.
- `handlePlayerAnnounce` — новий кейс `"resuming"`: анонсувати `m.playback_resuming({ name, position })` assertive і озброїти той самий `pendingConnectRef` (`{ name, until: now + 20_000 }`) — механізм `suppressesStarted` уже порівнює лише ім'я та TTL, тип джерела йому байдужий; розширення коду suppression не потрібне, лише тести.
- Позиція форматується як у плеєрі: `formatTime(ms)` з [PlaybackPosition.tsx:15](../../../src/components/player/PlaybackPosition.tsx#L15) — винести в `lib/` (експорт) і реюзати в обох місцях.

### 4. i18n (EN/UK)

- `playback_resuming`: EN "Playing: {name}, from {position}" / UK "Відтворення — {name}, з {position}".
- `settings_resume_file_from` (лейбл групи): EN "Resume file" / UK "Відновлювати файл"; опції EN "From last position" / "From the beginning", UK "З останньої позиції" / "З початку".
- Регенерація paraglide через vite-плагін.

### 5. UI ([AudioTab.tsx](../../../src/components/settings/AudioTab.tsx))

- Секція `player_controls`, після `auto_advance`: react-aria **Select** (2 опції: `position` / `start`) з видимим `Label`, керований `settings.resumeFileFrom`, `onSelectionChange → update({ resumeFileFrom })` — той самий віджет-патерн, що в `doubleClickAction` у GeneralTab (рішення 2026-07-18: Select замість RadioGroup зі спеки — консистентність із наявним кодом).
- Доступність: стандартний react-aria Select (як у `doubleClickAction`), лейбли з i18n — NVDA читає лейбл + вибрану опцію. Стилі за сусідами по секції.

### 6. Тести

- **Rust serde:** default = `position`; старий JSON без поля вантажиться → `position`; round-trip.
- **Rust unit (`resume_last`):** mode `start` → play без seek; mode `position` → «resuming»-емит + seek; `position_ms == 0` → без «resuming». (Наявні тести `decide_cold_start` не зачіпаються — рішення *що* грати не змінюється, лише *звідки*.)
- **Регресійний guard:** `pause→resume` в межах сесії не залежить від `resume_file_from` (тест на toggle-гілку `Paused→resume`).
- **Webview:** кейс «resuming» анонсує з позицією і озброює suppression; наступний «started» того самого імені супрессується; `formatTime` після переносу вкритий юнітом.
- **UI:** RadioGroup рендериться, зміна викликає `update` з новим значенням.

### 7. Гейти

`cargo test` + `cargo clippy` зелені; `pnpm test` + `pnpm vite:build` зелені (tsc має ~51 преекзистинг-помилку від paraglide — не гейт).

## Критерії готовності (з backlog-запису + доповнення)

- [ ] `resume_file_from` у `GlobalSettings`, default `position`; back-compat тест
- [ ] Cold-start K: mode `position` → з `position_ms`; mode `start` → з 0
- [ ] `pause→resume` у межах сесії не зачеплено — регресійний guard
- [ ] NVDA-анонс resume з позиції містить позицію; дубль-«started» супрессується
- [ ] Select у AudioTab → «Керування плеєром», i18n EN/UK, доступний з клавіатури
- [ ] Усі гейти зелені
