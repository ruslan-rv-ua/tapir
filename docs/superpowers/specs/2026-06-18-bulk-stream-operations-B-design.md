# Спека: масові операції над потоками — віха B (масовий перенос у профіль)

- **Дата:** 2026-06-18
- **Тип:** дизайн фічі (spec) — друга віха парасолькового запису
- **Статус:** затверджено, готово до writing-plans
- **Парасолька (north-star):** [docs/backlog/p1-bulk-stream-operations.md](../../backlog/p1-bulk-stream-operations.md)
  — усі дизайн-рішення (1–18) живуть там; ця спека на них **посилається**, а не дублює.
- **Спирається на (віха A, реалізована й перевірена 2026-06-18):**
  [A-design](2026-06-14-bulk-stream-operations-A-design.md) ·
  [A-plan](../plans/2026-06-14-bulk-stream-operations-A.md). Інфраструктуру виділення
  **не перевідкриваємо** — перевикористовуємо як шаблон.
- **Пов'язані документи:** [accessibility.md](../../accessibility.md) (§1.4 LiveAnnouncer, §3),
  [AGENTS.md](../../../AGENTS.md) (accessibility-first, backend-first, i18n).

## Мета

Закрити обсяг **віхи B** (розділ «Віхи» парасольки): масові **«Копіювати»** /
**«Перемістити»** виділених потоків в інший профіль, де ціль (профіль) обирається
**один раз**. Частковий успіх зі skip-семантикою (рішення №5): записуваний потік при
move й дублікат URL у цілі — пропускаються, не блокують решту; наприкінці — одне зведене
оголошення «Зроблено N, пропущено M (причина)». **Лише streams.** Решта списків — віха D;
експорт + запис/зупинка виділених — віха C.

Віха B спирається на готовий шар виділення з A (`$streamSelection`,
`CompositeSelection`/`SelectionChange`, central `announce`, section-scoped lifecycle,
Explorer-модель №15) і копіює форму bulk-операції A (`handleConfirmBulkDelete` /
`requestBulkDelete` на хендлі / кнопка в тулбарі / backend `remove_streams`).

## Зафіксований дизайн (рішення парасольки, на які спираємось)

- **№3** — набір операцій: «Перемістити в профіль» / «Копіювати в профіль», ціль один раз.
- **№5** — частковий успіх + skip-семантика (узгоджено зі `start_all_recordings`): придатні
  виконуються, непридатні пропускаються, далі зведений підсумок із причиною.
- **№16** — змішане ⋯-меню: bulk-придатні пункти (Перемістити/Копіювати) на **виділеному**
  рядку діють на множину й несуть кількість в accessible name; суто-одиничні пункти лишаються
  в однині й діють на **відкритий** рядок.
- **№17** (принцип) — суто-виділенські дії (Видалити/Перемістити/Копіювати) — **окремі кнопки**
  тулбара, `aria-disabled` без виділення (Експорт/Запис/Зупинка — динамічні, це віха C).
- **№15/№18** — Explorer-модель (⋯ на невиділеному згортає виділення до рядка) + bulk-фокус-
  патерн (найближчий уцілілий, ніколи `<body>`).

## Рішення цього циклу (реалізаційні розвилки, не покриті 1–18)

> Узгоджено в brainstorming 2026-06-18. Відкритих питань немає.

- **R1 — тулбар-кнопки в обсязі B.** Додаємо «Перемістити виділені (N)» / «Копіювати виділені (N)»
  поряд із наявною «Видалити виділені» (A), за принципом №17 і шаблоном A. Roving тулбара 12 → **14**.
- **R2 — підсумок по причинах.** Бекенд повертає структуру `{ transferred: string[],
  skippedRecording: number, skippedConflict: number }` (а не лише лічильники). Перелік
  `transferred` потрібен фронту, щоб для move прибрати **саме** перенесені рядки й коректно
  поставити фокус (пропущені лишаються). Оголошення додає клаузу причини **лише для ненульових**
  лічильників (найближче до №5 «(причина)»; NVDA-користувач розуміє, чому щось не перенеслось).
- **R3 — виділення після переносу.** **Не** чистимо явно. Після **move** наявний
  `pruneSelection`-ефект (на зміну `$streams`) прибере перенесені (зниклі) id → виділеними
  лишаються **тільки пропущені** (можна одразу розібратися). Після **copy** рядки й виділення
  лишаються (copy того самого набору в ще один профіль). Це розходиться з delete-A (повне
  очищення), але є природним наслідком A-інфраструктури та найменшим обсягом коду.

