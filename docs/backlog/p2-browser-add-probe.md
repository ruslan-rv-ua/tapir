# Перевірка потоку при додаванні з Browser (add_station_from_browser probe)

- **Слаг:** `browser-add-probe`
- **Тип:** ідея
- **Стан:** ready
- **Зусилля:** S
- **Оновлено:** 2026-06-15
- **Залежності:** Phase 3B (Stream Browser ✅), Phase 3J (stream::probe ✅)

## Опис

При додаванні станції з Stream Browser (`add_station_from_browser`) не виконується реальна перевірка потоку. Прапор `lastcheckok` від Radio Browser API **повністю ігнорується** — він присутній у структурі `StationResult`, але не використовується. URL приймається на довіру від API.

Проблема: Radio Browser API перевіряє потоки рідко. Станція може мати `lastcheckok = 1` (OK), але фактично бути мертвою тижні чи місяці. Додавання такої станції веде до помилки лише під час запису.

**Два підходи:**

1. **Async probe після додавання** (без блокування): `add_station_from_browser` зберігає потік одразу (як зараз), але потім async запускає probe і надсилає тост з результатом ("Потік доступний ✓" або "Потік не відповів — перевірте URL").

2. **Sync probe перед збереженням**: показати spinner у кнопці "Додати", probe → показати результат → зберегти або попередити. Аналогічно до `p2-add-stream-probe.md`.

**Рекомендація:** варіант 1 (async тост) кращий для Browser — результати Browser відображаються у таблиці, blocking spinner ускладнює UX при масовому додаванні. Async feedback через тост не блокує навігацію.

## Технічна реалізація

**Backend (`browser_commands.rs`):**
- Використати `lastcheckok` для попереднього попередження: якщо `lastcheckok == 0` → emit тост без probe
- Async probe через `tokio::spawn` після збереження → emit подію з результатом

**Frontend:**
- Підписатися на `browser-station-probe-result` подію
- Відображати тост: "Перевіряю доступність..." → "Потік доступний" / "Потік не відповів"
- NVDA: polite aria-live для тосту

## Критерії готовності

- [ ] `lastcheckok = 0` від Radio Browser API відображається у UI (окремий badge або tooltip)
- [ ] Після `add_station_from_browser` запускається async probe
- [ ] Тост з результатом probe (success/failure) через `LiveAnnouncer` для NVDA
- [ ] При невдалому probe потік залишається у профілі (не видаляється автоматично)
- [ ] Timeout probe: ≤ 5 секунд

## Відкриті питання

- Варіант 1 (async тост) чи варіант 2 (sync blocking)?
- Чи показувати `lastcheckok` у таблиці результатів Browser як badge ("остання перевірка: OK/FAIL")?

## Документи

- Код: `src-tauri/src/commands/browser_commands.rs` — `add_station_from_browser`, `station_to_stream_info`
- Код: `src-tauri/src/browser/types.rs` — `StationResult.lastcheckok`
- Код: `src-tauri/src/stream/probe.rs` — `probe()` (вже є)
- Зразок: `src-tauri/src/commands/stream_io_commands.rs` — async probe pattern

## Промпт для агента

Каталог промптів за типом: [README — Каталог промптів](README.md#каталог-промптів-за-типом).
Тип `ідея`.
