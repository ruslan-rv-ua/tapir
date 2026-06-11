# Phase 3D — Scheduler (заплановані записи): дизайн v1

Дата: 2026-06-12
Статус: затверджено (brainstorming-сесія), очікує implementation plan

## 1. Мета й обсяг

Автоматичний запис радіопотоків за розкладом: одноразовий (дата + час) та повторюваний
(дні тижня + час). Розклади зберігаються в профілі (`Profile.scheduledRecordings` — поле
вже існує) і спрацьовують **лише для активного профілю**.

**Гарантія v1:** запис спрацьовує, лише якщо Tapir запущений (вікно або трей).
Пропуски чесно фіксуються й озвучуються.

**Свідомо поза v1** (backlog, після Фаз 3E Single Instance + 3G CLI Arguments):

- Пробудження ПК зі сну (`SetWaitableTimer` з resume-флагом).
- Запуск записів через Windows Task Scheduler із закритим Tapir (як у TapinRadio).
- Per-schedule override для padding (`Option<PaddingOverride>`, None = глобальне) —
  аддитивна зміна з `#[serde(default)]`, додається без міграцій.

## 2. Модель даних

Зміни в існуючому scaffold ([src-tauri/src/profile.rs](../../../src-tauri/src/profile.rs)).
Breaking change прийнятний — scaffold ще ніким не використовується, міграцій у проєкті немає.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleType {
    Oneshot,
    Recurring,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledRecording {
    pub id: String,
    pub stream_id: String,            // посилання на StreamInfo.id активного профілю
    pub name: String,                 // мітка користувача, напр. "Evening Jazz"
    #[serde(rename = "type")]
    pub schedule_type: ScheduleType,
    #[serde(default)]
    pub days: Vec<u8>,                // recurring: 0=Пн..6=Нд, непорожній; oneshot: порожній
    #[serde(default)]
    pub date: Option<String>,         // oneshot: ISO-дата "2026-06-14"; recurring: None
    pub time: String,                 // початок "HH:MM", 24h, локальний час
    pub duration_minutes: u32,        // > 0; обчислюється з пари початок–кінець у формі
    pub enabled: bool,
    pub created_at: String,
    #[serde(default)]
    pub last_result: Option<ScheduleResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleResult {
    pub occurrence: String,           // "2026-06-12T20:00" — локальний час початку входження
    pub status: ScheduleResultStatus,
    pub recorded_minutes: u32,        // 0, якщо запис не стартував
    pub finished_at: String,          // ISO datetime, коли статус зафіксовано
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleResultStatus {
    Completed,                // записано все вікно
    StartedLate,              // catch-up: стартували посеред вікна, дописали решту
    Missed,                   // вікно минуло без старту (Tapir не працював, DST-стрибок тощо)
    StoppedByUser,            // користувач зупинив плановий запис вручну
    SkippedAlreadyRecording,  // на старті вікна потік уже записувався
}
```

Зміни відносно поточного scaffold: `day_of_week: Option<u8>` → `days: Vec<u8>`
(одна передача «пн–пт 18:00» = один розклад), додано `last_result`.
Синхронно оновити TS-типи й [docs/data-models.md](../../data-models.md) §3.3.

**Padding** — два поля в `RecordingSettings` профілю (не per-schedule):

```rust
#[serde(default)]
pub schedule_pad_before_min: u32,   // default 0
#[serde(default)]
pub schedule_pad_after_min: u32,    // default 0
```

Ефективне вікно запису: `start − padBefore … start + duration + padAfter`.

**Валідація** (на add/update і на load профілю):

- `recurring`: `days` непорожній, кожен елемент 0..=6, без дублікатів; `date = None`.
- `oneshot`: `days` порожній; `date` — валідна ISO-дата.
- `time` — валідний "HH:MM"; `duration_minutes ≥ 1`. У формі час кінця не може
  дорівнювати часу початку (запис на 0 або 24 години не підтримується).
- `stream_id` існує в активному профілі (на add/update; на load — допускаємо «осиротілі»
  розклади, вони просто дають Missed з причиною в лозі).

## 3. Ядро: `scheduler::timer`

Tokio-задача з `CancellationToken`, тік **щохвилини** (на початку кожної календарної
хвилини). Логіка **декларативна, за станом**, а не за подіями: на кожному тіку для
кожного enabled-розкладу активного профілю обчислюється «чи має зараз тривати запис?».
Модель самовідновлювана: сон системи, переведення годинника, редагування розкладів —
усе підхоплюється наступним тіком без спеціальної логіки.

### 3.1. Входження (occurrence) і ledger

Входження = конкретний запуск розкладу: ключ `(schedule.id, локальна дата+час початку)`.
In-memory ledger зберігає завершені входження поточної сесії
(`Completed | Missed | StoppedByUser | SkippedAlreadyRecording`). Призначення:

- **не перезапускати** запис у тому самому вікні після ручної зупинки;
- **гасити DST-повтор**: при переведенні годинника назад вікно збігається вдруге,
  але входження вже в ledger;
- не дублювати фіксацію Missed.

Ledger очищається від входжень, чиї вікна давно минули (досить тримати ~48 год).
Ledger не персиститься: рестарт Tapir посеред вікна після ручної зупинки призведе до
повторного старту через catch-up — прийнятне обмеження v1 (catch-up важливіший).

### 3.2. Алгоритм тіка

Для кожного enabled-розкладу активного профілю:

1. Обчислити найближче вікно `[start − padBefore, start + duration + padAfter)`,
   що накриває `now` або передує йому. Перехід через північ — природно через duration
   (вікно «23:00–01:00» належить дню старту).
2. **Вікно активне**, запис цього входження не йде, входження не в ledger:
   - потік уже записується (вручну або іншим розкладом) → ledger:
     `SkippedAlreadyRecording`, оновити `last_result`;
   - інакше → старт запису через `stream::manager`; якщо `now > start` —
     статус майбутнього результату `StartedLate`, інакше `Completed`;
     подія `scheduled-started`.
3. **Вікно щойно минуло**:
   - запис цього входження йде → зупинити (тільки якщо scheduler його починав),
     зафіксувати `Completed`/`StartedLate` + `recorded_minutes`, подія
     `scheduled-completed`, ledger;
   - запис не стартував і входження не в ledger → `Missed` (причина: «Tapir не
     працював» / «потік недоступний» / «переведення годинника»), подія
     `scheduled-missed`, ledger, запис у лог. Дедуплікація між сесіями: якщо
     `last_result.occurrence` вже дорівнює цьому входженню — не фіксувати вдруге
     (ledger живе лише в пам'яті, а `last_result` персиститься).
5. Кожна фіксація результату оновлює `last_result` і персистить профіль.
4. Oneshot після фіксації результату (будь-якого) → `enabled = false`,
   рядок лишається в списку з результатом.

DST: неіснуючий локальний час (стрибок уперед) дає вікно, яке неможливо обчислити
на цю дату → фіксується `Missed («переведення годинника»)`.

### 3.3. Семантика власності

- Scheduler зупиняє **тільки** запис, який сам почав (тримає handle/маркер сесії
  запису per входження).
- Конфлікт на старті вікна (потік уже пишеться) → skip, нічого не чіпаємо в кінці вікна.
- Користувач вручну зупинив плановий запис → `StoppedByUser`, у цьому вікні не
  перезапускати (ledger).
- Два розклади перетнулись на одному потоці → другий отримує `SkippedAlreadyRecording`.
- Обрив з'єднання під час планового запису → діє існуюча reconnect-логіка
  (Settings → Reconnection); scheduler не втручається, вікно закривається за часом.

### 3.4. Життєвий цикл задачі

- Старт задачі — при запуску додатка після завантаження активного профілю.
- Переключення профілю: confirm dialog, якщо триває плановий запис
  («Триває плановий запис "X" до 22:05. Переключити профіль і зупинити його?»);
  при підтвердженні — зупинка (статус `StoppedByUser` із причиною «переключення
  профілю»), ledger і таймер перезапускаються на нових розкладах.
- Закриття додатка під час планового запису → той самий confirm; graceful shutdown
  зупиняє запис штатно (механізм `active_recording_urls` уже існує), фіксується
  `StoppedByUser («закриття додатка»)`. Після рестарту catch-up все одно дозапише
  залишок вікна як `StartedLate`: `last_result` блокує лише повторну фіксацію
  Missed, а не старт запису (старт блокує тільки in-memory ledger).
- Редагування/toggle/видалення розкладу, що зараз пише: зупинити його запис
  (scheduler-owned), далі діяти за новим станом на наступному тіку.

## 4. IPC

Модуль `commands/schedule_commands`:

| Команда | Сигнатура (вхід → вихід) |
|---------|--------------------------|
| `get_schedules` | `() → Vec<ScheduledRecording>` |
| `add_schedule` | `(ScheduledRecordingInput) → ScheduledRecording` (id, createdAt генерує backend) |
| `update_schedule` | `(ScheduledRecording) → ScheduledRecording` |
| `delete_schedule` | `(id: String) → ()` |
| `toggle_schedule` | `(id: String, enabled: bool) → ScheduledRecording` |

Усі команди працюють з активним профілем і одразу персистять його. Помилки — через
`RadioError`.

Події (вже описані в data-models.md): `scheduled-started`, `scheduled-completed`
(payload: `recordingId`, `streamId`), `scheduled-missed` (+ `reason`).
Поточний стан самого запису йде через існуючі recording-статуси по `streamId` —
нових механізмів статусу не потрібно.

Frontend store: `src/stores/schedule.ts` (nanostores) — список розкладів,
синхронізація через події + `get_schedules`.

## 5. UI

### 5.1. SchedulePanel (таб Activity Bar)

Секція «Розклад». Кнопка «Додати розклад» + таблиця.

### 5.2. ScheduleTable

Composite-list за патернами Saved Songs (FRD-навігація, зони F6 через stable proxy).
Колонки:

| Колонка | Приклад |
|---------|---------|
| Назва | Evening Jazz |
| Потік | Radio Jazz UA |
| Коли | «Пн–Пт 20:00–22:00» / «14.06.2026 20:00–22:00» |
| Наступний запуск | «пт 13.06 20:00» (обчислюваний; «—» якщо вимкнено/минув) |
| Стан | увімкнено / вимкнено |
| Останній результат | «✓ записано 119 хв» / «✗ пропущено (Tapir не працював)» / «почато із запізненням, 80 хв» / «зупинено вручну» / «потік уже записувався» |

Контекстне меню рядка: Редагувати, Увімкнути/Вимкнути, Видалити (з confirm).
Дія «записати зараз» не потрібна — є ручний запис потоку.

### 5.3. ScheduleForm (діалог add/edit)

Поля в порядку Tab:

1. Назва (text, обов'язкове).
2. Потік (select зі станцій активного профілю, обов'язкове).
3. Тип: одноразовий / повторюваний (radio group).
4. Для recurring: 7 чекбоксів днів (Пн…Нд), мінімум один.
   Для oneshot: поле дати.
5. Час початку «HH:MM», час кінця «HH:MM». Кінець < початку = перехід через північ
   (підказка в hint: «22:30 → 00:30 — запис через північ»); кінець, що дорівнює
   початку, — помилка валідації. У модель зберігається `duration_minutes`.
6. Увімкнено (checkbox, default true).
7. OK / Скасувати. Focus trap, валідація з озвученням помилок (aria-describedby +
   live region, як в інших діалогах).

### 5.4. Налаштування

Settings → Запис, група «Планувальник»: «Починати раніше, хв» (0–30),
«Закінчувати пізніше, хв» (0–60). Default 0/0.

### 5.5. Доступність (NVDA)

- Live region **assertive**: «Плановий запис "X" розпочато» / «завершено, записано
  N хв» / «пропущено: причина». Працює і коли відкритий діалог
  (`data-live-announcer="true"`).
- Balloon tip з трею (механізм Фази 3A) дублює ті самі події.
- ScheduleTable: повна навігація стрілками, оголошення колонок; toggle стану
  озвучується.
- ScheduleForm: усі поля з label, помилки валідації озвучуються.

## 6. Критерії Done (уточнення roadmap)

- [ ] Одноразовий запис: дата + початок/кінець → файл записано.
- [ ] Повторюваний: набір днів тижня + час; «пн–пт» — одним розкладом.
- [ ] Перехід через північ працює (23:30–00:30).
- [ ] Padding застосовується з глобальних налаштувань.
- [ ] Toggle enabled/disabled без видалення.
- [ ] Конфлікт «потік уже записується» → skip, без дублювання, без чужих зупинок.
- [ ] Ручна зупинка планового запису → не перезапускається в тому ж вікні.
- [ ] Catch-up: старт Tapir посеред вікна → запис решти, статус StartedLate.
- [ ] Пропущені фіксуються в last_result + лог + подія scheduled-missed.
- [ ] Oneshot після спрацювання вимикається, результат видно в таблиці.
- [ ] Переключення профілю під час планового запису → confirm dialog.
- [ ] NVDA: таблиця, форма, live regions — повністю доступні.

## 7. Тестування

**Unit (Rust, `scheduler::timer` — чиста логіка обчислення вікон окремо від tokio):**

- Найближче вікно: recurring у різні дні, oneshot, перехід через північ, padding.
- Catch-up: now посеред вікна → старт StartedLate; now після вікна → Missed.
- Ledger: повторний тік не дублює старт; StoppedByUser не перезапускається;
  DST назад не дає другого старту; DST уперед дає Missed.
- Валідація моделі (days, date, time, duration).

**Ручний сценарій (з NVDA):**

1. Розклад на now+2 хв, тривалість 2 хв → стартує, озвучується, зупиняється, файл є,
   last_result «✓».
2. Закрити Tapir до старту, відкрити посеред вікна → StartedLate, дописано решту.
3. Зупинити плановий запис вручну → не рестартує, статус «зупинено вручну».
4. Запустити ручний запис потоку, дочекатись планового старту → skip, ручний запис
   не зупинено в кінці вікна.
5. Переключити профіль під час планового запису → confirm, запис зупинено.

## 8. Рішення, прийняті на brainstorming (для історії)

| Питання | Рішення |
|---------|---------|
| Гарантія спрацювання v1 | Tapir має бути запущений; wake-from-sleep і Task Scheduler — backlog |
| Повторюваність | Набір днів тижня (`days: Vec<u8>`) замість одного `dayOfWeek` |
| Надолуження | Старт із запізненням, якщо вікно ще активне (StartedLate) |
| Форма часу | Початок + кінець; кінець ≤ початку = через північ; зберігаємо duration |
| Padding | Глобальне налаштування (профіль), per-schedule override — backlog |
| Oneshot після спрацювання | enabled=false, рядок лишається з результатом |
| Профілі | Розклади лише активного профілю; переключення з активним записом — confirm dialog |
| Ядро | Per-minute tick loop, декларативна перевірка стану + ledger входжень |