## Контекст (поточний стан коду, звірено 2026-06-18)

- **`src-tauri/src/commands/stream_commands.rs`** — `TransferMode {Copy, Move}` (serde
  lowercase); `prepare_transfer_stream(source, mode, now)` (copy → fresh id + added_at,
  паролі/ignorelist завжди зберігаються); `move_blocked_by_state` (Recording/Connecting/
  Reconnecting); одиничний `transfer_stream_to_profile` (guard target≠active, move-guard,
  `Profile::load` цілі, `add_stream_checked` з URL-dedup → `Conflict`, save target, для move —
  stop + retain active + save). Bulk-патерн A: `retain_streams` (чистий) + `remove_streams`
  (один stop-pass, один retain, один save, чесний count). `mod tests` має `sample()`/`with_id()`.
- **`src-tauri/src/profile.rs`** — `Profile::load(name)` (NotFound, окрім Default),
  `Profile::save` (atomic tmp+rename), `add_stream_checked` → `Conflict(self.name)` на дублікат URL.
- **`src-tauri/src/lib.rs:229-231`** — `invoke_handler!` містить `remove_stream`,
  `remove_streams`, `transfer_stream_to_profile`.
- **`src/lib/tauri.ts`** — `listProfiles`, `createProfile`, `copyStreamToProfile`/
  `moveStreamToProfile` (обидва → `transfer_stream_to_profile` з mode), `removeStreams`.
- **`src/components/streams/StreamTransferDialog.tsx`** — props `{ mode, streamName, profiles,
  onSelect, onCreateNew, onCancel }`; title із `copy/move_stream_to_profile_title({name})`;
  список профілів з лічильником `streamCount`; «+ Новий профіль…»; Cancel. react-aria
  `ModalOverlay`/`Modal`/`Dialog`.
- **`src/components/streams/StreamList.tsx`** — `StreamListHandle = ZoneEntry &
  { requestBulkDelete() }`; `Transfer` стейт (`{phase:"pick"|"create", mode, streamId, …}`);
  `openTransfer(mode, streamId)` (async listProfiles → pick); `doTransfer(mode, streamId,
  target)` (Conflict → пікер лишається відкритим); `handleConfirmBulkDelete` (читає
  `$streamSelection.get()`; target/survivors ДО await; `pendingBulkFocusRef` + `bulkDeleteSeq`;
  `useLayoutEffect` фокус після post-delete commit); `pruneSelection` ефект на `allStreams`;
  `imperativeExtra` → `{ requestBulkDelete }`.
- **`src/components/streams/StreamItem.tsx`** — прокидає `onCopyToProfile`/`onMoveToProfile`
  у `StreamContextMenu`; `isSelected` (суфікс назви + підсвітка).
- **`src/components/streams/StreamContextMenu.tsx`** — читає `$streamSelection`; `isSelected`;
  `moveDisabled` (recording/connecting/reconnecting/playing); пункти `copy-to-profile`
  («Копіювати в профіль…»), `move-to-profile` (`isDisabled={moveDisabled}`); `delete` уже
  динамічний за виділенням (`delete_selected({count})`).
- **`src/components/streams/StreamsPanel.tsx`** — тулбар roving **12** (Add 0, Import 1,
  Export 2, SelectAll 3, DeleteSelected 4, RecordAll 5, StopAll 6, chips 7–9, sorts 10–11);
  `streamListRef` (StreamListHandle); `selCount`/`selection`; `handleSelectAll`;
  lifecycle-clear (chip/reset/unmount).

## Ключові архітектурні рішення

### B1. Бекенд — `transfer_streams_to_profile` (bulk, дзеркало `remove_streams`)

Нова Rust-команда + чистий хелпер у [stream_commands.rs](../../../src-tauri/src/commands/stream_commands.rs).
Одиничний `transfer_stream_to_profile` **лишається** (шлях ⋯ на невиділеному рядку, де Conflict
тримає пікер відкритим — single-UX).

```rust
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkTransferResult {
    transferred: Vec<String>,   // source-id, які реально потрапили в ціль
    skipped_recording: usize,   // лише move: потік у активному стані
    skipped_conflict: usize,    // ціль уже має потік із таким URL
}

#[tauri::command]
pub async fn transfer_streams_to_profile(
    stream_ids: Vec<String>,
    target_profile: String,
    mode: TransferMode,
    state: tauri::State<'_, AppState>,
) -> Result<BulkTransferResult, String>;
```

