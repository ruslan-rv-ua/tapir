---
slug: full-edit-stream
title: "Редагування URL потоку"
priority: P1
type: planned
status: done
effort: M
kind: feature
target: 0.1.0
updated: 2026-08-07
completed: 2026-08-07
a11y: true
depends_on: []
blocks: []
touches:
  - src-tauri/src/commands/stream_commands.rs
  - src-tauri/src/naming.rs
  - src/lib/tauri.ts
  - src/components/streams/AddStreamDialog.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Винесено з rename-only F2-беклога (2026-06-23); той реалізовано в ee9a704 — F2/edit-режим AddStreamDialog уже в продакшені"
  - "Grooming 2026-08-07: скоуп звужено з «URL / auth / ignorelist» до самого URL; auth → stream-auth, per-stream ignorelist → per-stream-ignorelist-ui. Slug і ім'я файлу стабільні (README), звузився лише title"
  - "Вимогу «back-compat серіалізації update_stream» із чернетки знято: AGENTS.md — «Breaking changes are expected at any time — no migrations, no backward-compatibility guarantees»"
  - "Блокування поля URL під час запису — UX-рішення, не захист від збою: recording_task копіює url і name один раз на старті (manager.rs:583-584), тож весь 'reconnect-цикл живе на старій адресі й зміна в профілі йому нічим не загрожує"
  - "Реалізація 2026-08-07: замість нативного `disabled` поле замикається через `readOnly` + `aria-disabled` — нативний disabled випадає з обходу по Tab, і NVDA ніколи б не дійшов ні до поля, ні до його `aria-describedby`. Це домашній патерн репо (SelectionToolbar, ActivityBar: «aria-disabled (NOT native disabled)»). Критерій «поле URL disabled» читати як «недоступне для правки»"
---

# Редагування URL потоку

> **Контекст:** groomed 2026-08-07, `ready` — рішення нижче ухвалені, брати можна
> без додаткового обговорення. Читати першим розділ «Прийняті рішення»: він
> задає і скоуп, і поведінку діалогу.

## Опис

