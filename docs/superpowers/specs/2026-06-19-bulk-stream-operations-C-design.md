# Спека: масові операції над потоками — віха C (експорт + запис/зупинка виділених)

- **Дата:** 2026-06-19
- **Тип:** дизайн фічі (spec) — третя віха парасолькового запису
- **Статус:** затверджено, готово до writing-plans
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
- **R3 — Stop-selected дзеркалить Stop All-підтвердження.** `ConfirmDialog`, коли активних серед
  виділених **> 1** (повідомлення-варіант «Зупинити запис N виділених потоків?»); рівно 1 активний
  — зупинка одразу. Узгоджено з наявним `handleStopAll` (guard від випадкової масової зупинки;
  запис — деструктивний). Record-selected підтвердження **не** має (як і «Записати все»).
- **R4 — діалог формату експорту відображає скоуп.** Заголовок/heading `ExportFormatDialog` стає
  «Експорт виділених (N)», коли відкрито з виділенням (інакше «Експорт потоків»). NVDA-чесно: діалог
  підтверджує реальний обсяг, не натякає мовчазно на весь профіль. Знімок id робиться **на момент
  кліку** (route-fix як у B): поки модаль відкрита, фокус заблокований — виділення не зміниться.
- **R5 — підсумок record/stop: `skipped = selCount − done`.** Бекенд повертає лише `done`
  (`started`/`stopped`) — авторитетну кількість. `done = startable/active-серед-виділених` (усі
  придатні стартують/стопляться), тож `done + skipped = selCount` завжди й `skipped ≥ 0`. Клауза
  причини додається лише за `skipped > 0` (дзеркало B `composeSummary`). Не потрібна структура-
  результат (на відміну від B `BulkTransferResult`): єдина причина скіпа для record — «вже
  записується», для stop — «не записувався», тож лічильника `done` достатньо.

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
  `startableCount` (state ∉ {recording,connecting,reconnecting}), `activeCount` (recording),
  `recordAllAnnouncement` (pluralized), `handleRecordAll`/`handleStopAll`/`doStopAll`,
  `confirmStopAll: boolean` + `ConfirmDialog`. Export-кнопка (idx 2) `aria-disabled={isEmpty}` →
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
  Після клону `profile.streams`: `let streams = match stream_ids { Some(ids) =>
  select_by_ids(&all, &ids), None => all };` Решта (гілка формату, пікер, `{name}.{ext}`, write,
  `Ok(true/false)`) **без змін** — ім'я файлу лишається `{profile_name}.{ext}` (вміст визначає
  обсяг; назва профілю — достатній контекст).
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

- **Похідні лічильники** (мемо, серед виділених):
  ```ts
  const ACTIVE = new Set(["recording", "connecting", "reconnecting"]);
  const selectedStartableCount = useMemo(() =>
    [...selection].filter(id => streamIds.has(id) && !ACTIVE.has(statuses[id]?.state ?? "idle")).length,
    [selection, statuses, streamIds]);
  const selectedActiveCount = useMemo(() =>
    [...selection].filter(id => ACTIVE.has(statuses[id]?.state ?? "idle")).length,
    [selection, statuses]);
  ```
- **RecordAll (idx 7):**
  - текст = `selCount > 0 ? record_selected({ count: selCount }) : record_all()`;
  - `disabled = selCount > 0 ? selectedStartableCount === 0 : startableCount === 0`;
  - `handleRecordAll`: `selCount > 0` → `const ids = [...selection]; const started = await
    startAllRecordings(ids); announce(composeRecordSummary(ids.length, started), "polite")`;
    інакше наявний whole-profile-шлях (`recordAllAnnouncement(started)` — pluralized, без змін).