**Чистий хелпер** (unit-тестований без Tauri, як `retain_streams`/`prepare_transfer_stream`):

```rust
/// Вставляє кожен source у `target` з URL-dedup. Повертає (id, що потрапили; кількість
/// конфліктів). `sources` — уже відфільтровані до придатних (для move записувані прибрані
/// викликачем). Порядок `transferred` — порядок `sources`.
fn insert_transfers(
    target: &mut Profile, sources: &[StreamInfo], mode: &TransferMode, now: &str,
) -> (Vec<String>, usize) {
    let mut transferred = Vec::new();
    let mut skipped_conflict = 0;
    for src in sources {
        let entry = prepare_transfer_stream(src, mode, now.to_string());
        match target.add_stream_checked(entry) {
            Ok(()) => transferred.push(src.id.clone()),  // copy: id source-а (фронт зіставляє за ним)
            Err(RadioError::Conflict(_)) => skipped_conflict += 1,
            Err(_) => skipped_conflict += 1, // add_stream_checked повертає лише Conflict
        }
    }
    (transferred, skipped_conflict)
}
```

> **`transferred` несе source-id**, а не новий id копії: фронт використовує його лише для
> move (прибрати рядки) і для фокуса — обидва оперують над поточним списком active-профілю.

**Команда** (послідовність, дзеркало single + `remove_streams`):
1. Guard: `target_profile == active.name` → `Forbidden` (як single).
2. Зібрати `sources` з active за `stream_ids` (зберегти порядок active-профілю; невідомі id — ігнор).
3. **move:** прочитати манагер; розбити `sources` на `eligible` і записувані
   (`move_blocked_by_state`) → `skipped_recording = записувані.len()`. **copy:** усі `sources`
   придатні, `skipped_recording = 0`.
4. `Profile::load(target)` на `spawn_blocking`.
5. `(transferred, skipped_conflict) = insert_transfers(&mut target, &eligible, &mode, now)`.
6. **Один** `target.save()` на `spawn_blocking`.
7. **move:** для `transferred` — `manager.stop_recording` (no-op, вони idle), `retain` active
   без `transferred`, **один** `active.save()` на `spawn_blocking`. **copy:** active не чіпаємо.
8. `Ok(BulkTransferResult { transferred, skipped_recording, skipped_conflict })`.

Реєстрація в `lib.rs` (після `transfer_stream_to_profile`). Обгортки в `lib/tauri.ts`:

```ts
export interface BulkTransferResult { transferred: string[]; skippedRecording: number; skippedConflict: number }
export async function moveStreamsToProfile(ids: string[], target: string): Promise<BulkTransferResult> {
  return invoke("transfer_streams_to_profile", { streamIds: ids, targetProfile: target, mode: "move" });
}
export async function copyStreamsToProfile(ids: string[], target: string): Promise<BulkTransferResult> {
  return invoke("transfer_streams_to_profile", { streamIds: ids, targetProfile: target, mode: "copy" });
}
```

### B2. Діалог — `StreamTransferDialog` під множину

Проп `streamName: string` → `count: number` (+ `streamName?: string` для single). Title:
- `count > 1` → нові `copy_selected_to_profile_title`/`move_selected_to_profile_title` ({count})
  — «Перемістити виділені потоки (N) у профіль».
- інакше → наявні `copy/move_stream_to_profile_title({ name: streamName ?? "" })`.

Решта розмітки (список профілів зі `streamCount`, «+ Новий профіль…», Cancel, фокус) — без змін.
Оновити `StreamTransferDialog.test.tsx`: передавати `count` (single-кейси — `count={1}`,
bulk-кейс — `count={N}` перевіряє bulk-title).

### B3. StreamList — конвергенція переносу (форма bulk-delete)

- **Узагальнити `Transfer`-target:**
  ```ts
  type TransferTarget = { kind: "single"; streamId: string } | { kind: "bulk" };
  type Transfer = null
    | { phase: "pick"; mode: "copy" | "move"; target: TransferTarget; profiles: ProfileMeta[] }
    | { phase: "create"; mode: "copy" | "move"; target: TransferTarget };
  ```
- **`openTransfer(mode, target)`** — `useCallback([])` (стабільний, щоб `imperativeExtra` міг
  його захопити без stale-closure): `listProfiles()` → `setTransfer({phase:"pick", mode, target,
  profiles: …filter(!isActive)})`. Помилка → `addToast`.