Сьогодні «редагування» потоку = **тільки перейменування**. І UI, і backend
обмежені назвою: поле URL у edit-режимі приховане
([AddStreamDialog.tsx:180](../../../src/components/streams/AddStreamDialog.tsx#L180)),
`update_stream` приймає лише `name`
([stream_commands.rs:394-417](../../../src-tauri/src/commands/stream_commands.rs#L394-L417)),
і `tauri.updateStream` пробрасує теж лише `name`
([tauri.ts:196](../../../src/lib/tauri.ts#L196)).

**Реальна потреба:** станція переїхала на новий URL → зараз єдиний шлях це
видалити потік і додати наново, втративши позицію в списку, `id`, `addedAt` і
прив'язані до нього розклади. Редагування URL on-the-spot це закриває.

Auth і per-stream ignorelist свідомо тут **не** реалізуються — див.
«Що винесено».

## Прийняті рішення

Ухвалено на grooming-сесії 2026-08-07; кожне звірене з кодом.

### 1. Скоуп — лише URL

`username`/`password` у `StreamInfo` — мертвий скаффолд: їх ніхто не пише
(немає UI), ніхто не читає при підключенні (у `src-tauri/src` немає жодного
`basic_auth`/`Authorization`), а DPAPI-шифрування з
[data-models.md](../../data-models.md) у коді відсутнє. Per-stream `ignorelist`
навпаки живий — [manager.rs:911-919](../../../src-tauri/src/stream/manager.rs#L911-L919)
зливає його з профільним у `matcher::check_track` — але наповнити його нічим,
бо всі IPC-обгортки (`addToIgnorelist` тощо) працюють із **профільним** списком.
Обидва — окремі фічі в інших шарах, не «ще одне поле в діалозі».

### 2. Guard — поле URL блокується під час запису

Реюз наявного предиката
[`move_blocked_by_state`](../../../src-tauri/src/commands/stream_commands.rs#L35-L40)
(`Recording` / `Connecting` / `Reconnecting`; `Error` **не** блокує — потік у
циклі реконектів саме той, кому зміна адреси найпотрібніша). Відтворення не
блокує: у цьому предикаті вже зафіксовано рішення R4 «playback is not a
recording state», і другого, ширшого визначення «активного потоку» в сусідніх
місцях UI заводити не будемо. Ім'я редагується завжди — так є сьогодні.

### 3. Збереження зміненого URL — повна симетрія з додаванням

`probeStream` (недосяжність → попередження, другий сабміт зберігає) →
`checkStreamConflicts` одразу на `url` **і** `name` з `excludeId` →
`resolve_playlist_url` на бекенді. Бекенд для дубль-перевірки міняти не треба:
[`find_conflicts`](../../../src-tauri/src/commands/stream_commands.rs#L234-L255)
уже приймає url + name + exclude_id разом.

Якщо URL **не** змінювали — жодної нової перевірки: просте перейменування
лишається одним сабмітом, як зараз.

### 4. Похідні поля — свіжі з probe, інакше `None`

Успішний probe → записати його `format`/`bitrate`/`icyName`. Збереження «все
одно» після невдалого probe → поставити `None`. Ці поля описують **адресу**, а
не рядок у списку: після переїзду старе «AAC 64k» і стара офіційна назва
брешуть, і NVDA читає брехню. `None` — чесний проміжний стан, який перше ж
підключення заповнить
([manager.rs:640-689](../../../src-tauri/src/stream/manager.rs#L640-L689)
перезаписує ці поля з ICY-заголовків).

### 5. Потік, чиє ім'я дорівнює URL

[`icy_rename`](../../../src-tauri/src/naming.rs#L120-L129) вважає «людського імені
ще нема» саме за рівністю `current == url` — так `add_stream` позначає потік,
який користувач не назвав і probe не впізнав. Змінити URL такому потоку,
не чіпаючи ім'я, означало б **назавжди** зламати цю рівність: ім'я застигло б
мертвою адресою, бо автоперейменування при підключенні вже ніколи не спрацює.

Тому: коли ім'я дорівнює старому URL, застосовуємо ту саму сходинку, що й
[`build_added_stream`](../../../src-tauri/src/commands/stream_commands.rs#L184-L216)
— `icyName` із probe через `naming::disambiguate`, інакше новий URL. Ім'я,
вписане користувачем, не чіпається ніколи (крім `trim`).

### 6. Контракт команди

`update_stream(stream_id, name, url: Option<String>, icy_name, bitrate, format)`
— та сама форма аргументів, що в `add_stream`. Правило:

| `url` | Що робить |
|---|---|
| `None` | чисте перейменування; `format`/`bitrate`/`icy_name` недоторкані |
| `Some` | `resolve_playlist_url`, потім перезапис усіх трьох полів переданим — **включно з `None`** |

Окрема команда `update_stream_url` відхилена: редагування імені й адреси в
одному сабміті стало б двома IPC-викликами і двома `save()`, з частковим збоєм
між ними. `StreamPatch`-структура відхилена як over-engineering заради полів,
які в рішенні 1 свідомо винесено.

### 7. Розкладка форми

Поле URL — **першим** в обох режимах (один макет на запам'ятовування), але
`autoFocus` у edit-режимі лишається на **імені**. F2 сьогодні це м'язова
пам'ять «перейменувати»; переносити фокус на адресу означало б подорожчати
найчастішу дію на один Tab і одне зайве прочитане NVDA поле.

## Що винесено

| Куди | Чому окремо |
|---|---|
| [stream-auth](../p3-stream-auth.md) | Потрібні DPAPI + передача кредів у HTTP-клієнт запису й плеєра; поля в UI без цього нічого не роблять |
| [per-stream-ignorelist-ui](../p1-per-stream-ignorelist-ui.md) | Логіка вже жива, бракує редактора списку — це UI-компонент, а не текстове поле |

## Критерії готовності

**Backend**

- [x] `update_stream(stream_id, name, url?, icy_name?, bitrate?, format?)` —
      форма аргументів дзеркалить `add_stream`
- [x] `url: None` → лише `name.trim()`; `format`/`bitrate`/`icy_name` недоторкані
      (регресійний тест на наявну поведінку перейменування)
- [x] `url: Some` → `resolve_playlist_url`, збережений URL = резолвлений;
      всі три похідні поля перезаписані переданим, включно з `None`
- [x] Вся логіка рішення — у чистій функції над `&[StreamInfo]` за зразком
      `build_added_stream`, з юніт-тестами без Tauri-стану
- [x] Ім'я = старий URL → `icy_name` із probe через `naming::disambiguate`,
      інакше новий URL; будь-яке інше ім'я не змінюється, крім `trim`
- [x] Тест: після зміни URL у безіменного потоку рівність `name == url`
      збережена, тобто `icy_rename` при наступному підключенні досі спрацює

**Frontend**

- [x] У edit-режимі поле URL видиме, першим у формі; `autoFocus` лишається
      на полі імені
- [x] Поле URL `disabled` + пояснення, коли статус потоку `Recording` /
      `Connecting` / `Reconnecting`; `Idle`, `Error` і відтворення не блокують
- [x] Пояснення до заблокованого поля доступне NVDA — прив'язане до поля
      (`aria-describedby`), не самотній `title`-атрибут
- [x] URL змінено → `probeStream` (невдача = попередження, другий сабміт
      зберігає) і `checkStreamConflicts({ url, name, excludeId })`
- [x] URL не змінено → жодного probe й жодної нової перевірки; перейменування
      зберігається одним сабмітом
- [x] Правка поля URL скидає `probed`/`conflictsChecked` (наявний `changeUrl`
      це вже робить — не зламати)
- [x] Нові ключі в `uk.json` і `en.json`

**Документи й гейти**

- [x] [architecture.md](../../architecture.md) — таблиця Streams-команд звірена
      з новою сигнатурою `update_stream`
- [x] Чекліст `docs/testing/nvda-full-edit-stream.md` створено за скілем
      `writing-nvda-checklists` (видалено на прийманні)
- [x] NVDA-прогін пройдено (2026-08-07, усі 9 сценаріїв, зауважень немає)
- [x] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build`

## Документи

- Походить із: rename-only F2-беклог (реалізовано в `ee9a704`)
- Код: [stream_commands.rs](../../../src-tauri/src/commands/stream_commands.rs)
  (`update_stream`, `build_added_stream`, `find_conflicts`, `move_blocked_by_state`),
  [naming.rs](../../../src-tauri/src/naming.rs) (`icy_rename`, `disambiguate`),
  [tauri.ts](../../../src/lib/tauri.ts) (`updateStream`),
  [AddStreamDialog.tsx](../../../src/components/streams/AddStreamDialog.tsx)
- Прецедент іменування й probe-потоку:
  [stream-name-disambiguation](p0-stream-name-disambiguation.md) —
  звідти ж пастка з фокусом після async-попередження (`90dc66e`)
- [architecture.md](../../architecture.md) — таблиця Streams-команд
