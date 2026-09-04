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

## Результати дослідження (2026-09-04)

Джерела — не переказ, а самі артефакти: компілятор і його тести у встановленому
`@inlang/paraglide-js@2.15.3` (`node_modules/@inlang/paraglide-js/dist/compiler/`),
кешований `plugin.inlang.messageFormat` (`project.inlang/cache/plugins/3fhvg7lmyjji3`),
CLDR `plurals.xml`, метадані реєстру npm, CHANGELOG paraglide і код на HEAD.
Варіантну форму не звіряли з документацією: її **скомпілював цей самий компілятор**
у чернетковому проєкті поза репозиторієм, а результат виконали в node. Так само
поведінку `serde_json` перевірено окремим крейтом, а не за аналогією.

### Формат: варіанти живуть у тих самих файлах, але значення перестає бути рядком

`project.inlang/settings.json` вмикає `plugin.inlang.messageFormat` із
`pathPattern: "./src/i18n/messages/{languageTag}.json"` — тобто змінювати плагін чи
розкладку файлів **не доведеться**. Плагін читає обидві форми значення: рядок — просте
повідомлення, масив — складне. У кеші плагіна `parseVariants` починається саме з цієї
розвилки (`if (typeof value === "string") … const complexMessage = value[0]`), а
`parseMatches` розбирає ключ `match` як список `ключ=значення` через кому, де `*` —
catchall.

Ціна: `"streams_count": "…"` стає `"streams_count": [{ declarations, selectors, match }]`.
Тип значення в JSON змінюється для мігрованих ключів — і саме цим ламає другого
споживача (див. питання 3).

### 1. Точний збіг `count=0` — є, і працює у встановленій версії

**Так**, окремий текст для нуля зберігається без коду: `count` оголошується як
`input`, `countPlural` — як `local … = count: plural`, обидва йдуть у `selectors`, а
`count=0` матчиться як літерал поруч із категоріями CLDR.

Компілятор розрізняє два типи змінних у `match`: для `input-variable` він генерує
порівняння значення (`renderInputMatchCondition` у `dist/compiler/match-literals.js`),
для `local-variable` — порівняння категорії (`compile-message.js`). Перевірка на живому
компіляторі 2.15.3 дала:

```js
const uk_streams_count = (i) => {const countPlural = registry.plural("uk", i?.count, {});
	if ((i?.count === 0 || i?.count === "0")) return `Потоків немає`;
	if (countPlural === "one") return `${i?.count} потік`;
	if (countPlural === "few") return `${i?.count} потоки`;
	if (countPlural === "many") return `${i?.count} потоків`;
	return `${i?.count} потоку`
};
```

Виконання: `0` і `"0"` однаково дають нульовий текст, `1→потік`, `2→потоки`,
`5→потоків`, `21→потік`, `22→потоки`. Подвійне порівняння з числом і рядком — це рівно
той фікс, який приїхав у **2.15.3** («Fix numeric input match inference so generated
message typings accept both numeric and string literal forms»), тобто поточні виклики зі
`String(count)` ([SongsPanel.tsx:138](../../src/components/songs/SongsPanel.tsx:138),
[useCrashResumeFeedback.ts:30](../../src/hooks/useCrashResumeFeedback.ts:30)) працювали б
без правок. Тип входу лишається `NonNullable<unknown>`, бо `count` має catchall у решті
варіантів (`jsdoc-types.js::resolveInputType`) — `typecheck` не звужується.

**Пастка порядку.** Компілятор кладе варіанти в тому порядку, в якому вони стоять у
`match`, а повний catchall друкує **безумовним** `return`. Якщо catchall стоїть першим,
усі наступні гілки стають мертвим кодом — мовчки, без попередження:

```js
	return `CATCHALL ${i?.count}`
	if ((i?.count === 0 || i?.count === "0")) return `ZERO`;   // недосяжно
```

Порядок ключів у JSON стає семантикою. Жоден лінт inlang цього не ловить.

### 2. Англійська: CLDR дає `one / other`, `_many` — вигадка Tapir

**Підтверджено.** CLDR (`common/supplemental/plurals.xml`) для `en` має рівно два
кардинальні правила: `one` (`i = 1 and v = 0`) і `other`. `Intl.PluralRules("en")`
повертає `["one","other"]`. Для `uk` — чотири: `one`, `few`, `many` і `other`, причому
`other` існує (дробові: `@decimal 0.0~1.5`), тож у `uk` теж потрібна гілка `*`, хоча
цілими числами вона недосяжна.