- **Хендл:** `StreamListHandle = ZoneEntry & { requestBulkDelete(): void; requestBulkTransfer(mode: "copy" | "move"): void }`.
  В `imperativeExtra`: `requestBulkTransfer: (mode) => openTransfer(mode, { kind: "bulk" })`
  (deps `[openTransfer]`; openTransfer стабільний). `requestBulkDelete` — без змін.
- **Маршрутизація відкриття:**
  - single ⋯ на **невиділеному** рядку: `onMoveToProfile`/`onCopyToProfile` → згорнути виділення
    до рядка (`replaceSelection(new Set([id]))`) **і** `openTransfer(mode, {kind:"single", streamId:id})`
    (Explorer-модель, дзеркало delete-A; single-шлях зберігає Conflict-recover).
  - ⋯ на **виділеному** рядку та тулбар-кнопки: `openTransfer(mode, {kind:"bulk"})`.
- **`doTransfer` (single)** — без змін, лише гілка `target.kind === "single"` (Conflict тримає
  пікер). **`doBulkTransfer(mode)`** (нова, читає виділення **на момент confirm**):
  ```
  ids = [...$streamSelection.get()]; якщо порожньо → закрити, no-op.
  visible = streams (видимий знімок до await, для фокуса)
  res = await (mode==="move" ? moveStreamsToProfile : copyStreamsToProfile)(ids, target)
  if (mode === "move" && res.transferred.length) {
    transferredSet = new Set(res.transferred)
    topIdx = max(0, visible.findIndex(s => transferredSet.has(s.id)))
    survivors = visible.filter(s => !transferredSet.has(s.id))
    $streams.set($streams.get().filter(s => !transferredSet.has(s.id)))   // pruneSelection прибере їх із виділення
    pendingBulkFocusRef = survivors.length ? survivors[min(topIdx, len-1)].id : null
    if (!survivors.length) onEmpty()
    bump seq
  }
  announce(composeSummary(mode, res), "polite")   // B5
  setTransfer(null)
  ```
  **copy:** рядки й виділення лишаються; фокус не чіпаємо (Modal сам відновить на тригер, що існує).
  **Помилка команди** (`Forbidden`/IO) → `addToast(String(e))`, `setTransfer(null)`.
- **Фокус move:** reuse наявний `pendingBulkFocusRef` + `bulkDeleteSeq` (за потреби перейменувати
  на `bulkOpSeq` — суто косметика) + `useLayoutEffect` (останнє слово після закриття react-aria
  Modal-діалогу; тригером може бути зниклий ⋯ або тулбар-кнопка).
- **Виділення:** **не** викликаємо `replaceSelection(∅)`; наявний `pruneSelection`-ефект
  (на `allStreams`) прибирає перенесені після move; copy лишає виділення (R3).
- **`create`-шлях** (новий профіль) працює і для bulk: `doCreateAndTransfer` після
  `createProfile` гілкується за `target.kind` → `doTransfer` (single) або `doBulkTransfer` (bulk).
  Свіжий профіль порожній → конфліктів нема.

### B4. ⋯-меню (№16) — `StreamContextMenu` / `StreamItem`

Читає `isSelected`/`selection.size` (уже є). Для пунктів `move-to-profile`/`copy-to-profile`:
- **виділений рядок:** видимий текст і accessible name → `move_selected`/`copy_selected` ({count});
  діють на множину (через незмінні колбеки `onMoveToProfile`/`onCopyToProfile`, які в StreamList
  тепер відкривають bulk, бо рядок ∈ виділення). `move-to-profile` **не** гейтиться `moveDisabled`,
  коли `isSelected` (записувані скіпляться бекендом, не блокують решту); `copy` ніколи не disabled.
- **невиділений рядок:** наявні single-підписи `copy_to_profile`/`move_to_profile`; `move`
  зберігає `moveDisabled`-гард; дія на відкритий рядок (collapse-to-row у StreamList).

Маршрутизація bulk-vs-single живе в **StreamList** (`onMoveToProfile`/`onCopyToProfile`
перевіряють `$streamSelection.get().has(id)`), як для delete (`onDelete`). Меню лише добирає
**підпис** за `isSelected`. Суто-одиничні пункти — без змін.

### B5. Оголошення (central `announce`, polite) — `composeSummary`

Frontend складає **один** рядок із `BulkTransferResult`:
- лід: move → `transfer_done_moved({count: transferred.length})` («Переміщено N»);
  copy → `transfer_done_copied({count})` («Скопійовано N»).
