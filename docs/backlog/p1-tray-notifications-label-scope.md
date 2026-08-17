---
slug: tray-notifications-label-scope
title: "Прапорець «Сповіщення при зміні треку» вимикає й сповіщення розкладу"
priority: P1
type: planned
status: in-progress
effort: M
kind: bug
target: 0.1.0
updated: 2026-08-17
a11y: false
depends_on: []
blocks: []
touches:
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - src/components/profile/ProfileInterfaceTab.tsx
  - src/components/profile/ProfileSettingsDialog.test.tsx
  - src/components/settings/GeneralTab.test.tsx
  - src/components/streams/StreamsPanel.test.tsx
  - src/stores/streams.test.ts
  - src/lib/tauri.ts
  - src-tauri/src/tray/notify.rs
  - src-tauri/src/profile.rs
  - CONTEXT.md
  - docs/data-models.md
  - docs/decisions/2026-08-17-tray-toast-categories.md
  - docs/decisions/2026-08-08-global-vs-profile-settings-boundary.md
  - docs/help/uk/background.md
  - docs/help/uk/scheduling.md
  - docs/help/uk/settings.md
  - docs/help/en/background.md
  - docs/help/en/scheduling.md
  - docs/help/en/settings.md
gates: [pnpm vite:build, pnpm test, cargo test]
notes:
  - "Знахідка grilling help-automation (2026-08-13): підпис вужчий за поведінку — той самий клас, що player-recording-badge-term."
  - "Розвилку знято на grilling 2026-08-17: два незалежні прапорці; рішення й відхилені варіанти — в ADR tray-toast-categories."
  - "Принагідно: uk-мітка «Згортати до tray» → «до трею» — єдина латиниця в українському інтерфейсі."
---

# Прапорець «Сповіщення при зміні треку» вимикає й сповіщення розкладу

> **Контекст:** знайдено під час grilling `help-automation`. Мітка описує один сценарій,
> а прапорець керує двома, причому другий — єдиний зворотний зв'язок для фічі, сенс якої
> «не сидіти біля комп'ютера».

## Опис

Прапорець у налаштуваннях профілю (вкладка «Інтерфейс») підписаний **«Сповіщення при
зміні треку»** / "Notifications on track change", модель за ним — `ui.trayNotifications`.
Цей самий прапорець читають **дві** різні поверхні: сповіщення про зміну треку і **всі**
сповіщення планувальника («розпочато», «завершено, записано N хв», «пропущено: причина»,
«не стартував: потік уже записується»).

Тобто людина, яка вимкнула балаканину про кожен трек — цілком розумна дія на п'яти
одночасних записах, — тихо втратила й повідомлення про плановий запис. Мітка про це не
попереджає, а наслідок помітний рівно тоді, коли він найдорожчий: увечері з'ясовується,
що передача не записалась, і жодне сповіщення про це не спливло.

## Рішення

Розвилку («перейменувати чи розділити») знято на grilling 2026-08-17. Прийнято **два
незалежні прапорці**; повне рішення з відхиленими варіантами —
[ADR про категорії тостів](../decisions/2026-08-17-tray-toast-categories.md). Стисло:

- категорій тостів три — зміна треку, плановий запис, зворотний зв'язок хоткея;
  прапорцем вимикається те, що лишає **інший слід**, а третя категорія не гейтиться
  ніколи;
- поля: `ui.trayNotificationsTrackChange` і `ui.trayNotificationsScheduled`, обидва
  типово ввімкнені; старе `trayNotifications` зникає без міграції (`UiSettings` без
  `deny_unknown_fields`, до релізу це безкоштовно);
- мітки називають поверхню: «Сповіщення в треї про зміну треку» / «…про плановий запис»
  — оголошення у вікні гейт не накриває, тож без «в треї» друга мітка обіцяла б зайве;
- другий прапорець накриває всі чотири події планувальника, включно з провалами: слід
  від них лишається в списку розкладу завжди;
- правило перестає бути коментарем: `ToastKind` + `is_enabled(kind, &UiSettings)` у
  `notify.rs`, категорія — обов'язковий аргумент єдиної функції показу.

Без групи (`role="group"`) свідомо: підпис групи не оголошується, поки в неї не зайти.
Тому `a11y: false` — нової структури не з'являється, лише другий такий самий прапорець.

## Критерії готовності

- [x] Два прапорці у вкладці «Інтерфейс», обидві мітки називають поверхню («в треї»)
- [x] Усі чотири сповіщення планувальника слухають власний прапорець і не залежать від
      прапорця зміни треку
- [x] `notify_recording_toggle` / `notify_stop_all` не гейтяться жодним, і це видно з
      `ToastKind::HotkeyFeedback`, а не з коментаря
- [x] Профіль зі старим `trayNotifications` читається без помилки, обидві категорії
      піднімаються ввімкненими (тест у `profile.rs`)
- [x] Латиниці «tray» в українських рядках не лишилось
- [x] Довідка: `scheduling.md` без застереження «попри назву»; `background.md` і
      `settings.md` називають актуальні мітки (uk + en)
- [x] ADR про категорії тостів написано; у ADR 2026-08-08 звірено ім'я поля, статус
      ПРИЙНЯТО без змін; `CONTEXT.md` §«Сповіщення в треї»
- [ ] Ручна перевірка: пройти Tab'ом по вкладці «Інтерфейс» — обидва прапорці називають
      повну мітку
- [x] `pnpm vite:build`, `pnpm test`, `cargo test` — без помилок

## Документи

- [ADR: категорії тостів](../decisions/2026-08-17-tray-toast-categories.md) — рішення,
  відхилені варіанти, коли переглядати
- [CONTEXT.md](../../CONTEXT.md) §«Сповіщення в треї» — три категорії, «сповіщення ≠
  оголошення», слово «трей»
- [help-content-polish](done/p1-help-content-polish.md) — мапа покриття `scheduling.md`
  (пункт «Сповіщення»), конвенція розмітки 5
- [help-automation](done/p1-help-automation.md) — запис, що описує поточну поведінку як є
- `src-tauri/src/tray/notify.rs` (`ToastKind`, `is_enabled`, `show_toast`),
  `src-tauri/src/scheduler/timer.rs`
