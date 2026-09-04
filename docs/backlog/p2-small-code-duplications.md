---
slug: small-code-duplications
title: "Дрібні дублі: User-Agent у чотирьох місцях і другий атомарний писар JSON"
priority: P2
type: planned
status: ready
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/stream/connection.rs
  - src-tauri/src/stream/playlist.rs
  - src-tauri/src/browser/api.rs
  - src-tauri/src/crash_recovery.rs
  - src-tauri/src/store.rs
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
[connection.rs](../../src-tauri/src/stream/connection.rs),
[playlist.rs](../../src-tauri/src/stream/playlist.rs) і двічі в
[browser/api.rs](../../src-tauri/src/browser/api.rs). Тест
[versionSync.test.ts](../../src/lib/versionSync.test.ts) звіряє три файли з версією,
але цих рядків не знає. Після підняття версії до 0.2.0 станції й Radio Browser
бачитимуть 0.1.0. Заміна: одна константа, похідна від `CARGO_PKG_VERSION`, наприклад
`concat!("Tapir/", env!("CARGO_PKG_VERSION"))`, і чотири місця беруть її.

**Атомарний запис.** [crash_recovery.rs#L65](../../src-tauri/src/crash_recovery.rs#L65)
має власну копію послідовності tmp, `write_all`, `sync_all`, `rename`, хоча
[store.rs](../../src-tauri/src/store.rs) експортує `write_json_atomically` з тим самим
тілом, і `hotkey_busy.rs` уже ходить туди. Різниця лише в типі помилки:
`std::io::Error` проти `RadioError`. Інваріант «sync до rename» описано в коментарі
`store.rs`; друга копія це друге місце, де його можна зламати.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] `grep -r "Tapir/0.1.0" src-tauri/src` порожній; User-Agent береться з однієї
      константи, похідної від версії крейта
- [ ] Послідовність tmp → sync → rename існує в коді один раз, у `store.rs`;
      `SessionState::save_to` викликає її
- [ ] Тест `save_is_atomic_no_tmp_left_behind` у crash_recovery і далі зелений
- [ ] `cargo test`, `cargo clippy` без помилок

## Документи

- [store.rs](../../src-tauri/src/store.rs) — `write_json_atomically` і коментар про порядок sync/rename
- [versionSync.test.ts](../../src/lib/versionSync.test.ts) — що саме сторож версії бачить, а що ні
