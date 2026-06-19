# Спека: масові операції над потоками — віха C (експорт + запис/зупинка виділених)

- **Дата:** 2026-06-19
- **Тип:** дизайн фічі (spec) — третя віха парасолькового запису
- **Статус:** затверджено (ревізовано за аудитом), готово до writing-plans
- **Аудит (2026-06-19):** [C-design-audit](2026-06-19-bulk-stream-operations-C-design-audit.md).
  Вердикти: finding 1 (Stop active-визначення) — **підтверджений баг**, виправлено (R6); finding 3
  (застиглий count у confirm) — **підтверджений баг**, виправлено (C4 live-count); finding 4
  (однакове ім'я файлу) — **не correctness-баг, а a11y-слабкість**, виправлено (scoped filename,
  C1); finding 2 (палітра) — **не баг поведінки**, задокументовано явний whole-profile-станс (R7).
- **Парасолька (north-star):** [docs/backlog/p1-bulk-stream-operations.md](../../backlog/p1-bulk-stream-operations.md)
  — усі дизайн-рішення (1–18) живуть там; ця спека на них **посилається**, а не дублює.
- **Спирається на (віхи A, B — реалізовані й перевірені 2026-06-18):**
  [A-design](2026-06-14-bulk-stream-operations-A-design.md) ·
  [A-plan](../plans/2026-06-14-bulk-stream-operations-A.md) ·
  [B-design](2026-06-18-bulk-stream-operations-B-design.md) ·
  [B-plan](../plans/2026-06-18-bulk-stream-operations-B.md). Інфраструктуру виділення
  **не перевідкриваємо** — перевикористовуємо як шаблон.
- **Пов'язані документи:** [accessibility.md](../../accessibility.md) (§1.4 LiveAnnouncer, §3),
  [AGENTS.md](../../../AGENTS.md) (accessibility-first, backend-first, i18n).

## Мета

Закрити обсяг **віхи C** (розділ «Віхи» парасольки): зробити тулбарну кнопку **Експорт**
динамічною (рішення №17: за наявності виділення — «Експорт виділених (N)», інакше «Експорт»
усього профілю) і перемкнути **«Записати все» / «Зупинити запис»** у режим «виділені» за
наявності виділення (рішення №8/№14: «Записати/Зупинити виділені (N)», `disabled` по
startable/active **серед виділених**). Формати експорту — M3U8/PLS (наявний backend уже
підтримує, лише фільтрація по id). Частковий успіх для record/stop підмножини зі skip-семантикою
й зведеним оголошенням-підсумком. **Лише streams.** Решта списків — віха D.

Бонус проти B: **нових кнопок немає** — Export (idx 2), RecordAll (idx 7), StopAll (idx 8) уже
існують у тулбарі. Roving лишається **14**, без переіндексації. Усі три — «whole-profile-value»
дії, що **змінюють підпис** за виділенням (рішення №17: дії з whole-profile-значенням —
динамічні; суто-виділенські Видалити/Перемістити/Копіювати — окремі кнопки, зроблені в A/B).

Віха C спирається на готовий шар виділення з A (`$streamSelection`, central `announce`,
section-scoped lifecycle, snapshot-до-await bulk-патерн) і динамічні-за-виділенням підписи з B
(кнопки Move/Copy selected). ⋯-меню **не чіпаємо** — Export/Record/Stop суто тулбарні, не пункти меню.

## Зафіксований дизайн (рішення парасольки, на які спираємось)

- **№8** — «Записати все»/«Зупинити запис» перемикаються на режим «виділені» за наявності
  виділення; без виділення — весь профіль (як зараз). Окремих кнопок «…виділені» **не** додаємо.
- **№14** — динамічні назви «Записати/Зупинити виділені (N)»; **visible text == accessible name**
  (WCAG 2.5.3); `disabled` перераховується по startable/active **серед виділених**.
- **№17** — Експорт динамічний: «Експорт виділених (N)» vs «Експорт» (увесь профіль). Принцип:
  whole-profile-value дії — динамічні; суто-виділенські — окремі кнопки.
- **№5** — частковий успіх + skip-семантика (узгоджено зі `start_all_recordings`): придатні
  виконуються, непридатні пропускаються, далі зведений підсумок із причиною.
- **№13** — section-scoped lifecycle: виділення переживає відкриття власних діалогів
  (export-format / stop-confirm), очищається фільтром/профілем/виходом; зниклі id авто-prune.

## Рішення цього циклу (реалізаційні розвилки, не покриті 1–18)

> Узгоджено в brainstorming 2026-06-19. Відкритих питань немає.

