---
slug: add-stream-probe
title: "Перевірка потоку при ручному додаванні (AddStreamDialog probe)"
priority: P2
type: idea
status: done
effort: S
kind: feature
target: 0.2.0
updated: 2026-07-19
completed: 2026-07-19
a11y: true
depends_on: []
blocks: [browser-add-probe]
touches: [src/components/streams/AddStreamDialog.tsx, src-tauri/src/commands/stream_io_commands.rs, src-tauri/src/stream/probe.rs]
gates: [cargo test, pnpm test]
notes: ["гілка feature/add-stream-probe"]
---

# Перевірка потоку при ручному додаванні (AddStreamDialog probe)

> **Контекст:** виконано, гілка `feature/add-stream-probe`. Спільна IPC `probe_stream` стала базою для [browser-add-probe](p2-browser-add-probe.md).

## Опис

При ручному додаванні потоку через `AddStreamDialog` URL зберігається без будь-якої перевірки доступності. Мертвий або неправильний потік виявляється **лише під час запису** — жодного попередження у момент додавання.

Функція `probe()` вже реалізована (Phase 3J — імпорт потоків) і перевіряє HTTP-з'єднання та ICY-заголовки. Треба застосувати її і до ручного додавання.

**Поведінка:**
- Після підтвердження форми → показати індикатор завантаження ("Перевіряю потік…")
- Якщо probe успішний → зберегти і закрити діалог
- Якщо probe невдалий → показати попередження ("Потік не відповів — можливо, він недоступний"), але **не блокувати збереження** — користувач може все одно додати (потік може бути тимчасово недоступний)

Це узгоджується з поведінкою імпорту (Phase 3J), де результати probe відображаються, але помилкові потоки залишаються доступними для вибору.

## Технічна реалізація

**Frontend (`AddStreamDialog.tsx`):**
- Після submit → IPC `probe_stream(url)` (нова спільна команда, див. нижче)
- Поки probe → `aria-busy`, кнопка "Зберегти" disabled, spinner
- Результат → або зберегти, або показати inline попередження над кнопками

**Backend:**
- `probe::probe()` вже є в `src-tauri/src/stream/probe.rs`
- **Нова IPC-команда `probe_stream(url: String) -> { ok: bool, error: Option<String> }`** — тонка обгортка над `probe::probe` (повертає лише ping, не повний `ProbeResult`). **Не** реюзати `validate_import_candidates`: вона подієва (еміттить `stream-import-progress`, повертає `()`) і заточена під масовий пікер імпорту — для одного URL у діалозі це нав'язало б крихку обв'язку слухача події. `begin_stream_import` — взагалі файловий пікер плейлиста, не стосується. `probe_stream` — це і є «одна IPC на двох» (спільна з [browser-add-probe](p2-browser-add-probe.md)). Рішення закрите 2026-06-25.
- **Timeout: обгорнути виклик у `tokio::time::timeout(Duration::from_secs(5), …)`** іменованою константою. `connection::connect` має лише `connect_timeout(10s)` і **жодного** загального ліміту — без зовнішнього timeout діалог може зависнути на 10+ с.

## Критерії готовності

- [x] При submit `AddStreamDialog` викликається probe перед збереженням
- [x] Показується індикатор очікування під час probe
- [x] При невдалому probe — inline попередження (не блокує збереження)
- [x] При успішному probe — зберегти і закрити без затримок
- [x] NVDA: `aria-live="polite"` для результату probe; `aria-busy` під час перевірки
- [x] Timeout probe: не більше 5 секунд (щоб діалог не завис)

## Як реалізовано

- `probe_stream(url) -> { ok, error }` у `src-tauri/src/commands/stream_io_commands.rs`
  (поруч із `validate_import_candidates`, обидва — обгортки над `probe::probe`).
  Ніколи не повертає `Err`: недоступний потік — це вердикт, не помилка команди.
- Загальний бюджет — константа `SINGLE_PROBE_TIMEOUT = 5s` через `tokio::time::timeout`;
  таймаут повертається як звичайний `ok: false` з текстом помилки.
- `AddStreamDialog`: probe робиться один раз на URL. Невдача → попередження в
  `aria-live="polite"` + кнопка стає «Все одно додати»; другий submit зберігає без
  повторного probe. Редагування URL скидає стан → probe повториться.
- Режим редагування не probe-ить (URL там не редагується).
- Тести: `src/components/streams/AddStreamDialog.test.tsx` (6),
  `probe_stream_reports_unreachable_as_not_ok` (Rust).

## Відкриті питання

_Закрито 2026-06-25 (аудит коду + рішення)._

- ✅ **Нова команда `probe_stream(url) -> { ok, error }`, не реюз `validate_import_candidates`.** Остання подієва (`stream-import-progress`, повертає `()`) і заточена під масовий пікер імпорту; для одного URL це форсувало б крихку обв'язку слухача події на фронтенді. `begin_stream_import` — взагалі файловий пікер плейлиста, не стосується. `probe_stream` — тонка обгортка над `probe::probe`, спільна з [browser-add-probe](p2-browser-add-probe.md).
- ✅ **Timeout — фіксовані 5 с (іменована константа), без налаштування.** Probe тут необов'язкове попередження, не блокатор збереження → точність порогу не важлива, а налаштування додало б UI/персист/i18n/NVDA заради числа, яке ніхто не крутитиме (YAGNI). Увага: під 5 с потрібен зовнішній `tokio::time::timeout` — вбудований `connect_timeout` це 10 с і лише на стадію конекту.

## Документи

- Код: `src/components/streams/AddStreamDialog.tsx`
- Код: `src-tauri/src/commands/stream_commands.rs` — `add_stream`
- Код: `src-tauri/src/stream/probe.rs` — `probe()` (вже є)
- Код: `src-tauri/src/commands/stream_io_commands.rs` — `validate_import_candidates` (зразок)
- Пов'язано: [browser-add-probe](p2-browser-add-probe.md) — аналогічний probe для Stream Browser (async тост замість sync spinner)