- якщо `skippedRecording > 0` → `, ` + `transfer_skipped_recording({count})` («пропущено N (записується)»).
- якщо `skippedConflict > 0` → `, ` + `transfer_skipped_conflict({count})` («пропущено N (вже в профілі)»).

Приклад: «Переміщено 3, пропущено 2 (записується), пропущено 1 (вже в профілі)». Один канал
announce (A6) — без тостів-дублів на кожен потік; Conflict більше **не** тост (це skip).

### B6. Тулбар — `StreamsPanel` (roving 12 → 14)

Кластер виділення row 2 (порядок: select-all, перенос, видалення-останнім):
`SelectAll 3, MoveSelected 4, CopySelected 5, DeleteSelected 6, RecordAll 7, StopAll 8`,
далі `chips 9–11, sorts 12–13`. Кнопки Move/Copy:
- `aria-disabled` коли `selCount === 0`; видимий текст = accessible name
  `move_selected({count: selCount})` / `copy_selected({count: selCount})` (WCAG 2.5.3);
- клік (коли `selCount > 0`) → `streamListRef.current?.requestBulkTransfer("move" | "copy")`.

Оновити: `toolbarRefs` (14 елементів), всі `tabIndex(i)` після індексу 3, всі індексні коментарі
й колокований у `ScreenZone` коментар «all 12 interactive items (indices 0–11)» → 14 / 0–13.
`streamListRef` тип уже `StreamListHandle` (розширений хендл прокидається сам).

### B7. i18n (paraglide) — нові ключі (uk + en), регенерація через `pnpm vite:build`

| ключ | uk | en |
|---|---|---|
| `move_selected` ({count}) | «Перемістити виділені ({count})…» | "Move selected ({count})…" |
| `copy_selected` ({count}) | «Копіювати виділені ({count})…» | "Copy selected ({count})…" |
| `move_selected_to_profile_title` ({count}) | «Перемістити виділені потоки ({count}) у профіль» | "Move selected streams ({count}) to profile" |
| `copy_selected_to_profile_title` ({count}) | «Копіювати виділені потоки ({count}) у профіль» | "Copy selected streams ({count}) to profile" |
| `transfer_done_moved` ({count}) | «Переміщено {count}» | "Moved {count}" |
| `transfer_done_copied` ({count}) | «Скопійовано {count}» | "Copied {count}" |
| `transfer_skipped_recording` ({count}) | «пропущено {count} (записується)» | "skipped {count} (recording)" |
| `transfer_skipped_conflict` ({count}) | «пропущено {count} (вже в профілі)» | "skipped {count} (already in profile)" |

Безособові, без plural-форм (узгоджено з A: `selection_count`, `streams_removed_bulk`).

## Зміни по файлах

- **`src-tauri/src/commands/stream_commands.rs`** — `BulkTransferResult`, `insert_transfers`
  (чистий), `transfer_streams_to_profile` (команда); тести в наявному `mod tests`.
- **`src-tauri/src/lib.rs`** — реєстрація `transfer_streams_to_profile`.
- **`src/lib/tauri.ts`** — `BulkTransferResult`, `moveStreamsToProfile`, `copyStreamsToProfile`.
- **`src/components/streams/StreamTransferDialog.tsx`** — `count` проп + bulk-title.
- **`src/components/streams/StreamTransferDialog.test.tsx`** — `count` у кейсах + bulk-title тест.
- **`src/components/streams/StreamList.tsx`** — `TransferTarget`; `openTransfer` → useCallback;
  `requestBulkTransfer` на хендлі (тип + imperativeExtra); `doBulkTransfer` + `composeSummary`;
  bulk-фокус move (reuse pendingBulkFocusRef/seq/useLayoutEffect); маршрутизація
  `onMoveToProfile`/`onCopyToProfile` bulk-vs-single (як `onDelete`); `doCreateAndTransfer`
  гілка за target.kind. **Без** явного очищення виділення (R3).
- **`src/components/streams/StreamContextMenu.tsx`** — підписи move/copy за `isSelected`
  (`move_selected`/`copy_selected` з count); move-item не disabled, коли `isSelected`.
- **`src/components/streams/StreamsPanel.tsx`** — 2 кнопки (Move 4, Copy 5), roving 14, всі
  індекси/коментарі; клік → `requestBulkTransfer`.