Наслідки при міграції: `en`-варіанти отримують `countPlural=*` замість `_many`, а
`plural_suffix` у Rust ([i18n.rs:155](../../src-tauri/src/i18n.rs:155)) — `Locale::En =>
if n == 1 { "one" } else { "other" }` разом із тестом `english_plural_is_one_or_many`
([i18n.rs:253](../../src-tauri/src/i18n.rs:253)). Зауваження на полях:
`profile_stream_count` **уже** живе на `_other`, а не на `_zero`
([uk.json](../../src/i18n/messages/uk.json)), тобто одна з чотирнадцяти родин має іншу
форму, ніж описано в записі.

### 3. Rust-споживач: варіант (б) у нинішньому формулюванні неможливий

`parse` десеріалізує **цілий файл** у `HashMap<String, String>`
([i18n.rs:63](../../src-tauri/src/i18n.rs:63)) і падає на першому ж масиві — байдуже,
читає Rust цей ключ чи ні. Перевірено окремим крейтом на `serde_json` 1:

```
HashMap<String,String>: ERR = invalid type: sequence, expected a string
HashMap<String,Value>:  OK
```

Тобто **не існує підмножини родин, яку можна мігрувати, не торкаючись `i18n.rs`**.
Оскільки `parse` викликається з `OnceLock` при першому ж `lookup`, паніка накриває всі
нативні поверхні, а в тестах — не один сторож, а кожен тест, який заходить в i18n:
`every_key_exists_in_both_locales` ([i18n.rs:215](../../src-tauri/src/i18n.rs:215)),
`every_plural_family_has_all_four_forms_in_both_locales`
([i18n.rs:228](../../src-tauri/src/i18n.rs:228)), `locale_switches_the_string`, плюс
тести трею через `menu.rs` і `notify.rs`.

Мінімальний обсяг «навчити Rust читати варіанти» (варіант (а)):

1. `HashMap<String, Value>` або власний `enum Message { Plain(String), Complex(..) }`.
2. Розбір `declarations`, щоб знати, яка `local` — це `count: plural`.
3. Обчислення категорії CLDR (правило вже є, мінус штучний `zero`).
4. Обхід `match` із **позиційною** семантикою paraglide — і ось тут головна засада:
   `serde_json` без фічі `preserve_order` тримає об'єкт у `BTreeMap`, тобто віддає
   ключі **відсортованими**. Перевірено:

   ```
   count=*, countPlural=*      ← повний catchall іде ПЕРШИМ
   count=*, countPlural=few
   count=*, countPlural=many
   count=*, countPlural=one
   count=0, countPlural=*      ← точний нуль іде ОСТАННІМ
   ```

   Наївний порт «перший збіг виграє» повертав би catchall на будь-яке число. Лікується
   або фічею `preserve_order` (indexmap і зміна поведінки `serde_json` в усьому
   застосунку — а він там і в налаштуваннях, і в станах), або власним матчером за
   специфічністю, який **свідомо розходиться** з семантикою paraglide. Друга реалізація
   того самого алгоритму — рівно той клас розбіжності, проти якого написано
   [ADR](../decisions/2026-08-17-native-layer-localisation.md).

Rust читає чотири родини, але лише три — через `t_plural` (`PluralKey`:
`record_all_announce`, `tray_stop_all`, `active_recordings`,
[i18n.rs:128](../../src-tauri/src/i18n.rs:128)); `tray_quit_confirm_scheduled_one/_many`
живуть як звичайні `Key` і обираються за `len() == 1`
([tray/notify.rs:65](../../src-tauri/src/tray/notify.rs:65)), а не за числом.

### 4. Оновлення 2.15.3 → 2.25.0: для цієї задачі не потрібне

`package.json` тримає `"@inlang/paraglide-js": "^2.15.3"`, `pnpm-lock.yaml` — `2.15.3`,
у реєстрі `dist-tags.latest = 2.25.0` (опубліковано 2026-08-27; **версії 2.15.4 у
реєстрі немає** — між 2.15.3 і 2.16.0 порожньо). Варіанти з `plural` і точний збіг за
числом працюють уже на встановленій версії, тож бамп — окреме рішення, а не частина
міграції.

Що зі змін між ними реально зачіпає проєкт:

- **2.23.0**, patch: «Use `baseLocale` as the exhaustive branch in generated message
  functions». Змінює форму згенерованих `messages/*.js`: зараз вичерпна гілка — `en`
  (`if (locale === "uk") … return en_…`), стане `uk` (`baseLocale`). На типи не впливає,
  але невідома локаль почне падати в українську замість англійської.