- **StopAll (idx 8):**
  - текст = `selCount > 0 ? stop_selected({ count: selCount }) : stop_all()`;
  - `disabled = selCount > 0 ? selectedActiveCount === 0 : activeCount === 0`;
  - `handleStopAll`: `selCount > 0` → `selectedActiveCount > 1` ? відкрити confirm(selected) :
    `doStopSelected([...selection])`; інакше наявний whole-profile-шлях
    (`activeCount > 1` ? confirm(all) : `doStopAll()`).
  - `doStopSelected(ids)`: `const stopped = await stopAllRecordings(ids);
    announce(composeStopSummary(ids.length, stopped), "polite")`.
- **Підтвердження (R3)** — `confirmStopAll: boolean` → `confirmStop: null | { scope: "all" |
  "selected"; ids: string[]; count: number }` (count = active-серед-обраного, для повідомлення;
  ids — знімок на кліку):
  - title = `scope === "selected" ? confirm_stop_selected_title() : confirm_stop_all_title()`;
  - message = `scope === "selected" ? confirm_stop_selected_message({ count }) :
    confirm_stop_all_message({ count })`;
  - `onConfirm` → `scope === "selected" ? doStopSelected(ids) : doStopAll()`.
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

> **Знімок виділення — до await** (bulk-патерн A/B): `[...selection]` фіксується на момент кліку
> (для stop-через-confirm — у стейт `confirmStop.ids`), тож зведення/виклик не «з'їде», якщо стан
> зміниться під час IPC.

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
  Option<Vec<String>>)` (фільтр через `select_by_ids`).
- **`src-tauri/src/recording_control.rs`** — `stop_now(app, filter: Option<&HashSet<String>>)`;
  `stop_all_now` = `stop_now(None)`.
- **`src/lib/tauri.ts`** — `exportStreams(format, ids?)`, `startAllRecordings(ids?)`,
  `stopAllRecordings(ids?) -> Promise<number>`.
- **`src/stores/streams.ts`** — `$showExportStreamsDialog: atom<boolean>` → `$exportStreamsRequest:
  atom<ExportRequest | null>` (`ExportRequest = { ids: string[] | null }`).
- **`src/components/streams/ExportFormatDialog.tsx`** — читає `$exportStreamsRequest`; scoped
  заголовок; виклик передає `req.ids`.
- **`src/components/common/CommandPalette.tsx`** — команда «Експорт потоків» (рядок ~84)
  `$showExportStreamsDialog.set(true)` → `$exportStreamsRequest.set({ ids: null })` (палітра не
  пов'язана з виділенням — завжди **весь** профіль).
- **`src/components/streams/StreamsPanel.tsx`** — `selectedStartableCount`/`selectedActiveCount`;
  Export-кнопка (динамічний підпис + знімок-скоуп клік); RecordAll/StopAll (динамічний підпис +
  disabled-за-виділенням + selected-обробники); `confirmStop` (scope all|selected);
  `composeRecord/StopSummary`. **Roving 14 без змін** (жодних нових елементів/індексів).
- **i18n** — 10 ключів (C5) у `src/i18n/messages/{uk,en}.json`; регенерувати через `pnpm vite:build`.
- **Документація (після коду):** парасолька — позначити закрите по віхі C у «Критеріях
  готовності»; оновити шапку запису (C in progress → done) і таблицю/розділ віх (C ✅).

## Поза обсягом (YAGNI)

- Узагальнення на songs/profiles/browser/schedule/PatternList — **віха D**.
- ⋯-меню **без змін**: Export/Record/Stop — суто тулбарні динамічні кнопки, не selection-only
  пункти меню (рішення №16 покрив move/copy/delete у меню в A/B).
- Whole-profile record-announce лишається pluralized; selected — impersonal (C5).
- Без undo; без per-stream тостів; ім'я файлу експорту лишається `{profile_name}.{ext}` (для
  підмножини теж — вміст визначає обсяг).
- Осиротілі розклади — як A/B (поза обсягом; record/stop їх не чіпають).

## Критерії приймання

1. **Експорт із тулбара:** без виділення кнопка «Експорт», експортує **весь** профіль (як зараз);
   за наявності виділення — «Експорт виділених (N)» (видимий текст == accessible name), діалог
   формату має заголовок «Експорт виділених (N)», експортує **лише** виділені id у M3U8/PLS.
2. **Backend експорту:** `export_streams` із `Some(ids)` серіалізує лише ці id (у порядку профілю,
   невідомі ігнор); `None` — весь профіль. Cancel пікера → `false` (без хибного success-announce).
3. **Record/Stop перемикання (№8/№14):** без виділення — «Записати все»/«Зупинити запис», увесь
   профіль (поведінка незмінна); за наявності виділення — «Записати/Зупинити виділені (N)» (N =
   selCount, R1); `disabled` по startable/active **серед виділених**.
4. **Частковий успіх (№5/R5):** record-виділених стартує придатні, скіпає вже-активні; stop-
   виділених зупиняє активні, скіпає незаписувані; зведене оголошення «Розпочато запис: N[,
   пропущено M (вже записуються)]» / «Зупинено запис: N[, пропущено M (не записувались)]» (клауза
   лише за ненульового скіпа; `skipped = selCount − done`).
5. **Stop-confirm (R3):** активних серед виділених > 1 → `ConfirmDialog` «Зупинити запис N
   виділених потоків?»; рівно 1 → зупинка одразу; без виділення — наявний Stop All-confirm.
6. **NVDA:** підписи кнопок/заголовок діалогу не «брешуть» про обсяг (visible == accessible name);
   один зведений polite-announce на жест record/stop; export-діалог підтверджує реальний скоуп.
7. `pnpm test`, `pnpm vite:build`, `cargo test` — зелені; ручна перевірка циклу виділення →
   Експорт виділених + Записати/Зупинити виділені з NVDA, **включно з частковим успіхом**
   (мішане виділення: частина записується, частина — ні).

## План тестів (гейти: `pnpm test` + `pnpm vite:build` + `cargo test`, НЕ `tsc`)

- **Rust (`stream_commands` `mod tests`):** `select_by_ids` — порядок профілю збережено; невідомі
  id ігнор; підмножина повертає лише обрані; порожні `ids` → порожньо. (start/stop-scoped повний
  шлях потребує AppHandle/manager — пін сигнатур у наявному стилі; чистий фільтр покрито
  `select_by_ids`.) `export_streams` фільтрацію перевіряємо через `select_by_ids` +
  `playlist::to_m3u8/to_pls` на підмножині.
- **`StreamsPanel` тест:**
  - Export: підпис/`aria-disabled` за `selCount`; клік без виділення → `$exportStreamsRequest =
    {ids:null}`; клік із виділенням → `{ids:[...selected]}`.
  - Record: підпис/`disabled` за `selCount`+`selectedStartableCount`; клік із виділенням →
    `startAllRecordings(ids)` + announce `composeRecordSummary`.
  - Stop: підпис/`disabled` за `selCount`+`selectedActiveCount`; >1 active-selected → confirm
    (selected-варіант title/message); ≤1 → `stopAllRecordings(ids)` одразу; announce
    `composeStopSummary`.
  - `composeRecordSummary`/`composeStopSummary` — лід + клауза скіпа лише за `>0`.
  - roving 14 коректний (без змін індексів).
- **`ExportFormatDialog` тест:** заголовок = scoped (`streams_export_selected_title({count})` при
  `{ids:[…]}`) vs generic (`{ids:null}`); виклик `exportStreams(format, ids)` передає правильний
  скоуп.
- **Ручний NVDA:** виділити (Ctrl+Space/Shift+↓/Ctrl+A) → «Експорт виділених (N)» (кнопка +
  заголовок діалогу) → формат → файл; «Записати виділені (N)» (мішане виділення) → почути «Розпочато
  запис: N, пропущено M (вже записуються)»; «Зупинити виділені (N)» → confirm (>1) → «Зупинено
  запис: N[, пропущено M]»; зняти виділення → кнопки повертаються до «Експорт»/«Записати
  все»/«Зупинити запис» (увесь профіль).