- **i18n** — 8 ключів (B7) у `src/i18n/messages/{uk,en}.json`; регенерувати.
- **Документація (після коду):** парасолька — позначити закрите по віхі B у «Критерії готовності»;
  оновити стан у шапці запису (B in progress → done) і таблицю віх (B ✅).

## Поза обсягом (YAGNI)

- Динамічний Експорт виділених, запис/зупинка виділених — **віха C**.
- Узагальнення на songs/profiles/browser/schedule/PatternList — **віха D**.
- Undo для bulk-переносу (одинична дія undo теж не має).
- Жодних змін у решті списків; одиничний `transfer_stream_to_profile` лишається як є.

## Критерії приймання

1. **Перенос із тулбара:** «Перемістити виділені (N)»/«Копіювати виділені (N)» (`aria-disabled`
   без виділення, count у видимому тексті = accessible name) відкривають діалог із bulk-title;
   ціль обирається **один раз** для всієї множини.
2. **Перенос із ⋯ (№16):** на виділеному рядку «Перемістити/Копіювати виділені (N)…» діють на
   множину; на невиділеному — згортають виділення до рядка й діють одинично (single-title,
   Conflict тримає пікер). Суто-одиничні пункти — без змін.
3. **Backend (один запис на ціль, один на active для move):** `transfer_streams_to_profile`
   повертає `{transferred, skippedRecording, skippedConflict}`; copy дає fresh id у цілі й лишає
   source; move прибирає лише `transferred` з active.
4. **Частковий успіх:** move записуваного потоку → `skippedRecording` (не блокує решту);
   дублікат URL у цілі → `skippedConflict` (copy і move). Зведене оголошення «Зроблено N»
   + клаузи причин лише для ненульових.
5. **Фокус/виділення після:** move → найближчий уцілілий рядок на/після верхнього перенесеного
   індексу (рахується з `transferred`), хвіст → новий останній, усе видиме → `onEmpty`, **ніколи
   `<body>`**; пропущені лишаються виділені (prune прибирає лише перенесені). copy → рядки й
   виділення лишаються; фокус не стрибає.
6. **NVDA:** один зведений polite-announce на жест переносу (без поштучних тостів); підписи
   кнопок/пунктів не «брешуть» про кількість.
7. `pnpm test`, `pnpm vite:build`, `cargo test` — зелені; ручна перевірка циклу виділення →
   перенос (toolbar + ⋯) з NVDA, **включно з частковим успіхом** (записуваний + дублікат URL).

## План тестів (гейти: `pnpm test` + `pnpm vite:build` + `cargo test`, НЕ `tsc`)

- **Rust (`stream_commands` `mod tests`):**
  - `insert_transfers` — copy дає fresh id, source-id у `transferred`; дублікат URL у цілі →
    `skipped_conflict`, не вставлено; порядок `transferred` стабільний; move зберігає id.
  - (інтеграційний за наявним стилем, якщо доцільно) move-skip записуваних рахується окремо.
- **`StreamTransferDialog.test.tsx`:** `count={1}` → single-title (наявні кейси); `count={3}`
  → bulk-title; список профілів/create/cancel працюють незмінно.
- **`StreamList` тест:**
  - bulk **move** кличе `moveStreamsToProfile(ids, target)`; `$streams` прибирає лише
    `transferred`; фокус → найближчий уцілілий (НЕ `<body>`); хвіст → останній; усе видиме →
    `onEmpty`; пропущені (НЕ в `transferred`) лишаються виділені.
  - bulk **copy** кличе `copyStreamsToProfile`; `$streams` без змін; виділення лишається; фокус
    не стрибає.
  - `composeSummary` — лід move/copy + клаузи лише для ненульових skip-лічильників.
  - ⋯ move/copy на **невиділеному** → `replaceSelection({id})` + single-openTransfer; на
    **виділеному** → bulk-openTransfer.
  - `requestBulkTransfer("move"/"copy")` відкриває pick із bulk-target.
- **`StreamsPanel` тест:** кнопки Move/Copy — `aria-disabled`/підпис із count за `selCount`;
  клік тригерить `requestBulkTransfer`; roving 14 елементів коректний (Tab/стрілки доходять до
  sorts 12–13).
- **Ручний NVDA:** виділити (Ctrl+Space/Shift+↓/Ctrl+A) → «Перемістити виділені» (toolbar і ⋯)
  → обрати профіль → почути «Переміщено N (, пропущено …)» → фокус на уцілілому; повторити copy
  (рядки лишаються); спровокувати skip (записуваний потік + дублікат URL у цілі).