- **2.20.0**: у `outdir/messages/` з'являється `package.json` із
  `{"type":"module","sideEffects":false}`. Тека згенерована й у `.gitignore`, але це
  новий файл усередині `src/`, який бачить `tsconfig.include: ["src", "build"]`.
- **2.24.0/2.24.1**: перехід на `@inlang/sdk` v3 (+ Lix WASM). Найбільший ризик бампа —
  саме тут: плагіни підтягуються з jsDelivr за `@latest`
  ([settings.json](../../project.inlang/settings.json)), і сумісність кешованого
  `plugin.inlang.messageFormat` із SDK v3 з першоджерела не встановлена.
- **peerDependencies 2.25.0**: `vite >= 5.0.0` і `typescript >= 5.6`, обидва `optional`.
  Проєкт на `vite ^8` і `typescript ^5.7` — проходить.
- **2.21.0** (`emitTsDeclarations` під TypeScript 7) і **2.22.0/2.23.0**
  (`experimentalPerLocaleBuild`) проєкту не стосуються: жодна з цих опцій у
  [vite.config.ts](../../vite.config.ts) не ввімкнена.

Форма виклику `paraglideVitePlugin({ project, outdir })` не змінювалась.

### 5. `pnpm test` нових ключів не бачить — пастка реальна

**Підтверджено з конфігів.** [vitest.config.ts](../../vitest.config.ts) свідомо не
підключає плагін paraglide (коментар там же), тож тести резолвлять те, що вже лежить у
`src/i18n/paraglide/`. Тека в [.gitignore](../../.gitignore) — на чистому клоні її немає
взагалі, тому [justfile](../../justfile) ставить `pnpm vite:build` **першим** у `check`.
Новий або перейменований ключ без перегенерації дає `TypeError` у тесті й `TS2339` у
`typecheck`.

Три уточнення до пастки:

- Сторожі, що читають JSON напряму (`import uk from "./messages/uk.json"`), її обходять —
  таких три: `autoplayLabel.test.ts`, `patternHint.test.ts`, `recordingBadge.test.ts`.
  Жоден із них не торкається родин множини, тож міграція їх не зачіпає.
- Сім тестів мокають ключі з суфіксами поіменно (`ProfileItem`, `ProfileList`,
  `ProfilesPanel`, `StreamTransferDialog`, `useBrowserProbeFeedback`,
  `useCrashResumeFeedback`, `scheduleFormat`) — усі сім переписуються при будь-якому
  варіанті, крім (в).
- Побічно: поруч живе **застаріла тека `src/paraglide/`** (15 червня, ігнорується
  власним `.gitignore`, жодного імпорту в коді). Слід колишнього `outdir`.

### Розбіжності з описом запису

- **Не п'ять `Intl.PluralRules`, а шість.** Пропущено
  [StreamTransferDialog.tsx:10](../../src/components/streams/StreamTransferDialog.tsx:10)
  (`getLocale()`), якого немає й у `touches:`. Решта:
  [StatusBar.tsx:58](../../src/components/layout/StatusBar.tsx:58),
  [ProfileItem.tsx:39](../../src/components/profile/ProfileItem.tsx:39),
  [SongsPanel.tsx:130](../../src/components/songs/SongsPanel.tsx:130),
  [StreamsPanel.tsx:89](../../src/components/streams/StreamsPanel.tsx:89),
  [useCrashResumeFeedback.ts:18](../../src/hooks/useCrashResumeFeedback.ts:18).
- **Запасне значення — не `"uk"`, а `"en"`.** `document.documentElement.lang || "uk"`
  ніколи не бере праву гілку: [index.html](../../index.html) віддає `<html lang="en">`,
  а перезаписує його лише [App.tsx:146](../../src/App.tsx:146) **після** того, як
  резолвиться `getSettings()`.
- **З цього виростає жива вада.** `useCrashResumeFeedback` кличеться на першому рендері
  [App.tsx:435](../../src/App.tsx:435) і мемоїзує правила з `deps: []` — тобто назавжди
  фіксує **англійські** правила. Українцю `select(3)` дає `other`, ланцюжок тернарників
  падає в `_many`, і замість «Відновлено 3 записи» звучить «3 записів». `StatusBar` від
  цього застрахований (створює правила щорендеру), `SongsPanel` — фактично теж
  (монтується після завантаження налаштувань).
