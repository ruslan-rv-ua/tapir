---
slug: hotkey-record-skips-disk-check
title: "Ctrl+Shift+R запускає запис без перевірки вільного місця"
summary: "Ctrl+Shift+R стартує запис усіх потоків повз поріг диску: тост «Розпочато запис», диск заповнюється до краю; вікно в тій самій ситуації відмовляє"
priority: P1
type: planned
status: ready
effort: S
kind: bug
target: 0.1.1
updated: 2026-09-24
a11y: true
depends_on: []
blocks: []
touches:
  - src-tauri/src/recording_control.rs
  - src-tauri/src/tray/notify.rs
  - src-tauri/src/i18n.rs
gates: [cargo test, cargo clippy --all-targets]
---

# Ctrl+Shift+R запускає запис без перевірки вільного місця

> **Контекст:** знахідка [огляду архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md).
> У v0.1.0 так само. `planned` + `ready` → **РЕАЛІЗАЦІЯ**. Номери рядків — стан на f09f36b.

## Опис

Коли вільного місця на диску теки записів менше за **Поріг диску (ГБ)** профілю, кожен шлях
старту запису відмовляє — крім гарячої клавіші «Запис (перемикання)», типово `Ctrl+Shift+R`.
Вона запускає запис усіх потоків активного профілю, і сповіщення в треї каже, що запис
розпочато. Далі запис пише, доки диск не заповниться фізично, і завершується помилкою з
обрізаними файлами. Типова тека `recordings` лежить поруч з exe (`profile.rs:209`,
`portable.rs:84`) — часто на системному диску. Суцільний файл ефіру типово увімкнений
(`profile.rs:225`), тож кожен потік пише ефір двічі: треками й суцільним файлом.

Трей пункту «записати все» не має (`tray/handlers.rs:18-31`, `tray/menu.rs:147-157` — лише
зупинка), CLI теж (`cli.rs:59-68`); `--record` іде через `start_recording` (`cli.rs:281`).

## Як відтворити

1. Жоден потік не записується. У налаштуваннях профілю, вкладка «Запис», поставити
   **Поріг диску (ГБ)** більшим за вільне місце на диску теки записів. Вільне місце в рядку
   стану стає бурштиновим, NVDA на ньому читає «Мало вільного місця: …».
2. Контроль: «Записати все» у вікні — тост «Замало вільного місця на диску — запис не
   розпочато», жоден потік не стартує.
3. Сховати вікно й натиснути `Ctrl+Shift+R`.
4. NVDA читає сповіщення «Розпочато запис: N потоків», і кожен потік справді пише — до
   повного диска.

## Що обіцяно

- Довідка «Як працює запис»: місце перевіряється перед стартом запису — «вашого, планового
  або піднятого після аварії» (`docs/help/uk/recording.md:39`, en :39); :9 там же називає
  `Ctrl+Shift+R` способом почати запис. «На диску закінчується місце»: нижче порогу жоден
  новий запис не почнеться (`docs/help/uk/troubleshooting.md:23`, en :23).
- `docs/architecture.md:391` (§8) — перевірка перед стартом; доккоментарі
  `scheduler/timer.rs:187` і `crash_recovery.rs:202` — «check_disk_space НЕ обходиться».

## Причина

- `recording_control::toggle_all` (`recording_control.rs:104-128`), гілка `Start`
  (:113-126): бере потоки й налаштування запису з активного профілю й одразу викликає
  `mgr.start_all(...)` (:120) — без `check_disk_space`. `StreamManager::start_all`
  (`stream/manager.rs:357-374`) сторожа не має — лише цикл `start_recording`.
- `check_disk_space` (`commands/stream_commands.rs:119-148`) кличуть `start_recording` (:554),
  `start_all_recordings` (:615), `scheduler/timer.rs:195`, `crash_recovery.rs:207` — кожен
  повторює послідовність старту сам, і п'ята копія, в `toggle_all`, розійшлася з рештою.
- Єдиний викликач `toggle_all` — гаряча клавіша (`shortcuts.rs:155-163`, прив'язка :20,
  комбінація `settings.rs:136`); `notify_recording_toggle` (`tray/notify.rs:239-249`) віддає
  `Started(n)` у `PluralKey::RecordAllStarted`.

## Виправлення

У межах наявного механізму; IPC і поверхні не змінюються.

1. `toggle_all`, гілка `Start`: спершу `check_disk_space(&state).await`, як у
   `start_all_recordings` (`stream_commands.rs:615` — перевірка, :628 — `start_all`). При
   `Err` — новий варіант `ToggleOutcome::DiskSpaceLow`, до менеджера не доходити; порожній
   профіль при малому місці теж дає відмову, як і там. Гілку `Stop` не чіпати.
   `ToggleOutcome` (`recording_control.rs:16-24`) не серіалізується — IPC не зачіпає.
