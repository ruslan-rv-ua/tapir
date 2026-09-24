---
slug: player-mirror-module
title: "Один модуль дзеркала програвача: переходи, Оголошення і Вимкнений звук"
summary: "Одну подію player-status розбирають п'ять файлів, «те саме джерело» записане двічі й розійшлося; ідея — один модуль дзеркала програвача"
priority: P2
type: idea
status: draft
effort: M
kind: chore
target: 0.3.0
updated: 2026-09-24
a11y: true
depends_on: []
blocks: []
touches:
  - src/App.tsx
  - src/lib/playbackAnnounce.ts
  - src/lib/muteCleanup.ts
  - src/lib/muteControl.ts
  - src/lib/transportControl.ts
  - src/lib/playbackTransport.ts
  - src/stores/player.ts
  - src/components/player/PlayerPanel.tsx
  - src/hooks/useGlobalShortcuts.ts
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
---

# Один модуль дзеркала програвача: переходи, Оголошення і Вимкнений звук

> **Контекст:** знахідка [огляду архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md).
> `idea` + `draft` → режим **ОБГОВОРЕННЯ**: коду не чіпати, інтерфейс ще не спроєктовано.
> Номери рядків — стан на `f09f36b`.

## Опис

Дзеркало програвача — атоми `$playerStatus` і `$muteState` у вебв'ю та правила, що їх
оновлюють, озвучують переходи й повертають звук. Щоб зрозуміти одну подію `player-status`,
треба прочитати п'ять файлів: `handlePlayerStatus` (`src/App.tsx:228-276`),
`playbackAnnounce.ts`, `muteControl.ts`, `muteCleanup.ts`, `stores/player.ts`. Зшиває їх
`App.tsx`, у якого немає жодного тесту, а «який це перехід» кожен споживач вирішує сам — і
відповіді вже розійшлися.

## Тертя

- **«Те саме джерело» записано двічі, копії розійшлися.** `sameSource`
  (`src/lib/playbackAnnounce.ts:37-44`) порівнює прев'ю за `url` (:42); інлайн-копія для
  `sourceChangedWhilePlaying` (`src/App.tsx:266-274`) прев'ю не знає. Оголошення каже
  «Відтворення: B», а перемикач Вимкненого звуку лишається —
  [preview-switch-keeps-mute](p2-preview-switch-keeps-mute.md). `ccba686` виніс Оголошення в
  `playbackAnnounce.ts` уже з гілкою `url`; прапорці для звуку лишились інлайн.
- **Правило перевірене константами, а не там, де рахується.** `applyMuteCleanup` приймає
  готові прапорці (`src/lib/muteCleanup.ts:5-10`), `muteCleanup.test.ts:28-30` подає їх
  константами; код, що їх обчислює (`App.tsx:265-274`), не перевіряє ніщо.
- **Токен `$muteState.restoring` пишуть три модулі:** `muteCleanup.ts` (сім викликів
  `$muteState.set`), `muteControl.ts:114,122` і ручне відновлення в `handleStop`
  (`src/components/player/PlayerPanel.tsx:210-232`). «Зупинити» для файлу піднімає рівень
  **до** `stopPlayback` (:215-218), будь-яка інша зупинка — після, гілкою `stopped`
  (`muteCleanup.ts:49-66`). Коментар поля (`src/stores/player.ts:28`) називає одне
  застосування з трьох; гілку `handleStop` при вимкненому звуці не проходить жоден тест.
- **Придушення дубля живе в `App`.** `pendingConnectRef` (`App.tsx:226`) взводять `connecting`
  і `resuming` з `player-announce` (:340, :352), знімають :237, :372, :376; тест має лише
  предикат `suppressesStarted` (`playbackAnnounce.ts:24-35`).
- **Автоперехід іде повз `transportControl`.** `handlePlayerEnded` (`App.tsx:286-303`) сам
  виконує `TransportAction`: без запобіжника `pending` (`src/lib/transportControl.ts:73`) і з
  тостом у вікні на будь-яку невдачу (:299), тоді як `reportSkipFailure`
  (`transportControl.ts:47-69`) обирає поверхню за фокусом вікна.
- **Спільні зміни** (без merge-комітів): `App.tsx` ↔ `playbackAnnounce.test.ts` — 9,
  `PlayerPanel.test.tsx` ↔ `transportControl.test.ts` — 9.

## Тест видалення

- `muteCleanup.ts`, `suppressesStarted` і `resolveEndedAction` (`src/lib/playbackTransport.ts:60-71`)
  мають по одному викликачу — `App.tsx:275`, :235, :293. Видалення не розносить складність по
  N місцях, а переносить у той самий `App.tsx`: це мілкі фрагменти модуля, якого немає.
- `muteControl.ts` тест видалення проходить: його кличуть `PlayerPanel.tsx:176`, гарячі клавіші
  (`src/hooks/useGlobalShortcuts.ts:103,112`) і `App.tsx:262,361`. Вимкнений звук заслуговує на
  модуль; розкладати його правила на `muteControl`, `muteCleanup`, `App` і `PlayerPanel` — ні.
- `transportControl.ts`, `resolveTransportAction` і чисті селектори `playbackAnnounce.ts`
  заробляють своє: їх не різати, а зібрати навколо них.

## Напрям