- **Три з чотирнадцяти «родин» — не множина взагалі.** `browser_probe_failed`,
  `profile_switch_scheduled` і `tray_quit_confirm_scheduled` обираються за `len() == 1`,
  а не через `Intl.PluralRules`, і їхні гілки мають **різні** підстановки (`{name}`
  проти `{count}`/`{checked}`; `{list}` проти `{name}`/`{end}`). Перевірено: варіантна
  форма зводить їх в один тип входу, де **всі** підстановки обов'язкові —
  `{ count: …, name: …, checked: … }`. Для цих трьох міграція — регрес типів, а не
  виграш. Справжніх родин множини одинадцять.
- **Одна поверхня, дві локалі.** У `StatusBar`, `SongsPanel`, `StreamsPanel` і
  `useCrashResumeFeedback` **форму** обирає `document.documentElement.lang` /
  `settings.language`, а **текст** дістає `m.*()`, тобто `getLocale()` зі стратегією
  `["cookie","globalVariable","baseLocale"]` (`baseLocale = "uk"`), яку виставляє лише
  [GeneralTab.tsx:56](../../src/components/settings/GeneralTab.tsx:56). Це два незалежні
  входи в одне речення.

### Рекомендація

**(в) — звести вибір форми в один хелпер, JSON не чіпати.**

Причини, у порядку ваги:

1. Те, що болить, — не суфікси, а шість копій вибору з двома різними входами, і одна з
   них уже дає неправильну форму (див. вище). Хелпер із **єдиним** джерелом локалі —
   `getLocale()`, бо саме воно обирає текст, який форма мусить узгодити, — лікує це
   повністю, не торкаючись ані JSON, ані Rust, ані `cargo test`.
2. (б) у формулюванні запису неможлива: `serde_json` падає на масиві **будь-де** у
   файлі, не лише в прочитаних ключах. Реалістична (б′) — «мігрувати частину плюс
   навчити Rust не давитись» — лишає в одному файлі дві конвенції, а на фронтенді два
   механізми (бо `active_recordings` і `record_all_announce` спільні з Rust і лишаються
   на суфіксах). Це дорожче за обидва краї.
3. (а) вимагає другої реалізації матчера у Rust, і сортований `BTreeMap` у `serde_json`
   робить наївний порт не просто складнішим, а **тихо неправильним**. Ціна — або
   глобальна фіча `preserve_order`, або свідома розбіжність семантики з компілятором,
   який читає той самий файл.
4. Виграш (а) менший, ніж здається: три з чотирнадцяти родин від варіантів псуються
   (обов'язкові чужі підстановки), а порядок ключів у JSON стає невидимою семантикою,
   яку ніхто не сторожить.

**Головний ризик (в):** конвенція `_zero/_one/_few/_many` лишається і далі бреше про
англійську (`_many` там, де CLDR каже `other`) — третя мова відкриє це боляче.
Пом'якшення дешеве й у межах того самого запису: хелпер приймає **категорію CLDR**, а не
суфікс, і мапить `other → _many` в одному місці, з коментарем, чому ключ зветься так.

Другий ризик — хелпер стане сьомим джерелом локалі, якщо дати йому параметр `locale`.
Він не повинен його мати.

Побічно (в) робить (а) дешевшою назавтра: коли вибір форми стоїть в одному місці,
перехід на варіанти — це видалити хелпер, а не переписати шість компонентів.

### Джерела

- документація варіантів paraglide: https://github.com/opral/paraglide-js/blob/main/docs/variants.md
- CHANGELOG paraglide (2.15.0–2.25.0): https://raw.githubusercontent.com/opral/paraglide-js/main/CHANGELOG.md
- метадані npm (`dist-tags`, `time`, `peerDependencies`): https://registry.npmjs.org/@inlang/paraglide-js
- CLDR, кардинальні правила `uk` і `en`: https://raw.githubusercontent.com/unicode-org/cldr/main/common/supplemental/plurals.xml
- компілятор 2.15.3 на диску: `node_modules/@inlang/paraglide-js/dist/compiler/`
  (`match-literals.js`, `compile-message.js`, `compile-bundle.js`, `jsdoc-types.js`,
  `compile-local-variable.js`) і його тести (`compile-message.test.js`,
  `compile-project.test.js`)
- кешований `plugin.inlang.messageFormat`: `project.inlang/cache/plugins/3fhvg7lmyjji3`
  (`importFiles`, `parseVariants`, `parseMatches`, `serializeVariants`)
- власні прогони поза репозиторієм: компіляція трьох чернеткових проєктів цим самим
  `paraglide-js compile` і крейт на `serde_json` 1 — код у скретчпаді сесії, жодного
  файлу проєкту не змінено
