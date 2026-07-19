---
slug: browser-add-probe
title: "Перевірка потоку при додаванні з Browser (add_station_from_browser probe)"
priority: P2
type: idea
status: done
effort: S
kind: feature
target: 0.2.0
updated: 2026-07-19
completed: 2026-07-19
a11y: true
depends_on: [add-stream-probe]
blocks: []
touches: [src-tauri/src/commands/browser_commands.rs, src-tauri/src/browser/types.rs]
gates: [cargo test, pnpm test]
notes: ["гілка feature/add-stream-probe"]
---

# Перевірка потоку при додаванні з Browser (add_station_from_browser probe)

> **Контекст:** виконано, гілка `feature/add-stream-probe`. Реюзнув спільну IPC `probe_stream` з [add-stream-probe](p2-add-stream-probe.md).

## Опис

При додаванні станції з Stream Browser (`add_station_from_browser`) не виконується реальна перевірка потоку. Прапор `lastcheckok` від Radio Browser API **повністю ігнорується** — він присутній у структурі `StationResult`, але не використовується. URL приймається на довіру від API.

Проблема: Radio Browser API перевіряє потоки рідко. Станція може мати `lastcheckok = 1` (OK), але фактично бути мертвою тижні чи місяці. Додавання такої станції веде до помилки лише під час запису.

**Два підходи:**

1. **Async probe після додавання** (без блокування): `add_station_from_browser` зберігає потік одразу (як зараз), але потім async запускає probe і надсилає тост з результатом ("Потік доступний ✓" або "Потік не відповів — перевірте URL").

2. **Sync probe перед збереженням**: показати spinner у кнопці "Додати", probe → показати результат → зберегти або попередити. Аналогічно до [add-stream-probe](p2-add-stream-probe.md).

**Рекомендація:** варіант 1 (async тост) кращий для Browser — результати Browser відображаються у таблиці, blocking spinner ускладнює UX при масовому додаванні. Async feedback через тост не блокує навігацію.

## Технічна реалізація

**Backend (`browser_commands.rs`):**
- **Вар. 1 (async тост) — обрано.** `add_station_from_browser` / `add_stations_from_browser` зберігають одразу (як зараз), потім async probe через `tokio::spawn` → emit події з результатом. Реюзає probe-шлях зі спільної IPC `probe_stream` ([add-stream-probe](p2-add-stream-probe.md)) — той самий `probe::probe` із зовнішнім 5-с timeout.
- `lastcheckok == 0` — дешевий префільтр: попередити одразу, без probe.
- **Масове додавання:** озвучувати лише невдачі (або один підсумок «Перевірено N, не відповіли M»), щоб не залити NVDA потоком тостів; успіхи — тихо.

**Frontend:**
- Підписатися на `browser-station-probe-result` подію
- Відображати тост лише для невдач / підсумку: "Потік не відповів — перевірте URL"
- `lastcheckok == 0` у таблиці результатів — індикатор **лише для FAIL** у доступному імені рядка (напр. «⚠ остання перевірка: FAIL»); для OK — нічого (ненадійний сигнал, лише захаращує озвучення). **Без** окремого стовпця OK/FAIL.
- NVDA: polite aria-live для тосту

## Критерії готовності

- [x] `lastcheckok = 0` від Radio Browser API відображається у UI **лише для FAIL** у доступному імені рядка (без окремого стовпця OK/FAIL) — **уже було зроблено раніше**, див. нижче
- [x] Після `add_station_from_browser` запускається async probe
- [x] Тост через `LiveAnnouncer` для NVDA **лише для невдач / підсумку** (успіхи при масовому додаванні не озвучуються)
- [x] При невдалому probe потік залишається у профілі (не видаляється автоматично)
- [x] Timeout probe: ≤ 5 секунд

## Як реалізовано

- `spawn_probe_added()` у `browser_commands.rs` — detached `tokio::spawn` після
  збереження, `buffer_unordered(PROBE_CONCURRENCY = 5)`. Викликається з
  `add_station_from_browser` і `add_stations_from_browser`.
