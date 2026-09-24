---
slug: ipc-seam-test-adapter
title: "Другий адаптер на шві IPC: тестовий адаптер у пам'яті, будівники фікстур, словник подій і відмов"
summary: "34 тестові файли пишуть свій частковий мок tauri.ts і копіюють фікстури; у шов — спільний адаптер у пам'яті, мапа подій, словник кодів відмов"
priority: P2
type: idea
status: draft
effort: M
kind: chore
target: 0.3.0
updated: 2026-09-24
a11y: false
depends_on: []
blocks: []
touches:
  - src/lib/tauri.ts
  - src/hooks/useTauriEvent.ts
  - src/hooks/useProfileSync.ts
  - src/test
  - src/lib/playRefusal.ts
  - src/lib/recordingToggle.ts
  - src/lib/shellOpenError.ts
  - src/lib/transportControl.ts
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
---

# Другий адаптер на шві IPC: тестовий адаптер у пам'яті, будівники фікстур, словник подій і відмов

> **Контекст:** знахідка [огляду архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md);
> фронтенд, залежність — порти й адаптери (IPC до Rust). Режим — **ОБГОВОРЕННЯ** (`idea` +
> `draft`): коду не правити, інтерфейс не спроєктовано. Номери рядків — стан на `f09f36b`.

## Опис

`src/lib/tauri.ts` — шов між webview і Rust, і стоїть він правильно. Але адаптер за ним
один — прод (`invoke`, `listen`), тож тести будують власні, а назви подій і коди
відмов живуть рядками поза швом. Ідея — поглибити шов, **а не обгортки**: функції
`tauri.ts` лишаються тонкими.

## Тертя

**Тести.** 34 зі 100 тестових файлів у `src/` пишуть власну фабрику
`vi.mock("…/lib/tauri")`; ще 5 тестів хуків подій мокають `@tauri-apps/api/event`
власною мапою слухачів. У `src/test/` лише `setup.ts`; `mockIPC` не вжито ніде. Найбільші
фабрики: `StreamsPanel.test.tsx` — 20 `vi.fn` (`:15`), `StreamList.test.tsx` — 15 (`:16`),
`ProfilesPanel.test.tsx` — 10 (`:15`). Мок частковий: новий виклик у компоненті означає
дописати `vi.fn` у кожен мок модуля.

Фікстури скопійовані літералами: `GlobalSettings` (за `smtcEnabled`) — у 8 файлах,
`StreamInfo` (за `unsupportedCodec:`) — у 10, `PlayerStatus` (`volume`, `positionMs`,
`durationMs`) — у 15. Зняти мертве `bandwidthLimitKbps` (`a3076b1`) — 7 тестових файлів по
рядку; зняти `logRotation` (`1d71099`) — 6; додати `sortBy` (`c94323c`) — 5. Звідси спільні
зміни тестів без спільної поведінки: `AudioTab.test` ↔ `HotkeysTab.test` і
`PlayerPanel.test` ↔ `StreamList.test` — по 10 комітів, `PlayerPanel.test` ↔ `AudioTab.test` — 9.

**Події.** `useTauriEvent<T>(event: string, …)` (`src/hooks/useTauriEvent.ts:4`): тип даних
стверджує викликач, у 28 місцях, плюс сирий `listen` у `src/hooks/useProfileSync.ts:18`.
Назву з типом не зв'язує ніщо: `recording-completed` слухають як `RecordingCompletedPayload`
(`src/App.tsx:387`) і без типу (`src/components/songs/SongsPanel.tsx:123`); описка в назві
компілюється й мовчки не спрацьовує. `docs/architecture.md:335` каже, що типи payload'ів
«перевіряє `tsc`», — він перевіряє лише стверджене на місці виклику.

**Коди відмов.** Rust тримає коди константами й пришпилює тестом
(`src-tauri/src/commands/stream_commands.rs:16-24`, тест `:869`; `player_commands.rs:9`;
`shell_open.rs:9-14`). TS порівнює `String(err)` з літералами в чотирьох модулях:
`src/lib/playRefusal.ts:20-24`, `src/lib/recordingToggle.ts:45-52`,
`src/lib/shellOpenError.ts:13` і `:30`, `src/lib/transportControl.ts:55`. `"unsupported_codec"`
записано двічі (`playRefusal.ts:22`, `transportControl.ts:55`), `"stream_not_found"` —
двічі (`playRefusal.ts:24`, `recordingToggle.ts:52`); єдиного переліку на боці TS немає.

## Тест видалення

- **Обгортки `tauri.ts`** (1007 рядків: 88 обгорток на 87 `invoke`, 62 типи; росте
  дописуванням, +1117/−110 за весь час) — без них рядки-команди розповзуться по місцях
  виклику. Виправдані. **Поглиблювати їх не треба**: тости, повтори чи розбір відмов у
  них змішали б політику з адаптером.