- **R1 — `(N)` у підписах = `selCount` (увесь розмір виділення), НЕ actionable-підмножина.**
  Дзеркало наявних `move_selected`/`copy_selected`/`delete_selected` (усі несуть `selCount`).
  Рішення №14 окремо згадує підпис **і** окремо `disabled`-обчислення — тож `(N)` — це розмір
  виділення, а `disabled` — окрема похідна (startable/active-серед-виділених). Інакше «Записати
  виділені (2)» при виділених 3 суперечило б решті кнопок і збивало б NVDA-користувача («я обрав
  3, чому 2?»).
- **R2 — backend: розширюємо наявні команди опційним id-фільтром, НЕ додаємо нові.** Усім трьом
  (`export_streams`, `start_all_recordings`, `stop_all_recordings`) додаємо `stream_ids:
  Option<Vec<String>>` (`None` = весь профіль, як зараз; `Some` = лише ці id у порядку профілю).
  Це **розходиться** з A/B-патерном «нова bulk-команда поряд із single», бо там single і bulk мали
  **різну** семантику (single transfer тримає Conflict-пікер; single remove — окремий stop+retain).
  Тут «все» і «виділені» — буквально **та сама** операція з фільтром (`ids = None` ≡ «все»), тож
  розширення — менший і чесніший обсяг, ніж дублювання команд.
- **R3 — Stop-selected дзеркалить Stop All-підтвердження.** `ConfirmDialog`, коли stoppable серед
  виділених **> 1** (повідомлення-варіант «Буде зупинено N виділених записів», count — **live**, див.
  finding 3 у C4); рівно 1 stoppable — зупинка одразу. Узгоджено з наявним `handleStopAll` (guard від
  випадкової масової зупинки; запис — деструктивний). Record-selected підтвердження **не** має (як і
  «Записати все»).
- **R4 — діалог формату експорту відображає скоуп.** Заголовок/heading `ExportFormatDialog` стає
  «Експорт виділених (N)», коли відкрито з виділенням (інакше «Експорт потоків»). NVDA-чесно: діалог
  підтверджує реальний обсяг, не натякає мовчазно на весь профіль. Знімок id робиться **на момент
  кліку** (route-fix як у B): поки модаль відкрита, фокус заблокований — виділення не зміниться.
- **R5 — підсумок record/stop: `skipped = selCount − done`.** Бекенд повертає лише `done`
  (`started`/`stopped`) — авторитетну кількість. `done = startable/stoppable-серед-виділених` (усі
  придатні стартують/стопляться), тож `done + skipped = selCount` завжди й `skipped ≥ 0`. Клауза
  причини додається лише за `skipped > 0` (дзеркало B `composeSummary`). Не потрібна структура-
  результат (на відміну від B `BulkTransferResult`): єдина причина скіпа для record — «вже в
  активній сесії запису», для stop — «не записувався», тож лічильника `done` достатньо.
