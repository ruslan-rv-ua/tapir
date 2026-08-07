---
slug: stream-auth
title: "Автентифікація потоку: оживити username/password (DPAPI + передача в HTTP)"
priority: P2
type: research
status: draft
effort: L
kind: feature
target: unscheduled
updated: 2026-08-07
a11y: true
depends_on: []
blocks: []
touches:
  - src-tauri/src/profile.rs
  - src-tauri/src/stream/connection.rs
  - src-tauri/src/commands/stream_io_commands.rs
  - src-tauri/src/player/engine.rs
  - src/components/streams/AddStreamDialog.tsx
  - docs/data-models.md
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Виявлено при groomingʼу full-edit-stream (2026-08-07): поля username/password існують у StreamInfo від Phase 1, але жоден із трьох потрібних шарів не реалізований"
  - "data-models.md описує DPAPI-шифрування паролів як діюче — це drift, не факт; виправити разом із реалізацією або окремо, якщо запис так і не візьмуть"
  - "Профіль уже страхує експорт: export_json / import стирають password (profile.rs:570-625) — цей інваріант зберегти"
---

# Автентифікація потоку: оживити username/password (DPAPI + передача в HTTP)

> **Контекст:** `type: research` — підхід не обрано. Поля auth існують у моделі
> даних, але не робить нічого **жоден** із трьох потрібних шарів. Запис
> заведено, щоб знання не зникло разом зі звуженням
> [full-edit-stream](done/p1-full-edit-stream.md); брати лише за реальною потребою
> (станція з платним/приватним mountpoint).

## Опис

`StreamInfo` має `username` і `password`
([profile.rs:34-36](../../src-tauri/src/profile.rs#L34-L36)), і вони чесно
переживають копіювання/переміщення між профілями
(`prepare_transfer_stream`) та стираються при експорті
([profile.rs:570-625](../../src-tauri/src/profile.rs#L570-L625)). На цьому все
й закінчується — бракує трьох шарів:

1. **Шифрування.** [data-models.md](../data-models.md) стверджує, що паролі
   шифруються через Windows DPAPI (`CryptProtectData`) у форматі
   `"DPAPI:<base64>"`. У коді `CryptProtectData` немає — рядок `"DPAPI:abc"`
   зустрічається лише у тестових фікстурах
   ([stream_commands.rs:717](../../src-tauri/src/commands/stream_commands.rs#L717)).
   Тобто **документація випереджає код**, і пароль сьогодні ліг би у
   `profile.json` відкритим текстом.
2. **Передача при підключенні.** У `src-tauri/src` немає жодного `basic_auth`
   чи `Authorization`. Креденшли не бачить ні запис
   ([connection.rs:19](../../src-tauri/src/stream/connection.rs#L19) —
   єдина точка вихідного HTTP для рекордера), ні probe
   (`probe_once` у `stream_io_commands.rs`), ні плеєр
   ([player/engine.rs](../../src-tauri/src/player/engine.rs)).
3. **UI.** Полів немає ні в режимі додавання, ні в режимі редагування
   `AddStreamDialog`.

Через це auth і винесено з [full-edit-stream](done/p1-full-edit-stream.md): показати
два поля в діалозі — найменша частина роботи, і без інших двох шарів вони були б
декорацією.

## Відкриті питання

- **Крипто.** `windows`-крейт напряму (`Win32_Security_Cryptography`) чи готова
  обгортка? DPAPI прив'язує шифротекст до користувача Windows — чи прийнятно це
  для **портативного** застосунку, який носять на флешці між машинами? Якщо ні —
  чи це взагалі DPAPI, чи щось інше (парольна фраза профілю? нічого, але явне
  попередження в UI?). Це головна розвилка запису.
- **Схема автентифікації.** HTTP Basic (Icecast/Shoutcast-типове) достатньо, чи
  треба також креденшли в URL (`http://user:pass@host/...`), які частина станцій
  очікує? Що робити з 401 — окремий код помилки для UI чи загальний?
- **Probe.** Чи проганяти probe з креденшлами при додаванні (інакше приватний
  потік завжди «недосяжний» і додається лише через «Все одно»)?
- **Ротація й міграція.** Що робити з паролями, збереженими до появи шифрування
  (якщо такі виникнуть)? За AGENTS.md міграцій немає — імовірно просто стерти.
- **NVDA.** Поле пароля, повідомлення про 401, індикація «пароль збережено» без
  його зачитування.

## Критерії готовності

Уточнити після дослідження. Кістяк:

- [ ] Рішення про шифрування ухвалене й записане (зокрема — доля портативності)
- [ ] Пароль ніколи не лягає у `profile.json` відкритим текстом
- [ ] Креденшли доходять до рекордера, probe і плеєра — по одному тесту на шар
- [ ] Інваріант «експорт стирає пароль» не регресує
- [ ] [data-models.md](../data-models.md) приведено у відповідність із кодом
- [ ] Поля auth у `AddStreamDialog` + NVDA-прогін

## Документи

- Джерело: grooming [full-edit-stream](done/p1-full-edit-stream.md), 2026-08-07
- Код: [profile.rs](../../src-tauri/src/profile.rs) (`StreamInfo`, `export_json`),
  [connection.rs](../../src-tauri/src/stream/connection.rs) (`connect`),
  [stream_io_commands.rs](../../src-tauri/src/commands/stream_io_commands.rs) (`probe_once`),
  [player/engine.rs](../../src-tauri/src/player/engine.rs)
- [data-models.md](../data-models.md) — **містить drift**, звірити при реалізації
