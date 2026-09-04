---
slug: paraglide-native-plurals
title: "Множина через варіанти Paraglide замість суфіксів ключів і п'яти Intl.PluralRules"
priority: P2
type: research
status: ready
effort: M
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: []
blocks: []
touches:
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - src-tauri/src/i18n.rs
  - src/components/streams/StreamsPanel.tsx
  - src/components/songs/SongsPanel.tsx
  - src/components/layout/StatusBar.tsx
  - src/components/profile/ProfileItem.tsx
  - src/hooks/useCrashResumeFeedback.ts
  - package.json
gates: [cargo test, pnpm test, pnpm vite:build]
notes:
  - "Аудит 2026-09-04: 14 родин ключів із суфіксами _zero/_one/_few/_many; Intl.PluralRules створюється в п'яти компонентах із запасним document.documentElement.lang || uk; Rust тримає власне правило CLDR для uk і мапить en у one/many."
  - "Paraglide JS 2.x підтримує варіанти з селектором plural у форматі повідомлень inlang; проєкт на 2.15.3, у реєстрі 2.25.0."
  - "Ті самі JSON читає Rust-шар трею (ADR native-layer-localisation). Масивна форма варіантів зламає його парсер, і cargo test це впіймає: перед міграцією потрібне рішення для другого споживача."
---

# Множина через варіанти Paraglide замість суфіксів ключів і п'яти Intl.PluralRules

> **Контекст:** знахідка аудиту 2026-09-04. Форми множини реалізовано власною
> конвенцією поверх Paraglide, хоча Paraglide 2 має варіанти з `plural`. Дослідження:
> чи покриває нативний механізм усі випадки Tapir, і що робити з Rust-споживачем.

## Опис

Сьогодні множина живе у двох шарах, які треба тримати в голові одночасно:

- **Ключі** `record_all_announce_zero`, `_one`, `_few`, `_many` і ще 13 родин
  (`active_recordings`, `browser_probe_failed`, `crash_resume_all`, `errors_count`,
  `profile_stream_count`, `profile_switch_scheduled`, `recordings_count`,
  `songs_loaded`, `streams_count`, `streams_examples_added`, `streams_filter_changed`,
  `tray_quit_confirm_scheduled`, `tray_stop_all`).
- **Вибір форми** у п'яти компонентах через `new Intl.PluralRules(...)` з різними
  джерелами локалі: `settings?.language`, `document.documentElement.lang`, `getLocale()`
  і запасне `"uk"`. Один і той самий алгоритм у п'яти копіях із трьома різними
  входами.
- **Rust** ([i18n.rs](../../src-tauri/src/i18n.rs)) читає ті самі JSON і має власне
  правило `one / few / many` для `uk` та `one / many` для `en`, плюс окремий випадок
  `zero` як «випадок застосунку, а не форма мови».

Paraglide 2 підтримує варіанти в самому повідомленні: `declarations` з
`local countPlural = count: plural`, `selectors`, і `match` на `countPlural=one`,
`few`, `many`, `other`. Форму обирає `Intl.PluralRules` усередині згенерованого коду,
виклик стає `m.streams_count({ count })`, а п'ять копій вибору зникають.

## Що з'ясувати

- [ ] Чи дає inlang-формат точний збіг за значенням `count=0` поруч із категоріями
      множини, щоб зберегти окремий текст для нуля («Запис не йшов»), або нуль
      доведеться розводити в коді
- [ ] Англійська: CLDR дає `one / other`, а поточні ключі `_many`; при міграції
      `en` мусить дістати `other`, і Rust-мапінг `en` у `many` теж
- [ ] Rust-споживач: `i18n::parse` десеріалізує JSON у `HashMap<String, String>` і
      впаде на масиві. Варіанти: (а) навчити `i18n.rs` читати форму варіантів для
      своїх чотирьох родин; (б) мігрувати лише родини, яких Rust не читає, а
      `record_all_announce`, `tray_stop_all`, `active_recordings` і
      `tray_quit_confirm_scheduled` лишити на суфіксах; (в) не мігрувати, а звести
      п'ять `Intl.PluralRules` в один хелпер `pluralize(key, count)`
- [ ] Оновлення `@inlang/paraglide-js` з 2.15.3 до 2.25.0: чи змінився вихідний код
      для `messages.js` і `runtime.js` так, що це зачіпає `typecheck-gate`
- [ ] Чи бачить `pnpm test` нові ключі без перегенерації (відома пастка: vitest без
      плагіна paraglide читає те, що лежить на диску)

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] Звіт у цьому записі з відповідями на кожне питання вище і рекомендацією
      серед (а), (б), (в)
- [ ] Якщо рекомендація (а) або (б): окремий запис `type: planned` з переліком родин
      і планом для `i18n.rs`; сторож `every_plural_family_has_all_four_forms_in_both_locales`
      переписується під нову форму
- [ ] Якщо (в): той самий запис, але без змін у JSON

## Документи

- [ADR: локалізація нативного шару](../decisions/2026-08-17-native-layer-localisation.md) — чому Rust читає ті самі JSON
- [i18n.rs](../../src-tauri/src/i18n.rs) — правило множини й тест на чотири форми
- документація варіантів inlang: https://github.com/opral/paraglide-js/blob/main/docs/variants.md