- **R6 — єдине визначення «active» для Stop (виправлення audit finding 1).** Кнопка Stop (і whole-
  profile, і selected) користується **backend-визначенням** `is_active = recording | connecting |
  reconnecting` ([recording_control.rs:36](../../../src-tauri/src/recording_control.rs#L36)) — це те,
  що `stop_now` реально зупиняє і що бере глобальний хоткей `toggle_all`/`count_active`. Вводимо
  `stoppableCount` (whole, broad) / `selectedStoppableCount` (selected, broad) і живимо ними **лише
  Stop-кнопку** (disabled / поріг confirm / count у повідомленні). Наявний `activeCount`
  (**recording-only**, [StreamsPanel.tsx:54](../../../src/components/streams/StreamsPanel.tsx#L54))
  лишається **тільки** для метрики «Активні записи» і лічильника чипа «Запис» (display-семантика).
  > **Чому це в обсязі C, а не «поведінка незмінна»:** наявна toolbar-кнопка Stop all рахувала
  > stoppability по `activeCount` (recording-only) — **розбіжність** із backend і глобальним
  > хоткеєм (обидва broad): reconnecting-потік не можна було зупинити кнопкою, хоча хоткей його
  > зупиняв. Якби selected-stop узяв broad, а whole-profile лишився recording-only, **та сама** дія
  > мала б різну придатність залежно від наявності виділення (прямо суперечить рішенню №8: action
  > **перемикає scope**, а не визначення active). Тож C **нормалізує** обидва шляхи до broad —
  > менший і чесніший варіант, ніж задокументована розбіжність. Record уже консистентний (обидва
  > шляхи через `startable = !is_active`), тож стосується лише Stop. `startable`+`stoppable`
  > розбивають кожен наявний потік навпіл, що робить R5-математику точною.
- **R7 — Command Palette лишається whole-profile only (виправлення audit finding 2, без зміни
  поведінки).** Палітра — **глобальна** командна поверхня (відкривається звідусіль), а виділення —
  **section-local** концепт списку «Потоки» (рішення №13). Її команди названо whole-profile:
  «Записати все» / «Зупинити запис» / «Експорт потоків» — назва **чесно** збігається з дією.
  Зробити їх selection-aware означало б, що «Записати **все**» іноді пише лише підмножину (прихована
  залежність від невидимого стану) — це й була б розбіжність/«брехня». Тож палітра **свідомо**
  лишається whole-profile для export/record/stop; selection-aware — **лише** тулбар секції (де
  кнопки явно стають «…виділені (N)»). Це **не** зміна поведінки (палітра-export уже мала бути whole-
  profile), а явна фіксація стансу, яку finding 2 справедливо вимагав від спеки.

## Контекст (поточний стан коду, звірено 2026-06-19)

- **`src-tauri/src/commands/stream_io_commands.rs:174`** — `export_streams(app, format, state)`:
  клонує `profile.streams` + `name`, гілкує `pls`/`m3u8` через `playlist::to_pls`/`to_m3u8`,
  пікер `set_file_name("{name}.{ext}")`, write, `Ok(true)`; cancel → `Ok(false)`. `mod tests` має
  хелпери `entry()`.
- **`src-tauri/src/stream/playlist.rs`** — `to_m3u8(&[StreamInfo])`, `to_pls(&[StreamInfo])`
  (серіалізація списку; фільтрація не потрібна на їхньому боці).
- **`src-tauri/src/commands/stream_commands.rs:311`** — `start_all_recordings(state) -> usize`:
  `check_disk_space`, клонує `profile.streams`+`recording`, `manager.start_all(streams, settings,
  arc)`. `manager.start_all` ([manager.rs:254](../../../src-tauri/src/stream/manager.rs#L254))
  скіпає `entries.contains_key` (вже-активні), повертає `started`.
- **`src-tauri/src/commands/stream_commands.rs:305`** — `stop_all_recordings(app) -> ()`:
  `recording_control::stop_all_now(&app).await` (повертає `usize`, **відкидається**).
- **`src-tauri/src/recording_control.rs:62`** — `stop_all_now(app) -> usize`: читає active-статуси
  (`is_active`), `mgr.stop_all()`, потім `notify_manual_stop` на кожен зупинений; повертає
  `active.len()`. `is_active` = Recording/Connecting/Reconnecting.
- **`src/lib/tauri.ts`** — `exportStreams(format) -> Promise<boolean>`,
  `startAllRecordings() -> Promise<number>`, `stopAllRecordings() -> Promise<void>`.
- **`src/stores/streams.ts:47`** — `$showExportStreamsDialog = atom<boolean>` (open-сигнал
  діалогу). Споживачі open-сигналу: `StreamsPanel` (кнопка Export), `CommandPalette` (команда
  «Експорт потоків» → весь профіль), `ExportFormatDialog` (read/close). `$streamSelection`,
  `replaceSelection`, `pruneSelection` (A).
- **`src/components/streams/ExportFormatDialog.tsx`** — читає `$showExportStreamsDialog`; radio
  M3U8/PLS; `tauri.exportStreams(format)`; `streams_export_title()` заголовок; success →
  `announce(streams_export_done())`.
- **`src/components/streams/StreamsPanel.tsx`** — тулбар roving **14** (Add 0, Import 1, Export 2,
  SelectAll 3, Move 4, Copy 5, Delete 6, RecordAll 7, StopAll 8, chips 9–11, sorts 12–13). Має
  `selection`/`selCount` (через `useStore($streamSelection)`), `statuses`, `announce`,
  `startableCount` (state ∉ {recording,connecting,reconnecting} — broad), `activeCount`
  (**recording-only** — наразі живить і метрику, і Stop-кнопку → розбіжність із backend; R6
  нормалізує Stop на broad), `recordAllAnnouncement` (pluralized),
  `handleRecordAll`/`handleStopAll`/`doStopAll`, `confirmStopAll: boolean` + `ConfirmDialog`
  (повідомлення з живого `activeCount`). Export-кнопка (idx 2) `aria-disabled={isEmpty}` →
  `$showExportStreamsDialog.set(true)`.

## Ключові архітектурні рішення

### C1. Backend — три команди з опційним id-фільтром (R2)

Спільний чистий хелпер у [stream_commands.rs](../../../src-tauri/src/commands/stream_commands.rs)
(unit-тестований, як `retain_streams`). **`pub(crate)`** — бо `export_streams` живе в сусідньому
[stream_io_commands.rs](../../../src-tauri/src/commands/stream_io_commands.rs) і викликає його
через `crate::commands::stream_commands::select_by_ids`:

```rust
/// Лишає зі `streams` лише ті, чий id у `ids`, **у порядку `streams`** (порядок профілю).
/// Невідомі id ігноруються. Використовується export/start/stop-виділених.
pub(crate) fn select_by_ids(streams: &[StreamInfo], ids: &[String]) -> Vec<StreamInfo> {
    let want: std::collections::HashSet<&str> = ids.iter().map(String::as_str).collect();
    streams.iter().filter(|s| want.contains(s.id.as_str())).cloned().collect()
}
```

- **`export_streams`** ([stream_io_commands.rs](../../../src-tauri/src/commands/stream_io_commands.rs#L174)):
  ```rust
  pub async fn export_streams(
      app: AppHandle, format: String,
      stream_ids: Option<Vec<String>>,
      state: State<'_, AppState>,
  ) -> Result<bool, String>;
  ```
  Після клону `profile.streams`: `let streams = match &stream_ids { Some(ids) =>
  select_by_ids(&all, ids), None => all };` Гілка формату, write, `Ok(true/false)` — **без змін**.
  **Default-ім'я save-діалогу несе скоуп (виправлення audit finding 4):** whole-profile →
  `{profile_name}.{ext}` (як зараз); selected → `{profile_name}-selected-{count}.{ext}` (count =
  `ids.len()`). Native Save dialog — **фінальна** confirmation-поверхня (модального заголовка з R4
  **недостатньо**, бо реальна дія відбувається в системному діалозі), а filename-поле — головний
  scope-сигнал, який NVDA озвучує; однакова назва для whole/selected дала б ризик випадково
  перезаписати повний експорт підмножиною. Суфікс `-selected-` — нелокалізований ASCII-токен
  (backend не має paraglide; стабільне, filesystem-safe ім'я), узгоджений зі скоуп-вибором Q2.
- **`start_all_recordings`** → `start_all_recordings(stream_ids: Option<Vec<String>>, state) ->
  usize`: `let streams = match stream_ids { Some(ids) => select_by_ids(&all, &ids), None => all };`
  далі `manager.start_all(streams, …)` (скіп вже-активних + count — без змін). Disk-space guard
  лишається (`Some` теж його проходить — консистентно з «Записати все»).
- **`stop_all_recordings`** → `stop_all_recordings(stream_ids: Option<Vec<String>>, app) ->
  usize`: узагальнюю `stop_all_now` у `recording_control`:
  ```rust
  /// Зупиняє активні записи, що проходять `filter` (або всі, якщо None). Повертає кількість
  /// зупинених. session_id читаються ДО cancel; потім спільний notify_manual_stop.
  pub async fn stop_now(app: &AppHandle, filter: Option<&HashSet<String>>) -> usize { … }
  pub async fn stop_all_now(app: &AppHandle) -> usize { stop_now(app, None).await }
  ```
  Команда: `let set = stream_ids.map(|v| v.into_iter().collect::<HashSet<_>>()); Ok(stop_now(&app,
  set.as_ref()).await)` — тепер **повертає** count (раніше відкидався). `stop_all_now` лишається
  для tray/глобальних хоткеїв (не-виділенський шлях).
- **`lib.rs`** — реєстрації **без змін** (ті самі імена команд; Tauri підхопить нову сигнатуру).

### C2. tauri.ts обгортки

```ts
export async function exportStreams(format: "m3u8" | "pls", ids?: string[]): Promise<boolean> {
  return invoke("export_streams", { format, streamIds: ids ?? null });
}
export async function startAllRecordings(ids?: string[]): Promise<number> {
  return invoke("start_all_recordings", { streamIds: ids ?? null });
}
export async function stopAllRecordings(ids?: string[]): Promise<number> {  // тип void → number
  return invoke("stop_all_recordings", { streamIds: ids ?? null });
}
```

Наявний whole-profile-виклик `stopAllRecordings()` (без аргументів) ігнорує повернутий count
(`void`-контекст у `doStopAll`) — сумісно.

### C3. Експорт — динамічна кнопка + scoped діалог (№17, R4)

- **Сигнал відкриття**: `$showExportStreamsDialog: atom<boolean>` → дискримінований
  `$exportStreamsRequest = atom<ExportRequest | null>`, де
  ```ts
  type ExportRequest = { ids: string[] | null };  // null = весь профіль; [...] = виділені
  ```
  `null` (atom) = закрито. Це природне розширення open-сигналу (несе скоуп), не зайвий рефактор:
  скоуп **потрібен** діалогу для заголовка й виклику.
- **Кнопка Export (idx 2)** у `StreamsPanel`:
  - текст = `selCount > 0 ? streams_export_selected({ count: selCount }) : streams_export_button()`
    (visible == accessible name);
  - `aria-disabled` лише коли `isEmpty` (при `selCount>0` потоки завжди є);
  - клік: `setExport({ ids: selCount > 0 ? [...selection] : null })` (знімок на кліку, R4).
- **`ExportFormatDialog`**: `const req = useStore($exportStreamsRequest); const isOpen = req !==
  null;` heading/`aria-label` = `req?.ids ? streams_export_selected_title({ count: req.ids.length })
  : streams_export_title()`; виклик `tauri.exportStreams(format, req?.ids ?? undefined)`; close →
  `$exportStreamsRequest.set(null)`. Решта (radio, success-announce, busy) без змін.

### C4. Record/Stop виділені — обробники в StreamsPanel (№8/№14, R1/R3/R5)

Усе живе **в тулбарі** (StreamsPanel) — там уже `$streamSelection`, `announce`, `statuses`. На
відміну від delete/move/copy, record/stop **не** рухають фокус і **не** прибирають рядки, тож
StreamList-хендл **не** потрібен.

- **Похідні лічильники** (мемо). `IS_ACTIVE` = backend `is_active` (broad, R6); `startable =
  !IS_ACTIVE`, `stoppable = IS_ACTIVE` — розбивають кожен наявний потік навпіл:
  ```ts
  const IS_ACTIVE = new Set(["recording", "connecting", "reconnecting"]);  // = backend is_active (R6)
  const selectedStartableCount = useMemo(() =>
    [...selection].filter(id => streamIds.has(id) && !IS_ACTIVE.has(statuses[id]?.state ?? "idle")).length,
    [selection, statuses, streamIds]);
  const selectedStoppableCount = useMemo(() =>     // R6: broad, дзеркало whole-profile stoppableCount
    [...selection].filter(id => IS_ACTIVE.has(statuses[id]?.state ?? "idle")).length,
    [selection, statuses]);
  // whole-profile Stop тепер теж broad (R6) — НЕ recording-only activeCount:
  const stoppableCount = useMemo(() =>
    streams.filter(s => IS_ACTIVE.has(statuses[s.id]?.state ?? "idle")).length, [streams, statuses]);
  ```
  `activeCount` (recording-only) лишається **лише** для метрики/чипа (R6) — Stop-кнопки його **не**
  торкаються.
- **RecordAll (idx 7):** (record уже консистентний — обидва шляхи через `startable`)
  - текст = `selCount > 0 ? record_selected({ count: selCount }) : record_all()`;
  - `disabled = selCount > 0 ? selectedStartableCount === 0 : startableCount === 0`;
  - `handleRecordAll`: `selCount > 0` → `const ids = [...selection]; const started = await
    startAllRecordings(ids); announce(composeRecordSummary(ids.length, started), "polite")`;
    інакше наявний whole-profile-шлях (`recordAllAnnouncement(started)` — pluralized, без змін).
- **StopAll (idx 8):** (обидва шляхи через `stoppable`, broad — R6)
  - текст = `selCount > 0 ? stop_selected({ count: selCount }) : stop_all()`;
  - `disabled = selCount > 0 ? selectedStoppableCount === 0 : stoppableCount === 0`;
  - `handleStopAll`: `selCount > 0` → `selectedStoppableCount > 1` ? відкрити confirm(selected) :
    `doStopSelected([...selection])`; інакше whole-profile-шлях
    (`stoppableCount > 1` ? confirm(all) : `doStopAll()`). **Whole-profile поріг/disabled тепер
    `stoppableCount`, не `activeCount`** (R6: нормалізація — reconnecting/connecting тепер
    зупиняється кнопкою, як хоткеєм).
  - `doStopSelected(ids)`: `const stopped = await stopAllRecordings(ids);
    announce(composeStopSummary(ids.length, stopped), "polite")`.
- **Підтвердження (R3 + виправлення audit finding 3)** — `confirmStopAll: boolean` → `confirmStop:
  null | { scope: "all" | "selected" }`. **Жодного знімка `count`/`ids` у стейті** (finding 3:
  recording-стан живе в backend і може змінитися між open і Confirm — scheduler; застиглий count
  «брехав» би). Натомість — **live reactive** count (дзеркало наявного whole-profile confirm, що
  вже бере живий `activeCount`; StreamsPanel перерендерюється на `$statuses`, тож `<p>{message}</p>`
  оновлюється, поки діалог відкритий):
  - title = `scope === "selected" ? confirm_stop_selected_title() : confirm_stop_all_title()`;
  - message = `scope === "selected" ? confirm_stop_selected_message({ count: selectedStoppableCount })
    : confirm_stop_all_message({ count: stoppableCount })` (обидва — **живі** мемо);
  - `onConfirm` → `scope === "selected" ? doStopSelected([...$streamSelection.get()]) : doStopAll()`
    — знімок виділення **на момент Confirm**, перед await (множина виділення стабільна під час
    діалогу: фокус-trap блокує selection-жести; змінюється лише recording-стан, який і покриває live
    count). Підсумок-announce (backend `stopped`) — авторитетний, якщо стан зсунувся між рендером і
    виконанням.
- **Підсумки (R5)** — дзеркало B `composeSummary` (лід + клауза причини лише за ненульового скіпа):
  ```ts
  function composeRecordSummary(sel: number, started: number): string {
    let s = m.record_done({ count: started });
    if (sel - started > 0) s += ", " + m.record_skipped({ count: sel - started });
    return s;
  }
  function composeStopSummary(sel: number, stopped: number): string {
    let s = m.stop_done({ count: stopped });
    if (sel - stopped > 0) s += ", " + m.stop_skipped({ count: sel - stopped });
    return s;
  }
  ```
  `started/stopped` — авторитетні з бекенду; `skipped = sel − done ≥ 0` (R5). Один канал announce
  (A6) — без поштучних тостів.

> **Знімок виділення — перед await** (bulk-патерн A/B): прямий record/stop (без confirm) знімає
> `[...selection]` на кліку; stop-через-confirm — на **Confirm** (`[...$streamSelection.get()]`,
> finding 3). У всіх випадках знімок безпосередньо передує IPC, тож зведення/виклик не «з'їде».
> Confirm-**повідомлення** при цьому — live reactive (не зі знімка), тож воно лишається чесним,
> поки діалог відкритий і backend міняє recording-стан.

### C5. i18n (paraglide) — 10 нових ключів (uk + en), регенерація через `pnpm vite:build`

| ключ | uk | en |
|---|---|---|
| `record_selected` ({count}) | «Записати виділені ({count})» | "Record selected ({count})" |
| `stop_selected` ({count}) | «Зупинити виділені ({count})» | "Stop selected ({count})" |
| `streams_export_selected` ({count}) | «Експорт виділених ({count})…» | "Export selected ({count})…" |
| `streams_export_selected_title` ({count}) | «Експорт виділених ({count})» | "Export selected ({count})" |
| `record_done` ({count}) | «Розпочато запис: {count}» | "Started recording: {count}" |
| `record_skipped` ({count}) | «пропущено {count} (вже записуються)» | "skipped {count} (already recording)" |
| `stop_done` ({count}) | «Зупинено запис: {count}» | "Stopped recording: {count}" |
| `stop_skipped` ({count}) | «пропущено {count} (не записувались)» | "skipped {count} (not recording)" |
| `confirm_stop_selected_title` | «Зупинити виділені записи?» | "Stop selected recordings?" |
| `confirm_stop_selected_message` ({count}) | «Буде зупинено {count} виділених записів.» | "{count} selected recordings will be stopped." |

Безособові, без plural-форм (узгоджено з A/B). Whole-profile record-announce лишається pluralized
(`record_all_announce_*`) — selected використовує impersonal, консистентно з B (мінімальна
розбіжність, прийнятна).

## Зміни по файлах

- **`src-tauri/src/commands/stream_commands.rs`** — `select_by_ids` (чистий, + тести);
  `start_all_recordings(stream_ids: Option<Vec<String>>)`;
  `stop_all_recordings(stream_ids: Option<Vec<String>>) -> usize`.
- **`src-tauri/src/commands/stream_io_commands.rs`** — `export_streams(stream_ids:
  Option<Vec<String>>)` (фільтр через `select_by_ids`); scoped default-filename:
  `Some` → `{name}-selected-{count}.{ext}`, `None` → `{name}.{ext}` (finding 4).
- **`src-tauri/src/recording_control.rs`** — `stop_now(app, filter: Option<&HashSet<String>>)`;
  `stop_all_now` = `stop_now(None)`.
- **`src/lib/tauri.ts`** — `exportStreams(format, ids?)`, `startAllRecordings(ids?)`,
  `stopAllRecordings(ids?) -> Promise<number>`.
- **`src/stores/streams.ts`** — `$showExportStreamsDialog: atom<boolean>` → `$exportStreamsRequest:
  atom<ExportRequest | null>` (`ExportRequest = { ids: string[] | null }`).
- **`src/components/streams/ExportFormatDialog.tsx`** — читає `$exportStreamsRequest`; scoped
  заголовок; виклик передає `req.ids`.
- **`src/components/common/CommandPalette.tsx`** — команда «Експорт потоків» (рядок ~84)
  `$showExportStreamsDialog.set(true)` → `$exportStreamsRequest.set({ ids: null })`. Команди
  `record-all` (~89) / `stop-all` (~97) — **без змін** (лишаються whole-profile; R7). Палітра —
  глобальна поверхня, не пов'язана з section-local виділенням.
- **`src/components/streams/StreamsPanel.tsx`** — `selectedStartableCount` +
  `selectedStoppableCount`/`stoppableCount` (broad, R6; Stop-кнопка перемикається з `activeCount` на
  `stoppableCount`, метрика/чип лишають `activeCount`); Export-кнопка (динамічний підпис +
  знімок-скоуп клік); RecordAll/StopAll (динамічний підпис + disabled-за-виділенням +
  selected-обробники); `confirmStopAll: boolean` → `confirmStop: {scope} | null` (live-count
  повідомлення, finding 3); `composeRecord/StopSummary`. **Roving 14 без змін** (жодних нових
  елементів/індексів).
- **i18n** — 10 ключів (C5) у `src/i18n/messages/{uk,en}.json`; регенерувати через `pnpm vite:build`.
- **Документація (після коду):** парасолька — позначити закрите по віхі C у «Критеріях
  готовності»; оновити шапку запису (C in progress → done) і таблицю/розділ віх (C ✅).

## Поза обсягом (YAGNI)

- Узагальнення на songs/profiles/browser/schedule/PatternList — **віха D**.
- ⋯-меню **без змін**: Export/Record/Stop — суто тулбарні динамічні кнопки, не selection-only
  пункти меню (рішення №16 покрив move/copy/delete у меню в A/B).
- **Command Palette** export/record/stop — лишаються whole-profile (R7); selection-aware **лише**
  тулбар секції.
- Whole-profile record-announce лишається pluralized; selected — impersonal (C5).
- Без undo; без per-stream тостів. (Scoped default-filename для selected export — **у обсязі**
  (C1, finding 4); решта поведінки save-діалогу без змін.)
- Осиротілі розклади — як A/B (поза обсягом; record/stop їх не чіпають).

## Критерії приймання

1. **Експорт із тулбара:** без виділення кнопка «Експорт», експортує **весь** профіль (як зараз);
   за наявності виділення — «Експорт виділених (N)» (видимий текст == accessible name), діалог
   формату має заголовок «Експорт виділених (N)», експортує **лише** виділені id у M3U8/PLS.
2. **Backend експорту:** `export_streams` із `Some(ids)` серіалізує лише ці id (у порядку профілю,
   невідомі ігнор); `None` — весь профіль. Cancel пікера → `false` (без хибного success-announce).
3. **Record/Stop перемикання (№8/№14):** без виділення — «Записати все»/«Зупинити запис», увесь
   профіль; за наявності виділення — «Записати/Зупинити виділені (N)» (N = selCount, R1); record-
   `disabled` по `startable`-серед-виділених, stop-`disabled` по `stoppable`-серед-виділених.
   **Stop active-визначення єдине (R6, finding 1):** і whole-profile, і selected Stop рахують
   stoppability як `recording|connecting|reconnecting` (= backend `is_active`); та сама дія **не**
   міняє придатності залежно від наявності виділення. (Метрика «Активні записи» / чип «Запис»
   лишаються recording-only.)
4. **Частковий успіх (№5/R5):** record-виділених стартує придатні (`startable`), скіпає вже-в-сесії;
   stop-виділених зупиняє `stoppable`, скіпає незаписувані; зведене оголошення «Розпочато запис: N[,
   пропущено M (вже записуються)]» / «Зупинено запис: N[, пропущено M (не записувались)]» (клауза
   лише за ненульового скіпа; `skipped = selCount − done`, бо `startable`+`stoppable` розбивають
   виділення навпіл).
5. **Stop-confirm (R3, finding 3):** `stoppable` серед виділених > 1 → `ConfirmDialog` «Буде
   зупинено N виділених записів» (N — **live**, оновлюється, поки діалог відкритий, якщо backend
   міняє стан); рівно 1 → зупинка одразу; знімок виділення — на Confirm перед await; підсумок-
   announce авторитетний. Без виділення — Stop All-confirm (теж broad-count, R6).
6. **Scoped export filename (finding 4):** selected export пропонує в save-діалозі
   `{profile_name}-selected-{count}.{ext}`; whole-profile — `{profile_name}.{ext}`. Імена різні →
   NVDA-користувач чує реальний обсяг у filename-полі (фінальна confirmation-поверхня).
7. **Command Palette (R7):** команди «Записати все»/«Зупинити запис»/«Експорт потоків» лишаються
   whole-profile незалежно від section-виділення (назва == дія); selection-aware — лише тулбар.
8. **NVDA:** підписи кнопок/заголовок діалогу не «брешуть» про обсяг (visible == accessible name);
   один зведений polite-announce на жест record/stop; export-діалог підтверджує реальний скоуп.
9. `pnpm test`, `pnpm vite:build`, `cargo test` — зелені; ручна перевірка циклу виділення →
   Експорт виділених + Записати/Зупинити виділені з NVDA, **включно з частковим успіхом**
   (мішане виділення: частина записується, частина — ні).

## План тестів (гейти: `pnpm test` + `pnpm vite:build` + `cargo test`, НЕ `tsc`)

- **Rust (`stream_commands` `mod tests`):** `select_by_ids` — порядок профілю збережено; невідомі
  id ігнор; підмножина повертає лише обрані; порожні `ids` → порожньо. (start/stop-scoped повний
  шлях потребує AppHandle/manager — пін сигнатур у наявному стилі; чистий фільтр покрито
  `select_by_ids`.) `export_streams` фільтрацію перевіряємо через `select_by_ids` +
  `playlist::to_m3u8/to_pls` на підмножині. **Scoped filename (finding 4):** якщо логіку імені
  винести в чистий хелпер `export_file_name(profile, count: Option<usize>) -> String` — тест на
  `Some(n)` → `{name}-selected-{n}.{ext}`, `None` → `{name}.{ext}` (інакше це покрито ручним NVDA).
- **`StreamsPanel` тест:**
  - Export: підпис/`aria-disabled` за `selCount`; клік без виділення → `$exportStreamsRequest =
    {ids:null}`; клік із виділенням → `{ids:[...selected]}`.
  - Record: підпис/`disabled` за `selCount`+`selectedStartableCount`; клік із виділенням →
    `startAllRecordings(ids)` + announce `composeRecordSummary`.
  - Stop: підпис/`disabled` за `selCount`+`selectedStoppableCount` (**broad**, R6); >1
    stoppable-selected → confirm (selected-варіант title/message); ≤1 → `stopAllRecordings(ids)`
    одразу; announce `composeStopSummary`.
  - **R6 (finding 1):** один reconnecting-потік — Stop all `enabled` (broad `stoppableCount`),
    **не** disabled; той самий потік у виділенні → Stop selected `enabled` (однакова придатність
    із/без виділення). Метрика «Активні записи» лишається 0 (recording-only).
  - **R6 (finding 3):** confirm-повідомлення оновлюється, коли `$statuses` змінює стан виділеного
    потоку, поки діалог відкритий (live count, не зі знімка).
  - `composeRecordSummary`/`composeStopSummary` — лід + клауза скіпа лише за `>0`.
  - roving 14 коректний (без змін індексів).
- **`ExportFormatDialog` тест:** заголовок = scoped (`streams_export_selected_title({count})` при
  `{ids:[…]}`) vs generic (`{ids:null}`); виклик `exportStreams(format, ids)` передає правильний
  скоуп.
- **`CommandPalette` тест (R7, finding 2):** команди record-all/stop-all/export кличуть
  whole-profile-шлях (`startAllRecordings()`/`stopAllRecordings()` без ids; export →
  `{ids:null}`) **незалежно** від непорожнього `$streamSelection`.
- **Ручний NVDA:** виділити (Ctrl+Space/Shift+↓/Ctrl+A) → «Експорт виділених (N)» (кнопка +
  заголовок діалогу) → формат → файл; «Записати виділені (N)» (мішане виділення) → почути «Розпочато
  запис: N, пропущено M (вже записуються)»; «Зупинити виділені (N)» → confirm (>1) → «Зупинено
  запис: N[, пропущено M]»; зняти виділення → кнопки повертаються до «Експорт»/«Записати
  все»/«Зупинити запис» (увесь профіль).