Один модуль володіє дзеркалом програвача. Він приймає події з Rust (`player-status`,
`player-announce`, `player-ended`, `player-progress`, `transport-skip`) і команди вебв'ю
(Головна кнопка, «Зупинити», попередній / наступний, Автоперехід, `Ctrl+M`). Перехід класифікує
**один раз** — старт, зміна джерела, пауза, відновлення, зупинка — і з цього сам вирішує
Оголошення й придушення дубля, пам'ять рівня, зняття перемикача Вимкненого звуку, поверхню
відповіді на невдачу. `App.tsx` лише підписує події; `PlayerPanel` і гарячі клавіші кличуть
модуль. Категорія залежності — порти й адаптери: шов — IPC до Rust; другий адаптер, тестовий,
приймає послідовності статусів і записує Оголошення та виклики IPC.

Межі з сусідами: [backend-mirror-stores](p2-backend-mirror-stores.md) — дзеркала потоків,
вішліста й налаштувань, не програвача; [playback-source-module](p2-playback-source-module.md) —
тотожність і назва джерела; `event-speech-delivery` — Оголошення про інші події бекенду.

## Що дає

- **Локальність.** Правило ADR 2026-08-16 §3 («нове джерело знімає перемикач, пауза — ні») і
  класифікація переходу мають одного власника.
- **Важіль.** Новий викликач — скажімо, міст `Ctrl+Shift+U`, який `muteControl.ts:88-92` називає
  майбутнім третім, — дістає Оголошення, повернення звуку й поверхню відповіді без повторів.
- **Тести через інтерфейс.** Послідовність статусів → Оголошення й виклики IPC замість
  прапорців-констант: сторож на межі дзеркала, якого ADR 2026-09-15 §6 вимагає для статусу запису.
- **Клас дефектів зникає.** Латка [preview-switch-keeps-mute](p2-preview-switch-keeps-mute.md)
  у 0.1.1 зводить порівняння до одного `sameSource` і виносить прапорці в чисту функцію, але
  перехід і далі класифікують окремо селектор Оголошень і прапорці звуку. Модуль прибирає саме
  це й успадковує регресійний тест латки.

## Обмеження

- [ADR 2026-08-16](../decisions/2026-08-16-silence-is-mute-or-zero-volume.md): перемикач і
  нульовий рівень — різні величини з різним часом життя (§1, §3), злиття станів відхилене;
  пауза перемикач не знімає (`muteCleanup.ts:28-29`).
- [ADR 2026-09-01](../decisions/2026-09-01-response-surfaces-ear-window-system.md) §3: коли вухо
  мовчить, поверхню обирає модуль дії за фокусом вікна, не за тригером; `seek-start` відповідає
  вухом (`transportControl.ts:103-105`).
- [ADR 2026-09-15](../decisions/2026-09-15-event-carries-what-the-transition-knows.md) §6:
  рішення про дзеркало — чиста функція в `src/lib/`, в `App.tsx` лише проводка. Своє правило
  про тіло події ADR на інші події не поширює: `player-progress` лишається окремим каналом.
- «Підключення» і «недоступне» для останнього джерела вирішує Rust (`player-announce`), бо
  вебв'ю їх не виводить (`playbackAnnounce.ts:50-51`); межа Rust / вебв'ю не зсувається.
- Тексти, канали й пріоритети — нормативні таблиці [accessibility.md](../accessibility.md)
  §11.1 і §13 («Оголошення toggle_playback»), вони не змінюються. §4.2 і перелік підписок у
  §11.3 називають власником Оголошень переходу `App.tsx` — реалізація ці абзаци переписує.
- [CONTEXT.md](../../CONTEXT.md) §«Живе джерело»: керування звуком питає «це живе джерело?»,
  а не «це потік із профілю?».

## Відкриті питання

- **Межа модуля.** Поглинає `muteControl` і `transportControl` чи лишає їх сусідами, а сам бере
  лише реакцію на події? Від цього залежить, де живе запобіжник `pending`.
- **Одна класифікація переходу чи кілька функцій над спільним `sameSource`** — з огляду на стан
  після латки `preview-switch-keeps-mute` (`sameSource` у `playbackSource.ts`) і межу з
  `playback-source-module`.
- **Один шлях повернення звуку на зупинці:** лишити в `handleStop` підняття рівня до зупинки чи
  звести все до гілки `stopped`.
- **Невдача Автопереходу.** Дати їй `pending` і вибір поверхні за §3 ADR 2026-09-01 — це зміна
  поведінки: окремий запис-вада чи в межах цього?
- **Тестовий адаптер:** власний чи спільний з [ipc-seam-test-adapter](p2-ipc-seam-test-adapter.md).

## Критерії готовності

- [ ] `docs/help/` — обговорення видимої поведінки не змінює; якщо зміниться відповідь на
      невдачу Автопереходу, оновити розділ про попередній і наступний у
      [player.md](../help/en/player.md) і [uk/player.md](../help/uk/player.md)
- [ ] Обрано межу модуля: які події й команди він приймає, що лишається в `App.tsx`,
      `PlayerPanel.tsx` і гарячих клавішах
- [ ] Обрано форму класифікації переходу й шов для тестів; межу з `playback-source-module`
      зафіксовано в обох записах
- [ ] Запис переведено в `planned` з критеріями або закрито з причиною

## Документи

- [Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md) — звідки запис
- [preview-switch-keeps-mute](p2-preview-switch-keeps-mute.md) — латка 0.1.1, клас якої модуль прибирає
- [zero-volume-reads-as-muted](done/p2-zero-volume-reads-as-muted.md) — звідки модель тиші
- [transport-skip-silent-failure](done/p1-transport-skip-silent-failure.md) — звідки вибір поверхні в `transportControl`
- ADR 2026-08-16, 2026-09-01, 2026-09-15 — посилання в «Обмеженнях»; сусіди партії — у «Напрямі»
- [CONTEXT.md](../../CONTEXT.md) — Вимкнений звук, Живе джерело, Головна кнопка, Автоперехід