- Реюз спільного шляху: `stream_io_commands::probe_once(url) -> ProbeVerdict`
  (винесено з команди `probe_stream`), тож 5-с `SINGLE_PROBE_TIMEOUT` спільний з
  `AddStreamDialog` — одна константа, одна семантика таймауту.
- Подія `browser-station-probe-result` `{ checked, failed: [names] }` емітиться
  **лише коли `failed` непорожній** — повністю успішний батч не породжує події
  взагалі (тиша для NVDA замість фільтрації на фронті).
- Фронт: `useBrowserProbeFeedback()` (App-wide, поруч із `useCrashResumeFeedback`) →
  polite announce + info-toast. Одна невдача називає станцію, кілька — згортаються
  у «N з M». Хук на рівні App, а не BrowserPanel: probe асинхронний і має
  доозвучитися навіть якщо користувач уже пішов з екрана Browser.
- Тести: `src/hooks/useBrowserProbeFeedback.test.tsx` (3).

### Що виявилося вже зробленим

Перший критерій (`lastcheckok == 0` у доступному імені) **уже був реалізований** —
`StationList` рахує `isUnavailable = station.lastcheckok === 0 || failedPreview.has(id)`,
а `StationItem` підставляє `m.station_summary_offline()` у мітку рядка + іконку
`TriangleAlert`. Нічого міняти не довелося.

### Уточнення, яких не було в записі

- «Дешевий префільтр `lastcheckok == 0` без probe» на практиці майже не спрацьовує:
  `api.rs` шле в запиті `hidebroken=true` і `lastcheckok=1`, тож станції з FAIL
  до списку взагалі не доїжджають. Індикатор у рядку живе переважно з
  `failedPreview`. Префільтр не додавав би нічого — не реалізовано свідомо.
- `add_example_streams` probe **не** запускає: анкери мають офлайн-fallback, і
  озвучувати «не відповіли» на першому запуску без мережі — шум, а не користь.

### Можливий follow-up (не робив)

Результат probe не позначає рядок у таблиці Browser як `isUnavailable` — озвучується
лише підсумок. Зв'язати подію з `failedPreview`-подібним станом можна, але список на
той момент часто вже інший (нова сторінка/пошук), тож користь сумнівна.

## Відкриті питання

_Закрито 2026-06-25 (рішення)._

- ✅ **Вар. 1 (async тост) — обрано.** Browser підтримує масове додавання (`add_stations_from_browser`); sync-спінер серіалізував би перевірку й блокував UX. Async probe після збереження не блокує навігацію. Уточнення: при масовому додаванні озвучувати лише невдачі/підсумок, не кожен успіх (інакше потік тостів у NVDA). Sync-спінер лишається в `AddStreamDialog` ([add-stream-probe](p2-add-stream-probe.md)) — там додають по одному.
- ✅ **`lastcheckok` — показувати лише FAIL, без стовпця OK/FAIL.** `lastcheckok == 1` («OK») ненадійний (саме тому й робимо probe) → показ «OK» дає хибну впевненість і подвоює багатослівність читання таблиці в NVDA. Виводити лише `lastcheckok == 0` як індикатор у доступному імені рядка («⚠ остання перевірка: FAIL»); для OK — нічого.

## Документи

- Код: `src-tauri/src/commands/browser_commands.rs` — `add_station_from_browser`, `station_to_stream_info`
- Код: `src-tauri/src/browser/types.rs` — `StationResult.lastcheckok`
- Код: `src-tauri/src/stream/probe.rs` — `probe()` (вже є)
- Зразок: `src-tauri/src/commands/stream_io_commands.rs` — async probe pattern
- Пов'язано: [add-stream-probe](p2-add-stream-probe.md) — ✅ done; спільна IPC `probe_stream(url) -> { ok, error }` уже існує в `src-tauri/src/commands/stream_io_commands.rs` (5-с `SINGLE_PROBE_TIMEOUT`) — тут її треба лише викликати з `tokio::spawn`
