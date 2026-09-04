---
slug: small-code-duplications
title: "Дрібні дублі: User-Agent у чотирьох місцях і другий атомарний писар JSON"
priority: P2
type: planned
status: done
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
completed: 2026-09-04
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/stream/connection.rs
  - src-tauri/src/stream/playlist.rs
  - src-tauri/src/browser/api.rs
  - src-tauri/src/crash_recovery.rs
  - src-tauri/src/store.rs
  - src-tauri/src/lib.rs
gates: [cargo test, cargo clippy]
notes:
  - "Аудит 2026-09-04: рядок User-Agent: Tapir/0.1.0 захардкожено в connection.rs, playlist.rs і двічі в browser/api.rs; тест versionSync його не бачить, тож після підняття версії заголовок брехатиме."
  - "crash_recovery::SessionState::save_to повторює tmp → write → sync_all → rename зі store::write_json_atomically."
---

# Дрібні дублі: User-Agent у чотирьох місцях і другий атомарний писар JSON

> **Контекст:** знахідка аудиту 2026-09-04. Два маленькі дублі, кожен з яких при
> наступній зміні розійдеться мовчки. Рішення очевидні, можна брати.

## Опис

**User-Agent.** Рядок `Tapir/0.1.0` стоїть окремо в
[connection.rs](../../../src-tauri/src/stream/connection.rs),
[playlist.rs](../../../src-tauri/src/stream/playlist.rs) і двічі в
[browser/api.rs](../../../src-tauri/src/browser/api.rs). Тест
[versionSync.test.ts](../../../src/lib/versionSync.test.ts) звіряє три файли з версією,
але цих рядків не знає. Після підняття версії до 0.2.0 станції й Radio Browser
бачитимуть 0.1.0. Заміна: одна константа, похідна від `CARGO_PKG_VERSION`, наприклад
`concat!("Tapir/", env!("CARGO_PKG_VERSION"))`, і чотири місця беруть її.

**Атомарний запис.** [crash_recovery.rs](../../../src-tauri/src/crash_recovery.rs)
має власну копію послідовності tmp, `write_all`, `sync_all`, `rename`, хоча
[store.rs](../../../src-tauri/src/store.rs) експортує `write_json_atomically` з тим самим
тілом, і `hotkey_busy.rs` уже ходить туди. Різниця лише в типі помилки:
`std::io::Error` проти `RadioError`. Інваріант «sync до rename» описано в коментарі
`store.rs`; друга копія це друге місце, де його можна зламати.

## Критерії готовності

- [x] `docs/help/` — запис видимої поведінки не змінює
- [x] `grep -r "Tapir/0.1.0" src-tauri/src` порожній; User-Agent береться з однієї
      константи, похідної від версії крейта
- [x] Послідовність tmp → sync → rename існує в коді один раз, у `store.rs`;
      `SessionState::save_to` викликає її
- [x] Тест `save_is_atomic_no_tmp_left_behind` у crash_recovery і далі зелений
- [x] `cargo test`, `cargo clippy` без помилок — 551 тест зелений, clippy без
      жодної помилки (попередження ті самі, що були до правки)

## Рішення (2026-09-04)

**Константа живе в корені крейта.** `crate::USER_AGENT` у
[lib.rs](../../../src-tauri/src/lib.rs) — `concat!("Tapir/", env!("CARGO_PKG_VERSION"))`.
Корінь, а не новий модуль і не `portable.rs`: споживачі стоять у двох різних
піддеревах (`stream/` і `browser/`), тож будь-який з них як господар константи
змусив би сусіда ходити через чужу область. Заголовок тепер не рядок, а похідна
версії, тож підняти версію й забути про нього більше не можна — сторожа для цього
не треба, бо ламати нема чого. Коментар
[versionSync.test.ts](../../../src/lib/versionSync.test.ts) дописано: споживачів
версії тепер троє, не двоє.

**Другого писаря немає.** `SessionState::save_to` — один рядок:
`store::write_json_atomically(path, "json.tmp", self)`. Розбіжність типів помилки
нічого не коштувала: `RadioError` уже має `From<std::io::Error>` і
`From<serde_json::Error>`, а всі три виклики `save()` у crash_recovery лише
логують `{e}`. Розширення tmp-файлу, `to_string_pretty` і порядок операцій —
ті самі, тож `save_is_atomic_no_tmp_left_behind` і `roundtrip_save_load`
лишились без правок і саме тому є доказом паритету. Коментар на `save_to`
більше не переказує інваріант, а посилається на його єдине місце.

## Документи

- [store.rs](../../../src-tauri/src/store.rs) — `write_json_atomically` і коментар про порядок sync/rename
- [versionSync.test.ts](../../../src/lib/versionSync.test.ts) — що саме сторож версії бачить, а що ні