- **`useTauriEvent.ts`** (17 рядків) — без нього гонка `cancelled`/`unlisten` повториться
  у 28 місцях. Проходить, але контракт «назва ↔ дані» лишено кожному викликачу.
- **34 часткові моки** — видаляти нічого: це складність модуля, якого немає, розкладена
  по файлах. Прод-адаптер один, тестових — 34 одноразові; для тестів шов гіпотетичний.
- **Розбирачі відмов** (4 модулі) — проходять, але словник кодів під ними нічий.

## Напрям

У шві `tauri.ts` з'являються: **другий адаптер** — у пам'яті, спільний для тестів
(тримає стан потоків, глобальних налаштувань і плеєра, відповідає на команди, шле
події; тест налаштовує його, а не переписує мок); **будівники фікстур** головних DTO —
для адаптера й для тестів, що засівають атоми (`$playerStatus`, `$statuses`) напряму;
**мапа «назва події → тип даних»**, через яку йдуть підписки; **словник кодів відмов** —
один перелік на боці TS навпроти констант Rust. Компоненти й хуки кличуть ті самі
обгортки, тести йдуть через адаптер, чотири розбирачі відмов — через словник. Форму
інтерфейсу вирішує обговорення.

## Що дає

- **Локальність:** нове поле `GlobalSettings` — один будівник, а не 5–7 тестових файлів;
  нова подія — один рядок мапи.
- **Важіль і тести через інтерфейс:** один адаптер на 34 тестові файли й 5 тестів хуків
  (їх зачіпає й `event-speech-delivery`); тест бачить «команда → стан → подія», як прод.
- **Знімає як клас:** описку в назві події й чужий тип на підписці; розбіжні літерали
  одного коду; метушню «фікстура забула поле».
- **Не знімає** дрейф типів Rust ↔ TS — це [ts-rs-drift-guard](p3-ts-rs-drift-guard.md).
  Вад із цієї партії огляду зміна не прибирає: вона про ціну тестів і словник.

## Обмеження

- Без генератора: [нотатка tauri-specta](../notes/tauri-specta-bindings.md) і
  [tauri-specta-bindings](done/p3-tauri-specta-bindings.md) — «не мігрувати, поки RC»;
  мапа й словник теж рукописні.
- Форма подій не змінюється: [ADR 2026-09-15](../decisions/2026-09-15-event-carries-what-the-transition-knows.md) —
  мапа називає наявні типи, а не зводить їх до `StreamStatus`.
- Відмови йдуть кодами без чисел ([record-refusals-untranslated](done/p2-record-refusals-untranslated.md)).
  Запасний шлях свій і свідомий: `playRefusal` і `recordingToggle` пропускають невідомий
  текст сирим, `shellOpenError` дає загальну фразу, `transportControl` — «error».
- Контракт команд — `Result<T, String>` на межі IPC ([architecture.md](../architecture.md), §6).
- Перетин: TS-половина [status-fixtures-rebuilt-per-test-file](p3-status-fixtures-rebuilt-per-test-file.md)
  (17 літералів `StreamStatus`) — підмножина будівників звідси; Rust-половина лишається там.

## Відкриті питання

- **Де стоїть адаптер:** під `invoke`/`listen` (`mockIPC` з `shouldMockEvents`,
  `@tauri-apps/api` 2.10; мова рядків-команд, перевіряє й обгортки) чи на рівні функцій
  `tauri.ts` (мова TS-типів, без тестового API Tauri)?
- **Скільки стану він тримає:** таблиця відповідей чи фейк зі станом (додав потік →
  `getStreams` його повертає → прийшла `streams-changed`)? Фейк ближчий до прод-адаптера,
  але це ще одна реалізація на супровід.
- **Як мігрувати:** 34 файли разом чи нові тести — одразу, старі — коли торкнулись?
- **Чи пришпилювати словник TS до констант Rust** — тестом, що читає Rust, чи ні?

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] Обговорення обрало місце другого адаптера й міру його стану
- [ ] Вирішено долю мапи подій і словника кодів: тут, окремим записом чи відкинуто
- [ ] Вирішено: [фікстури статусу](p3-status-fixtures-rebuilt-per-test-file.md) злиті сюди чи окремо
- [ ] Запис переведено в `planned` з критеріями або закрито з причиною

## Документи

- [Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md)
- [tauri-ts-type-drift](done/p2-tauri-ts-type-drift.md) — дрейф типів подій; інвентар моків
  станом на 2026-09-05 — у [нотатці tauri-specta](../notes/tauri-specta-bindings.md)
- шляхи коду: `src/lib/tauri.ts`, `src/hooks/useTauriEvent.ts`, `src/test/setup.ts`