2. Відповідь гілки `Start` — чиста функція поруч із `decide` (`recording_control.rs:51`):
   вердикт диска й старт (замиканням) → `DiskSpaceLow` / `NothingToStart` / `Started(n)`.
3. `notify_recording_toggle`: `DiskSpaceLow` → `record_refused_disk_space`, той самий текст,
   що вікно показує на цю відмову (`src/lib/recordingToggle.ts:50-51`); тіло тоста — чиста
   функція за зразком `transport_failure_body` (`tray/notify.rs:276`). Чисел у тості немає,
   їх пише `warn!` (`stream_commands.rs:144`) — рішення record-refusals-untranslated.
4. `i18n.rs`: у `Key` (:88), до ключів, спільних із вікном (:113-126), —
   `RecordRefusedDiskSpace => "record_refused_disk_space"`. **Нового ключа в
   `messages/*.json` не треба:** рядок є в обох мовах (`uk.json:188`, `en.json:188`), а
   `i18n.rs` вшиває ці файли (:20-21).
5. Категорія — наявна `ToastKind::BackgroundFeedback`: відмова — відповідь на дію людини у
   фоні, як і старт. Приклад «про місце на диску» з «Коли переглянути» ADR про категорії
   тостів — про непрошений сигнал нагляду з p2-disk-space-monitor, не про цю відповідь.

## Поза межами

- **Нагляд за місцем після старту** — [p2-disk-space-monitor](p2-disk-space-monitor.md). Той
  запис спирається на перевірку перед стартом на всіх шляхах; цей робить її правдою.
- **Усунення класу** (старт скопійовано в п'ять місць) — ідея
  [recording-control-owns-every-start](p2-recording-control-owns-every-start.md). Автотест
  самого виклику перевірки в `toggle_all` чекає на той шов: жоден тест не будує `AppState`.
- **Поверхня відповіді** `notify_recording_toggle` не змінюється: відмова йде тією самою, що
  й старт сьогодні (ADR 2026-09-01, §4).

## Критерії готовності

- [ ] `docs/help/` не змінюється: довідка вже обіцяє цю поведінку (`recording.md:39`,
      `troubleshooting.md:23` в обох мовах), виправлення робить обіцянку правдою
- [ ] Нижче порогу `Ctrl+Shift+R` не стартує жодного потоку; поріг `0` перевірку вимикає, як
      і на решті шляхів; зупинка тією самою клавішею працює без змін
- [ ] Rust-тест у `recording_control.rs`: на відмову диска — `DiskSpaceLow`, і замикання
      старту не викликано; на згоду — `Started(n)` / `NothingToStart`, як досі
- [ ] Тост відмови — категорія `BackgroundFeedback`; Rust-тест у `tray/notify.rs`: його тіло в
      uk і en — `record_refused_disk_space`, а не «Розпочато запис»; `messages/*.json` не
      змінено, новий `Key` покриває `every_key_exists_in_both_locales` (`i18n.rs:216`)
- [ ] Доккоментарі модуля (`recording_control.rs:1-7`) і `toggle_all` (:102-103) називають
      перевірку
- [ ] NVDA: поріг вище за вільне місце, вікно сховане, `Ctrl+Shift+R` → NVDA читає «Замало
      вільного місця на диску — запис не розпочато»; у показаному вікні жоден потік не пише.
      Чекліст: [nvda-hotkey-record-skips-disk-check.json](../testing/nvda-hotkey-record-skips-disk-check.json)
- [ ] `cargo test`, `cargo clippy --all-targets` зелені

## Документи

- [Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md) — звідки знахідка
- [p2-disk-space-monitor](p2-disk-space-monitor.md) — нагляд після старту;
  [recording-control-owns-every-start](p2-recording-control-owns-every-start.md) — усуває клас
- [record-refusals-untranslated](done/p2-record-refusals-untranslated.md) — звідки
  `record_refused_disk_space` і `RadioError::DiskSpaceLow`; шлях клавіші пропустив
- Довідка [recording](../help/uk/recording.md), [troubleshooting](../help/uk/troubleshooting.md)
  (en — близнюки); обіцянки писали [help-recording](done/p1-help-recording.md) і
  [help-troubleshooting](done/p1-help-troubleshooting.md)
- ADR: [категорії тостів](../decisions/2026-08-17-tray-toast-categories.md),
  [вухо, вікно, система](../decisions/2026-09-01-response-surfaces-ear-window-system.md) §4,
  [локалізація нативного шару](../decisions/2026-08-17-native-layer-localisation.md) §2;
  [architecture.md](../architecture.md) §8; [CONTEXT.md](../../CONTEXT.md) §«Сповіщення в треї»
- Код: `src-tauri/src/recording_control.rs`, `src-tauri/src/tray/notify.rs`, `src-tauri/src/i18n.rs`
